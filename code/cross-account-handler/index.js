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

var fileHandler = require('./lib/file_handler.js');
var eventHandler = require('./lib/event_handler.js');
var accessLinksHandler = require("./lib/accessLinks_handler.js");
var accountInit = require("./lib/account_init.js");

/*
 * Entry point for the lambda functions. 
 * Each handler function is called from the respective Lambda function in master account. 
 */

exports.handleAccountS3File = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	fileHandler.handleAccountS3File(event, context, callback);
};

exports.handleAccountEvent = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	eventHandler.handleAccountEvent(event, context, callback);
};

exports.handleRoleS3File = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	fileHandler.handleRoleS3File(event, context, callback);
};

exports.handleRoleEvent = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	eventHandler.handleRoleEvent(event, context, callback);
};

exports.handleAccessLinksEvent = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	accessLinksHandler.handleAccessLinksEvent(event, context, callback);
};

exports.handleSubAccountInit = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	accountInit.initSubAccount(event, context, callback);
};

exports.handleMasterAccountInit = function(event, context, callback) {
	console.log('EVENT ' + JSON.stringify(event, null, 2));
	console.log('CONTEXT ' + JSON.stringify(context, null, 2));

	accountInit.initMasterAccount(event, context, callback);
};