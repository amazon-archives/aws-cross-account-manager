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
 * This module has the handler functions which are invoked in response to the messages posted on CrossAccountManager-Account and CrossAccountManager-Role Topics
 */

"use strict";

var Promise = require('promise');
var AWS = require('aws-sdk');
var Iam_Helper = require("./iam_helper.js");
var DDB_Helper = require("./ddb_helper.js");
var S3_Helper = require("./s3_helper.js");
var SNS_Helper = require("./sns_helper.js");

/*
 * This function is called whenever a new role has to be added or removed in a sub-account. It does the following
 * 1 - Gets the STS temporary tokens for the sub-account's CrossAccountManager-Admin-DO-NOT-DELETE role
 * 2 - Using the temporary tokens, it adds or removes CrossAccountManager-* role in sub-account
 * 3 - Updates the CrossAccountManager-AccountRoles table 
 * 4 - Publishes a message to CrossAccountManager-AccessLinks topic to update the static web page
 */
exports.handleRoleEvent = function(event, context, callback) {
	try{
		var sts = new AWS.STS();
		var message = JSON.parse(event.Records[0].Sns.Message);
		var action = message.Action.toUpperCase();
		var role = message.Role;
		var subAccountId = message.SubAccountId;
		var policy = JSON.parse(message.Policy);
		var masterAccountId = context.invokedFunctionArn.split(':')[4];
		var region = context.invokedFunctionArn.split(':')[3];
		var accessLinkstopic = "arn:aws:sns:" + region + ":" + masterAccountId + ":CrossAccountManager-AccessLinksTopic";
		var assumeRole = 'CrossAccountManager-Admin-DO-NOT-DELETE';

		console.log(action + ":" + subAccountId + ":" + role);

		// Get the temporary STS tokens for CrossAccountManager-Admin-DO-NOT-DELETE role in sub-account
		sts.assumeRole({
				RoleArn: 'arn:aws:iam::'+subAccountId+':role/CrossAccountManager-Admin-DO-NOT-DELETE',
				RoleSessionName: masterAccountId + '-handleRoleEvent'
			}, function(err, data) {
			if (err) {
				console.log(err, err.stack); 
				callback(e, null);
			}
			else {    
				// Assume Role policy for the role in sub-account. It restricts the access to master account.
				var assumeRolePolicy = {
						Version: "2012-10-17",
						Statement: {
							Effect: "Allow",
							Principal: {AWS: 'arn:aws:iam::' + masterAccountId + ':role/' + role},
							Action: "sts:AssumeRole"
						}
				}
				
				// Using the STS temporary tokens create the role in sub-account
				Iam_Helper.deleteIamRole(role, data.Credentials).then(setTimeout(function() {
					if (action == 'ADD') {
						// Add a new role in sub-account
						Iam_Helper.createIamRole(role, JSON.stringify(assumeRolePolicy), policy, data.Credentials).then(function (){
							// Update DynamoDB CrossAccountManager-Account-Roles table status to active
							DDB_Helper.updateAccountRoles(role, subAccountId, 'active').then(setTimeout(function(){
								// Publish a message to accessLinkstopic to update the static web page with shortcut URLs
								SNS_Helper.publishOnSNSTopic(accessLinkstopic, JSON.stringify({
									Action : action,
									SubAccountId : subAccountId,
									Role : role
								}));
							}, 3000));
						});
					} else {
						// Update DynamoDB CrossAccountManager-Account-Roles table status to deleted
						DDB_Helper.updateAccountRoles(role, subAccountId, 'deleted');
					}
				}, 60000));
			}
		});
	} catch (e) {
		console.error(e, e.stack);
		callback(e, null);
	}

}

/*
 * This function is called whenever a sub-account has successfully deployed the solution template.  It does the following
 * 1 - It updates the sub-account status from pending to active
 * 2 - It gets all the applicable roles for that sub-account
 * 3 - For each role, it updates the policy in master account, by adding or removing the sub-account ID
 * 4 - It retrieves the corresponding JSON policy docment from config bucket and publishes a message to CrossAccountManager-Role topic
 * 
 */
exports.handleAccountEvent = function(event, context, callback) {
	try{
		var ddb = new AWS.DynamoDB.DocumentClient();
		var iam = new AWS.IAM();
		var message = JSON.parse(event.Records[0].Sns.Message);
		var action = message.Action.toUpperCase();
		var subAccountId = message.SubAccountId;
		var masterAccountId = context.invokedFunctionArn.split(':')[4];
		var region = context.invokedFunctionArn.split(':')[3];
		
		console.log(action + ":" + subAccountId);
		
		// Get account information for this sub-account
		ddb.get({
			TableName: 'CrossAccountManager-Accounts',
			Key:{
				"AccountId": subAccountId
			}			
		}, function(err, account) {
			if (err) {
				console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
			} else {
				console.log("Found Account information");
				var account_group = account.Item.AccountGroup;
				var accountId = account.Item.AccountId;
				// Update the account status to active or deleted
				DDB_Helper.updateAccounts(accountId, account.Item.Email, account_group,(action == 'ADD') ? 'active' : 'deleted');
				
				// Get roles that apply to the account_group for this account. 
				DDB_Helper.getRolesByAccountGroup(account_group).then(function (roles) {
					console.log("Roles to update:", JSON.stringify(roles, null, 2));
					
					// Update each one of these roles in master account 
					roles.forEach(function(roleItem) {
						var role = roleItem.Role;

						// First check if the in-line policy for the role exists?
						iam.getRolePolicy({
							PolicyName: role + '-Permission',
							RoleName: role
						}, function(err, data) {
							if (err) {
								console.log(err, err.stack);
								
								// If not, create an in-line policy and update the role 
								if (action == "ADD") {
									Iam_Helper.createPolicyDoc(role, [accountId]).then(function (policy){
										console.log("Updating policy for role: " + role );
										Iam_Helper.updateRolePolicy(role, JSON.stringify(policy));

									});
								}
							}
							else {
								// Otherwise, retrieve the existing in-line policy for this role and add/remove the new sub-account 
								// to the list of accounts that it can switch role to.
								var policy = JSON.parse(decodeURIComponent(data.PolicyDocument));
								var resources = policy.Statement[0].Resource;
								var new_resource = 'arn:aws:iam::' + accountId + ':role/' + role;

								if (action == "ADD") {
									var index = resources.indexOf(new_resource);
									if (index < 0) {
										resources.push(new_resource);
									}

									console.log("Adding resource: " + new_resource  + " for Role: " + role);
									policy.Statement[0].Resource = resources;
									Iam_Helper.updateRolePolicy(role, JSON.stringify(policy));
								} else if (action == "REMOVE"){
									var index = resources.indexOf(new_resource);
									console.log("Removing resource: " + new_resource  + " for Role: " + role);
									if (index > -1) {
										resources.splice(index, 1);
									}
									
									if (resources.length > 0) {
										console.log("Updating policy for role: " + role );
										Iam_Helper.updateRolePolicy(role, JSON.stringify(policy));
									} else {
										console.log("Removing policy for role: " + role);
										Iam_Helper.deleteRolePolicy(role);
									}
								}
								
							}
							
							// Update the CrossAccountManager-Account-Roles table with the new account/role combination and publish a message to CrossAccountManager-Role topic
							DDB_Helper.updateAccountRoles(role, accountId, (action == 'ADD') ? 'pending' : 'deleted').then(function() {
								if (action == "ADD") {
									var roleTopic = "arn:aws:sns:" + region + ":" + masterAccountId + ":CrossAccountManager-RoleTopic";
									var bucket = roleItem.Policy.split(':')[0];
									var policyName = roleItem.Policy.split(':')[1];

									// Retrive the corresponding JSON policy document for this role from config bucket
									S3_Helper.getS3Object(bucket, 'custom_policy/'+policyName).then(function(fileContent) {
										var policy = JSON.stringify(fileContent);
										// Publish message on CrossAccountManager-Role topic to provision the role in sub-account
										SNS_Helper.publishOnSNSTopic(roleTopic, JSON.stringify({
											Action : action,
											SubAccountId : accountId,
											Role : role,
											Policy: policy
										}));
									});
								}
							});
						});

					});
				});	        
			}
		});
	} catch (e) {
		console.error(e, e.stack);
		callback(e, null);
	}
}
