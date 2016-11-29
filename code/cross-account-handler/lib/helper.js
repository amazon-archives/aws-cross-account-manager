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
 * This module has the generic helper functions for this solution
 */

"use strict";

var AWS = require('aws-sdk');
var Promise = require('promise');
var https = require('https');
var HOST = 'metrics.awssolutionsbuilder.com';
var PATH = '/generic';
var DDB_Helper = require("./ddb_helper.js");

/*
 * Private: This function uses CloudFormation api to get the outputs from the solution stack created in the master account.
 */
function _getCFStackOutputs(invokedFunctionArn) {
	return new Promise(function(resolve, reject) {
		var cf = new AWS.CloudFormation();

		// Parse the stack name from the context.invokedFunctionArn
		var strArr = invokedFunctionArn.split(':')[6].split('-');
		strArr.splice(-2);
		var stack_name = strArr.join('-');

		cf.describeStacks({StackName: stack_name}, function(err, data) {
		  if (err) {
			  console.log(err, err.stack); 
			  reject(err);
		  }
		  else  {
			  resolve(data.Stacks[0].Outputs);
			}
		  });
	});
}

exports.getCFStackOutputs = _getCFStackOutputs;

/*
 * Private: This function is calling the Amazon Backend metrics REST api to post the anonymous data
 */
function _callBackendMetricsAPI(anonymousData, uuid) {
	return new Promise(function(resolve, reject) {
		  // Build the post string from an object
		  var post_data = JSON.stringify({
		      'Solution' : 'SO0015',
		      'UUID': uuid,
		      'TimeStamp': Date(),
		      'Data' : anonymousData
		  });

		  // An object of options to indicate where to post to
		  var post_options = {
		      host: HOST,
		      port: '443',
		      path: PATH,
		      method: 'POST',
		      headers: {
		          'Content-Type': 'application/json',
		          'Content-Length': Buffer.byteLength(post_data)
		      }
		  };

		  // Set up the request
		  var post_req = https.request(post_options, function(res) {
		      res.setEncoding('utf8');
		      res.on('data', function (chunk) {
		      });
		  });		
		  
		  // post the data
		  post_req.write(post_data);
		  post_req.end();
		  resolve();
	});
}

/*
 * Public: This function collects the anonymous data and posts it to Amazon backend metrics only if the customer has opt-in
 */
exports.sendAnonymousData = function(context) {
	var senddata = 'NO';
	var uuid = '';

	// Get the stack outputs to determine if customer has opt-in for anonymous data or not
	_getCFStackOutputs(context.invokedFunctionArn).then(function(outputs){
		outputs.map(function (output) {
			if (output.OutputKey == 'AnonymousData') {
				senddata = output.OutputValue.toUpperCase();
			}
			if (output.OutputKey == 'UUID') {
				uuid = output.OutputValue;
			}
		});	
		var accounts=0, roles=0, acc_roles=0;

		// If customer has opt-in, collect and post the anonymous data
		if (senddata == 'YES') {
			DDB_Helper.getListOfItems('CrossAccountManager-Accounts', function(err, data){
				if (data) {
					accounts = data.length;
					DDB_Helper.getListOfItems('CrossAccountManager-Roles', function(err, data){
						roles = data.length;
						DDB_Helper.getListOfItems('CrossAccountManager-Account-Roles', function(err, data){
							acc_roles = data.length;
							
							var anonymousData = {
									'accounts' : accounts,
									'roles' : roles,
									'account-roles' : acc_roles
							};
							_callBackendMetricsAPI(anonymousData, uuid);
						});
					});
				}
			});
		}
	});
}
