# aws-cross-account-manager

Source code for the AWS solution [Cross Account Manager](https://aws.amazon.com/answers/account-management/cross-account-management).

## CloudFormation templates

- aws-cross-account-manager-master.template
- aws-cross-account-manager-sub.template

## Lambda source code

- code/cross-account-handler/index.js
- code/cross-account-handler/lib/accessLinks_handler.js
- code/cross-account-handler/lib/ddb_helper.js		
- code/cross-account-handler/lib/file_handler.js		
- code/cross-account-handler/lib/s3_helper.js
- code/cross-account-handler/lib/account_init.js		
- code/cross-account-handler/lib/event_handler.js
- code/cross-account-handler/lib/helper.js		
- code/cross-account-handler/lib/iam_helper.js		
- code/cross-account-handler/lib/sns_helper.js

## Sample input files

- accounts.yaml
- roles.yaml
- Administrator.json
- Read-Only.json

***

Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://aws.amazon.com/asl/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
