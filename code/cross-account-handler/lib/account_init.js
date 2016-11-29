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
 * Entry point for the lambda function for account init. 
 * Each handler function is called from the respective Lambda function in master and sub account. 
 */

"use strict";

var AWS = require('aws-sdk');
var https = require("https");
var url = require("url");
var params = {};

/*
 * This function sends the response back to the stack since this lambda function is uses as custom resource
 * during the stack initialization and destruction
 */

function sendResponse(event, callback, logStreamName, status, data, err) {
	var reason = err ? err.message : '';
	var responseBody = {
		StackId : event.StackId,
		RequestId : event.RequestId,
		LogicalResourceId : event.LogicalResourceId,
		PhysicalResourceId : logStreamName,
		Status : status,
		Reason : reason + " See details in CloudWatch Log: " + logStreamName,
		Data : data
	};

	console.log("RESPONSE:\n", responseBody);
	var json = JSON.stringify(responseBody);

	const parsedUrl = url.parse(event.ResponseURL);
	const options = {
		hostname : parsedUrl.hostname,
		port : 443,
		path : parsedUrl.path,
		method : "PUT",
		headers : {
			"content-type" : "",
			"content-length" : json.length
		}
	};

	const request = https.request(options, function(response) {
		console.log("STATUS: " + response.statusCode);
		console.log("HEADERS: " + JSON.stringify(response.headers));
		callback(null, 'Successfully sent stack response!');
	});

	request.on("error", function(error) {
		console.log("sendResponse Error:\n", error);
		callback(err);
	});

	request.write(json);
	request.end();
}

/*
 * This callback function to delete all solution managed roles (CrossAccountManager-*) roles from account.
 */
function _listroles_callback(err, data) {
	var iam = new AWS.IAM();
	
	if (err) {
		console.error("Unable to listRoles. Error JSON:", JSON.stringify(err, null, 2));
	} else {
		try {
			data.Roles.forEach(function(item) {
				var roleName = item.RoleName;
				
				if (roleName != 'CrossAccountManager-Admin-DO-NOT-DELETE' && roleName.startsWith('CrossAccountManager-')) {
					iam.deleteRolePolicy({
						PolicyName : roleName + '-Permission',
						RoleName : roleName
					}, function(err, data) {
						if (err) {
							console.log("ROLE policy does not exist " + roleName);
						} else {
							console.log("Deleted ROLE policy " + roleName);
						}
						iam.deleteRole({
							RoleName : roleName
						}, function(err, data) {
							if (err) {
								console.log("ERROR deleting ROLE: " + roleName);
								console.log(err, err.stack); 
							} else {
								console.log("Deleted ROLE " + roleName);
							}
						});
					})					
				}
			});

			// continue if we have more roles
			if (data.IsTruncated == true) {
				console.log("data.Marker=" + data.Marker);
				console.log("data.IsTruncated=" + data.IsTruncated);
				params.Marker = data.Marker;
				iam.listRoles(params, _listroles_callback);
			}
		}
		catch (e) {
			console.error(e, e.stack);
		}
	}
}

/*
 * This function deletes all solution managed roles (CrossAccountManager-*) roles from account.
 */
function deleteCAMRoles() {
	console.log("Deleting CrossAccountManager-* roles managed by the solution");
	var iam = new AWS.IAM();
	
	try {
	    params = {
			PathPrefix: '/'
		};
	    iam.listRoles(params, function(err, data){
			_listroles_callback(err, data);
		});
	}
	catch (e) {
		console.error(e, e.stack);
	}			
}

/* This function is called when the sub-account template is deployed.
 * It pubslihses a message with action = ADD or REMOVE to the account topic in master account
 * It also remvoes the solution managed roles (CrossAccountManager-*) roles from the sub account
 */
function _initSubAccount(event, context, callback) {
	console.log('Started initSubAccount....');

	var sns = new AWS.SNS();
	var subAccountId = context.invokedFunctionArn.split(':')[4];
	var region = context.invokedFunctionArn.split(':')[3];
	var masterAccountId = event.ResourceProperties.MasterAccountID;

	console.log('subAccountId', subAccountId);
	console.log('region', region);
	console.log('masterAccountId', masterAccountId);

	var action = "ADD";
	
	if (event.RequestType == 'Delete') {
		action = "REMOVE";
		deleteCAMRoles();
	}
	
	var msg = {
			Action : action,
			SubAccountId : subAccountId
	};
	var topic = "arn:aws:sns:" + region + ":" + masterAccountId + ":CrossAccountManager-AccountTopic";
	
	var params = {
		Message : JSON.stringify(msg),
		TopicArn : topic
	};
	
	console.log('Publishing message: ' + JSON.stringify(msg) + " to " + topic);
	
	sns.publish(params, function(err, data) {
		if (err) {
			console.log(err, err.stack); 
			callback({Error: err});
		}
		else {
			console.log(data);
		    callback(null, {Success: "Successfully published the message"});
		}
	});
	console.log('Completed initSubAccount....');
}

//Called from index.js
exports.initSubAccount = function(event, context, callback) {
	_initSubAccount(event, context, function(err, result) {
		var status = err ? 'FAILED' : 'SUCCESS';
		sendResponse(event, callback, context.logStreamName, status, result, err);
	});
};

/* This function is called when the master-account template is deployed.
 * It does not do anything at the time of stack creation
 * It remvoes the solution managed roles (CrossAccountManager-*) roles from the master account when stack is deleted
 */
function _initMasterAccount(event, context, callback) {
	console.log('Started initMasterAccount....');

	if (event.RequestType == 'Delete') {
		deleteCAMRoles();
	}
	
    callback(null, {Success: "Successfully completed"});
    
	console.log('Completed initMasterAccount....');
}

// Called from index.js
exports.initMasterAccount = function(event, context, callback) {
	_initMasterAccount(event, context, function(err, result) {
		var status = err ? 'FAILED' : 'SUCCESS';
		sendResponse(event, callback, context.logStreamName, status, result, err);
	});
};