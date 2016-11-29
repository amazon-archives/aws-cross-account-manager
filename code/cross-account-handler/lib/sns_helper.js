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
 * CAM stands for Cross Account Manager
 * This module has functions to perform all SNS related activities in master account.
 */

"use strict";
var Promise = require('promise');
var AWS = require('aws-sdk');

/*
 * This function removes the publish permission from topic. Used to remove sub-account permission for publishing to the CrossAccountManager-Account topic.
 */
exports.removePublishPermission = function(topic) {
	var sns = new AWS.SNS();
	return new Promise(function(resolve, reject) {
		sns.removePermission({
			Label : 'CAM',
			TopicArn : topic
		}, function (err, data) {
			if (err) {
				console.error(err, err.stack); 
				return resolve();
			} else if (data) {
				return resolve();
			}
		});
	});
}

/*
 * This function adds the publish permission from topic. Used to add sub-account permission for publishing to the CrossAccountManager-Account topic.
 */
exports.addPublishPermission = function(topic, accounts) {
	var sns = new AWS.SNS();
	return new Promise(function(resolve, reject) {
		sns.addPermission({
			AWSAccountId : accounts,
			ActionName : [ 'Publish' ],
			Label : 'CAM',
			TopicArn : topic
		}, function(err, data) {
			if (err) {
				console.error(err, err.stack); 
				return reject(err);
			} else if (data) {
				return resolve();
			}
		});
	});
}

/*
 * This function publishes a message to topic
 */
exports.publishOnSNSTopic = function (topic, message) {
	var sns = new AWS.SNS();
	return new Promise(function(resolve, reject) {
		var params = {
				TopicArn : topic,
				Message : message,
		};							

		console.log('Publishing message: ' + JSON.stringify(params) + " to " + topic);

		sns.publish(params, function(err, data) {
			if (err) {
				console.error(err, err.stack); 
				return reject(err);
			} else {
				return resolve();
			}
		});		
	});
}
