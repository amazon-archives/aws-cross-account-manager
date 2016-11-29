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
"use strict";

var AWS = require('aws-sdk');
var DDB_Helper = require("./ddb_helper.js");
var S3_Helper = require("./s3_helper.js");
var Helper = require("./helper.js");
var pre_html = '<!doctype html><html><head><title>Cross Account Manager Links</title><style>body {border: 0;font-family: sans-serif;font-size: 100%;font-weight: bold;margin: 20;padding: 20;}</style></head><body><h1 style="color: darkorange;">AWS Console Access</h1>';
var post_html = '</body></html>';

/*
 * This function updates the access links static webpage with shortcut 
 * links to the accounts/roles managed by the solution.
 */
exports.handleAccessLinksEvent = function(event, context, callback) {
	try 
	{
		var s3 = new AWS.S3();
		var message = JSON.parse(event.Records[0].Sns.Message);
		console.log(message.Action + ":" + message.Role + ":" + message.SubAccountId);

		var role = "";
		var body_html = "";
		
		
		// Get all accounts managed by solution from Dynamo DB
		DDB_Helper.getAccountsByAccountGroup('*').then(function (accountItems) {
			var accounts = {};
			
			// Create a hashmap of account information by account ID
			accountItems.map(function (item) {
				accounts[item.AccountId] = item;
			});
			
			// Get all active accounts / roles combination in use
			DDB_Helper.getActiveAccountAndRoles().then(function (accRoles) {
				// For each combination create a shortcut URL
				accRoles.forEach(function(accRoleItem) {
					if (role != accRoleItem.Role)
						body_html += '<h2>'+accRoleItem.Role+'</h2>';
					role = accRoleItem.Role;
					body_html += '<div><p style="font-weight: normal;"><a style="color: darkorange;" href="https://signin.aws.amazon.com/switchrole?account='+accRoleItem.AccountId+'&roleName='+accRoleItem.Role+'" target="_blank">'+accounts[accRoleItem.AccountId].Email+'</a>  </br>'+accRoleItem.AccountId+'  ';
					if (accounts[accRoleItem.AccountId].AccountGroup != '*')
						body_html += '('+accounts[accRoleItem.AccountId].AccountGroup+')';
					body_html += '</p></div>';
				});

				// Get the Access Links bucket name from the Stack Outputs
				Helper.getCFStackOutputs(context.invokedFunctionArn).then(function(outputs){
					outputs.map(function (output) {
						if (output.OutputKey == 'AccessLinksBucket') {
							var bucket = output.OutputValue;
							
							// Put the webpage in the access links bucket as cross-account-manager-links.html
							s3.putObject({Bucket: bucket,
								Key: 'cross-account-manager-links.html',
								Body: pre_html+body_html+post_html,
								ContentType: 'text/html'
							}, function(err, data) {
								if (err) {
									console.log(err, err.stack); 
									callback(err, null);
								}
							});
						}
					});				
				});

			});				
		});

	} catch (e) {
		console.error(e, e.stack);
		callback(e, null);
	}		
}


