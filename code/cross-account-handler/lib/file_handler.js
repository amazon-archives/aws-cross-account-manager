/*
 * Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the "License"). You
 * may not use this file except in compliance with the License. A copy
 * of the License is located at
 *
 * http://aws.amazon.com/asl/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

/*
 * This module has the handler functions to process account and role YAML files uploaded to the Config bucket.
 */

"use strict";

var Promise = require('promise');
var AWS = require('aws-sdk');
var YAML = require("js-yaml");
var Iam_Helper = require("./iam_helper.js");
var DDB_Helper = require("./ddb_helper.js");
var SNS_Helper = require("./sns_helper.js");
var S3_Helper = require("./s3_helper.js");
var Helper = require("./helper.js");

/*
 * This function is called whenever a new account YAML file is uploaded to the config bucket by Administrator. It does following
 * 1 - It parses the file
 * 2 - It updates the CrossAccountManager-Accounts table with new sub-accounts, with status = pending 
 * 3 - It grants the sub-account permission to publish to the CrossAccountManager-Account topic in master account
 */
exports.handleAccountS3File = function(event, context, callback) {
	var ddb = new AWS.DynamoDB.DocumentClient();
	var bucket = event.Records[0].s3.bucket.name;
	var key = event.Records[0].s3.object.key;

	// Read the account YAML file from config bucket
	S3_Helper.getS3Object(bucket, key).then(function(fileContent) {
		return new Promise(function(resolve, reject) {
			try {
			var e = YAML.safeLoad(fileContent);
			var accounts = e.accounts[0];

			var masterAccountId = context.invokedFunctionArn.split(':')[4];
			var region = context.invokedFunctionArn.split(':')[3];
			var topic = "arn:aws:sns:" + region + ":" + masterAccountId + ":CrossAccountManager-AccountTopic";

			console.log("Granting ACCOUNTS: " + accounts + " permission to publish on topic: " + topic);
			
			// Grant Publish permission to sub accounts for Account Topic
			SNS_Helper.removePublishPermission(topic).then(function () {
				SNS_Helper.addPublishPermission(topic, Object.keys(accounts)).then(function (){
					// Store account information in CrossAccountManager-Accounts table in Dynamo DB
					Object.keys(accounts).map( function (account) {
						var account_properties = accounts[account];
						var email = account_properties.email;
						var account_group = account_properties.accountgroup  || "*";
						console.log("Storing ACCOUNT: " + account + " information into DynamoDB");

						// First check if the sub-account data exists?
						ddb.get({
							TableName : 'CrossAccountManager-Accounts',
							Key : { "AccountId" : account }
						}, function(err, data) {
							if (err) {
								console.error(err, err.stack); 
								callback(err, null);
							} else {
								// If the sub-account exists and is active, update the item
								if (data.Item !== undefined && data.Item.Status == 'active') {
									DDB_Helper.updateAccounts(account, email, account_group, 'active');
								} else {
									// Else create a new item 
									DDB_Helper.updateAccounts(account, email, account_group, 'pending');
								}
							}
						});
					});			
					resolve();
				});
			});
			} catch (e) {
				console.error(e, e.stack);
				callback(e, null);
				process.exit();
			}
		}).then(function (){
			S3_Helper.deleteS3Object(bucket, key);
		});
	});
	
	// Send anonymous data to Amazon if customer has opt-in
	Helper.sendAnonymousData(context);
}

/*
 * This function is called whenever a new role YAML file is uploaded to the config bucket by Administrator. It does following
 * 1 - It parses the file
 * 2 - For each role, it creates the CrossAccountManager-* role and policy in master account
 * 3 - For each role, it finds the sub-account that will require the role
 * 4 - For each sub-account, it updates the CrossAccountManager-Account-Roles table and publishes a message to CrossAccountManager-Role topic  
 */
exports.handleRoleS3File = function(event, context, callback) {
	var ddb = new AWS.DynamoDB.DocumentClient();
	var bucket = event.Records[0].s3.bucket.name;
	var key = event.Records[0].s3.object.key;

	S3_Helper.getS3Object(bucket, key).then(function(fileContent) {
		
		return new Promise(function(resolve, reject) {
		
		try {
		var e = YAML.safeLoad(fileContent);
		var roles = e.roles[0];

		Object.keys(roles).map( function (role, index, array) {
			var role_properties = roles[role];
			var action = role_properties.action.toUpperCase();
			var policy = role_properties.policy;
			var account_group = role_properties.accountgroup  || "*";
			var roleName = 'CrossAccountManager-' + role;
			var masterAccountId = context.invokedFunctionArn.split(':')[4];
			var region = context.invokedFunctionArn.split(':')[3];

			// Validation
			if (action != 'ADD' && action != 'REMOVE') {
				throw new Error('Invalid action found in ' + bucket + key + ' It should be either ADD or REMOVE');
			}
			
			if (policy == undefined) {
				throw new Error('Missing policy tag in ' + bucket + key + ' for role: ' + role);
			}
			
			if (roleName.length > 64) {
				throw new Error('Role name too long in  ' + bucket + key + ' for role: ' + role);
			}

			//Store in DDB
			var ddb_params = {
					TableName : 'CrossAccountManager-Roles',
					Item : {
						Role : roleName,
						Policy: bucket + ':' + policy,
						AccountGroup: account_group,
						Status : (action == 'ADD') ? 'active' : 'deleted',
						Timestamp : new Date().getTime()
					}
			};

			//Create CrossAccountManager-* role in master account
			var assumeRolePolicy = {
					Version: "2012-10-17",
					Statement: {
						Effect: "Allow",
						Principal: {Service: "ds.amazonaws.com"},
						Action: "sts:AssumeRole"
					}
			}
			
			// Get accounts that apply to the account_group for this role. 
			DDB_Helper.getAccountsByAccountGroup(account_group).then(function (accountItems) {
				var accounts = [];
				
				// Create an array of account IDs
				accountItems.map(function (item) { 
					accounts.push(item.AccountId)
				});
				
				// Add or remove the role and policy from Master account
				return new Promise(function(resolve, reject) {
					if (action == "ADD") {
						Iam_Helper.deleteIamRole(roleName).then(setTimeout(function() {
							Iam_Helper.createPolicyDoc(roleName, accounts).then(function (rolePolicy) {
								Iam_Helper.createIamRole(roleName, JSON.stringify(assumeRolePolicy), 
										JSON.stringify(rolePolicy)).then(function(_role) {
									// Update Dynamo DB CrossAccountManager-Roles table 
									ddb.put(ddb_params, function(err, data) {
										if (err) {
											console.error(err, err.stack); 
											callback(err, null);
										}
										setTimeout(resolve(), 10000);
									});
								}, function(error) {
									console.error(error, error.stack); 
									callback(error, null);
									process.exit();
								});
							});
						}, 10000));
					} else if (action == "REMOVE"){
						Iam_Helper.deleteIamRole(roleName).then(function(_role) {
							// Update Dynamo DB CrossAccountManager-Roles table 
							ddb.put(ddb_params, function(err, data) {
								if (err) {
									console.error(err, err.stack); 
									callback(err, null);
								}
								setTimeout(resolve(), 10000);
							});
						}, function(error) {
							console.error(error, error.stack); 
							callback(error, null);
							process.exit();
						});
					}
				}).then(setTimeout(function (){
					// Get the JSON policy file from config bucket
					S3_Helper.getS3Object(bucket, 'custom_policy/'+policy).then(function(fileContent) {
						accounts.forEach(function(account) {
							var status = (action == 'ADD') ? 'pending' : 'deleting';
							// For each sub-account, update the CrossAccountManager-Account-Roles table 
							DDB_Helper.updateAccountRoles(roleName, account, status).then(function() {
								var roleTopic = "arn:aws:sns:" + region + ":" + masterAccountId + ":CrossAccountManager-RoleTopic";
								var policy = JSON.stringify(fileContent);
								
								// For each sub-account, publish a message to CrossAccountManager-Role topic 
								// for provisioning the role in sub-account
								SNS_Helper.publishOnSNSTopic(roleTopic, JSON.stringify({
									Action : action,
									SubAccountId : account,
									Role : roleName,
									Policy: policy
								}));
							});
						});
						if (index == array.length-1) {
							resolve();
						}
						
					}, function(error) {
						console.error(error, error.stack); 
						callback(error, null);
						process.exit();
					});
				}, 3000));
			});
		});
		
		} catch (e) {
			console.error(e, e.stack);
			callback(e, null);
			process.exit();
		}
		}).then(function (){
			S3_Helper.deleteS3Object(bucket, key);
		});
	});
	
	// Send anonymous data to Amazon if customer has opt-in
	Helper.sendAnonymousData(context);
}
