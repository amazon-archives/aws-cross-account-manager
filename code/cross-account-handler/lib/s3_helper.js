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
 * This module has functions to perform all S3 related activities in master account.
 */

"use strict";
var Promise = require('promise');
var AWS = require('aws-sdk');

/*
 * This function retrieves the file from S3 bucket. Used to retrieve account, role or policy files from config bucket.
 */
exports.getS3Object = function (bucket, key) {
	return new Promise(function(resolve, reject) {
		var s3 = new AWS.S3({signatureVersion: 'v4'});

		var params = {
				Bucket : bucket,
				Key : key
		}

		console.log("Reading file from S3 bucket: " + bucket + ", key: " + key );
		
		s3.getObject(params, function(err, data) {
			  if (err) {
				  console.error(err, err.stack); 
				  reject(err);
			  } else {
				  resolve(data.Body.toString());
			  }
		});
	});
}

/*
 * This function deletes the file from S3 bucket. Used to delete account or role files from config bucket.
 */
exports.deleteS3Object = function (bucket, key) {
	return new Promise(function(resolve, reject) {
		var s3 = new AWS.S3({signatureVersion: 'v4'});

		var params = {
				Bucket : bucket,
				Key : key
		}

		console.log("Deleting file from S3 bucket: " + bucket + ", key: " + key );
		
		s3.deleteObject(params, function(err, data) {
			  if (err) {
				  console.error(err, err.stack); 
				  reject(err);
			  } else {
				  resolve();
			  }
		});
	});
}
