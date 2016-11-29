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
 * This module has functions to perform all IAM related activities in master and sub-accounts.
 */

"use strict";

var Promise = require('promise');
var AWS = require('aws-sdk');

/*
 * Public: This function creates the permission policy for CrossAccountManager-* roles in master account
 */
exports.createPolicyDoc = function(roleName, accounts) {
	return new Promise(function(resolve, reject) {
		try {
			var accountsArn = [];
			
			console.log("Creating JSON policy document for accounts = " + accounts);

			accounts.forEach(function(account) {
				accountsArn.push('arn:aws:iam::' + account + ':role/' + roleName);
			});

			if (accountsArn.length > 0) {
				return resolve({
					Version : "2012-10-17",
					Statement : [ 
					{
						Effect : "Allow",
						Action : [ "sts:AssumeRole" ],
						Resource : accountsArn
					}, 
			        {
			            "Effect": "Allow",
			            "Action": [
			                "s3:Get*",
			                "s3:List*"
			            ],
			            "Resource": "*"
			        }
					]
				});
			} else {
				return resolve();
			}
		}
		catch (e) {
			console.error(e, e.stack);
			return reject();
		}
	});
}

/*
 * Public: This function updates the CrossAccountManager-* role policy in master account
 */
exports.updateRolePolicy =  function(roleName, rolePolicy) {
	return new Promise(function(resolve, reject) {
		try {
			var iam = new AWS.IAM();

			iam.getRole({
				RoleName : roleName
			}, function(err, data) {
				if (err) {
					console.log("ROLE does not exist " + roleName);
					console.log(err, err.stack); 
					return reject(err);
				} else {
					iam.putRolePolicy({
						PolicyDocument : rolePolicy,
						PolicyName : roleName + '-Permission',
						RoleName : roleName
					}, function(err, data) {
						if (err) {
							console.log("Failed to update policy for role: " + roleName);
							console.log(err, err.stack); 
							return reject(err);
						} else {
							console.log("Updated POLICY: " + roleName);
							return resolve(roleName);
						}
					});					
				}
			});
		}
		catch (e) {
			console.error(e, e.stack);
			return reject();
		}
	});			
}

/*
 * Public: This function deletes the CrossAccountManager-* role policy in master account
 */
exports.deleteRolePolicy = function(roleName) {
	return new Promise(function(resolve, reject) {
		try {
			var iam = new AWS.IAM();

			iam.getRole({
				RoleName : roleName
			}, function(err, data) {
				if (err) {
					console.log("ROLE does not exist " + roleName);
					console.log(err, err.stack); 
					return reject(err);
				} else {
					iam.deleteRolePolicy({
						PolicyName : roleName + '-Permission',
						RoleName : roleName
					}, function(err, data) {
						if (err) {
							console.log("ROLE policy does not exist " + roleName);
							console.log(err, err.stack); 
							return reject(err);
						} else {
							console.log("Deleted ROLE policy " + roleName);
						}
					});
				}
			});
		}
		catch (e) {
			console.error(e, e.stack);
			return reject();
		}
	});						
}


/*
 * Public: This function deletes the CrossAccountManager-* role in Master or Sub-account
 */
exports.deleteIamRole = function(roleName, Credentials) {
	return new Promise(function(resolve, reject) {
		try {
			
			//If Credentials are provided use that to delete the IAM role i.e. sub-account
			if ( typeof Credentials !== 'undefined' && Credentials ) {
				var creds = new AWS.Credentials(Credentials.AccessKeyId,  Credentials.SecretAccessKey,  Credentials.SessionToken);
				var iam = new AWS.IAM({credentials: creds});
			} else {
				var iam = new AWS.IAM();
			}

			iam.getRole({
				RoleName : roleName
			}, function(err, data) {
				if (err) {
					console.log("ROLE does not exist " + roleName + ". No action taken.");
					console.log(err, err.stack); 
					return resolve(roleName);
				} else {
					console.log("ROLE exists " + roleName);
					iam.deleteRolePolicy({
						PolicyName : roleName + '-Permission',
						RoleName : roleName
					}, function(err, data) {
						iam.deleteRole({
							RoleName : roleName
						}, function(err, data) {
							if (err) {
								console.log("ERROR deleting ROLE: " + roleName);
								console.log(err, err.stack); 
								return reject(err);
							} else {
								console.log("Deleted ROLE " + roleName);
								return resolve(roleName);
							}
						});
					})

				}
			});
		}
		catch (e) {
			console.error(e, e.stack);
			return reject();
		}
	});
}

/*
 * Public: This function creates the CrossAccountManager-* role in Master or Sub-account
 */
exports.createIamRole = function(roleName, assumeRolePolicy, rolePolicy, Credentials) {
	return new Promise(function(resolve, reject) {
		try {
			
			//If Credentials are provided use that to delete the IAM role i.e. sub-account
			if ( typeof Credentials !== 'undefined' && Credentials ) {
				var creds = new AWS.Credentials(Credentials.AccessKeyId,  Credentials.SecretAccessKey,  Credentials.SessionToken);
				var iam = new AWS.IAM({credentials: creds});
			} else {
				var iam = new AWS.IAM();
			}

			iam.createRole({
				AssumeRolePolicyDocument : assumeRolePolicy,
				RoleName : roleName
			}, function(err, data) {
				if (err) {
					console.log("ERROR Creating ROLE: " + roleName);
					console.log(err, err.stack); 
					return reject(err);
				} else {
					console.log("Created ROLE: " + roleName);

					if (rolePolicy) {
						iam.putRolePolicy({
							PolicyDocument : rolePolicy,
							PolicyName : roleName + '-Permission',
							RoleName : roleName
						}, function(err, data) {
							if (err) {
								console.log("ERROR Creating Policy for role : " + roleName);
								console.log(err, err.stack); 
								return reject(err);
							} else {
								console.log("Created POLICY: " + roleName);
								return resolve(roleName);
							}
						});
					} else {
						return resolve(roleName);
					}

				}
			});
		}
		catch (e) {
			console.error(e, e.stack);
			return reject();
		}		

	});

}
