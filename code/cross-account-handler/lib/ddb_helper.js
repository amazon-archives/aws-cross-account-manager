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
 * This module has functions to read and update data from Dynamo DB tables. The solution manages its operation state in following tables:
 * CrossAccountManager-Accounts: maintains the state of sub-accounts managed by solution 
 * CrossAccountManager-Roles: maintains the state of roles managed by solution
 * CrossAccountManager-Account-Roles: maintains the state of roles provisioned into sub-accounts.
 */

"use strict";

var Promise = require('promise');
var AWS = require('aws-sdk');
var docClient = new AWS.DynamoDB.DocumentClient();
var list = [];
var params = {};
var table = '';

/*
 * Private: Callback function to handle dynamo db response and paginatation.
 */
function _dynamo_callback(err, data) {
	if (err) {
		console.error("Unable to scan the " + table + " table. Error JSON:", JSON.stringify(err, null, 2));
	} else {
		try {
			data.Items.forEach(function(item) {
				list.push(item);
			});

			// continue scanning if we have more accounts
			if (typeof data.LastEvaluatedKey != "undefined") {
				console.log("Scanning for more...");
				params.ExclusiveStartKey = data.LastEvaluatedKey;
				docClient.scan(params, _dynamo_callback);
			}
		}
		catch (e) {
			console.error(e, e.stack);
		}
	}
}

/*
 * Private: Function to scan Dynamo DB table for account, role or account-role data
 */
function _scanByAccountGroup(tableName, account_group, callback) {
	try {
		// Filter data by status = Active
		params = {
				TableName : tableName,
				FilterExpression: "(#status = :status)",
				ExpressionAttributeNames: {
					"#status": "Status"
				},
				ExpressionAttributeValues: {
					":status": 'active'
				}				
		};

		// Some more filtering based on tablename to handle account grouping feature
		if ((tableName == 'CrossAccountManager-Accounts' && account_group != '*')) {
			params.FilterExpression += ' and #account_group = :account_group';
			params.ExpressionAttributeNames['#account_group'] = 'AccountGroup';
			params.ExpressionAttributeValues[':account_group'] = account_group;
		} else if (tableName == 'CrossAccountManager-Roles') {
			params.FilterExpression += ' and (#account_group = :account_group1 OR #account_group = :account_group2)';
			params.ExpressionAttributeNames['#account_group'] = 'AccountGroup';
			params.ExpressionAttributeValues[':account_group1'] = account_group;
			params.ExpressionAttributeValues[':account_group2'] = '*';
		}

		// Scan DDB table based on filtering criteria
		docClient.scan(params, function(err, data){
			list = [];
			table = tableName;
			_dynamo_callback(err, data);
			console.log('Scaning ' + tableName + ' for Status=active, and AccountGroup = ' + account_group);
			return callback(null, list);
		});
	}
	catch (e) {
		console.error(e, e.stack);
		return callback(e);
	}
}

/*
 * Public: Function to get all items from a given table
 */
exports.getListOfItems = function (tableName, callback) {
	try {
		console.log("Scaning " + tableName + " table.");

		docClient.scan({ TableName : tableName }, function(err, data){
			list = [];
			table = tableName;
			_dynamo_callback(err, data);
			return callback(null, list);
		});
	}
	catch (e) {
		console.error(e, e.stack);
		return callback(e);
	}
}

/*
 * Public: Function to get account information by account_group from CrossAccountManager-Accounts table. 
 * If account_group = '*', it will return all accounts.
 * Else it only returns accounts with matching account_group 
 */
exports.getAccountsByAccountGroup = function(account_group) {
	return new Promise(function(resolve, reject) {
		_scanByAccountGroup('CrossAccountManager-Accounts', account_group, function(err, data) {
			if (err)
				return reject();
			else
				return resolve(data);
		});
	});
}

/*
 * Public: Function to get role information by account_group from CrossAccountManager-Roles table. 
 * If account_group = '*', it will return roles that can be applied to accounts that are not part of any group
 * Else it only returns roles with matching account_group 
 */
exports.getRolesByAccountGroup = function(account_group) {
	return new Promise(function(resolve, reject) {
		_scanByAccountGroup('CrossAccountManager-Roles', account_group, function(err, data) {
			if (err)
				return reject();
			else
				return resolve(data);
		});
	});
}

/*
 * Public: Function to get all items from CrossAccountManager-Account-Roles table with status = Active 
 */
exports.getActiveAccountAndRoles = function() {
	return new Promise(function(resolve, reject) {
		_scanByAccountGroup('CrossAccountManager-Account-Roles', '', function(err, data) {
			if (err)
				return reject();
			else
				return resolve(data);
		});
	});
}

/*
 * Public: Function to update item in CrossAccountManager-Account-Roles table
 */
exports.updateAccountRoles = function (roleName, account, status) {
	return new Promise(function(resolve, reject) {
		var params = {
				TableName : 'CrossAccountManager-Account-Roles',
				Item : {
					Role : roleName,
					AccountId: account.toString(),
					Status : status,
					Timestamp : new Date().getTime()
				}
		};

		docClient.put(params, function(err, data) {
			if (err) {
				console.error(err, err.stack); 
				return reject(err);
			} else {
				return resolve();
			}
		});
	});
}

/*
 * Public: Function to update item in CrossAccountManager-Accounts table
 */
exports.updateAccounts = function (account, email, account_group, status) {
	var params = {
			TableName : 'CrossAccountManager-Accounts',
			Item : {
				AccountId : account.toString(),
				Email : email,
				AccountGroup : account_group,
				Status : status,
				Timestamp : new Date().getTime()
			}
	};

	docClient.put(params, function(err, data) {
		if (err) {
			console.error(err, err.stack); 
			throw new Error(err);
		}
	});
}

