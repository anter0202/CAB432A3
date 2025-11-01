# DynamoDB Setup Guide for PhotoFilter Pro

This guide will help you set up DynamoDB as the database for PhotoFilter Pro.

## Prerequisites

1. AWS Account
2. AWS CLI configured (optional, for local development)
3. Node.js 14+ installed

## Step 1: Install Dependencies

```bash
npm install
```

This will install:
- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB Document client (easier to work with)

## Step 2: Configure AWS Credentials

You have three options for AWS credentials:

### Option A: AWS Credentials File (Recommended for Local Development)

Create/update `~/.aws/credentials`:

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY_ID
aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
```

### Option B: Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export AWS_REGION=us-east-1
```

### Option C: IAM Role (Recommended for Production)

If running on EC2, ECS, or Lambda, attach an IAM role with DynamoDB permissions.

## Step 3: Create DynamoDB Table

### Using AWS Console

1. Go to [AWS DynamoDB Console](https://console.aws.amazon.com/dynamodb/)
2. Click "Create table"
3. **Table name**: `PhotoFilterProUsers` (or set via `DYNAMODB_TABLE_NAME` env var)
4. **Partition key**: `username` (String)
5. Click "Create table"

### Using AWS CLI

```bash
aws dynamodb create-table \
    --table-name PhotoFilterProUsers \
    --attribute-definitions AttributeName=username,AttributeType=S \
    --key-schema AttributeName=username,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
```

### Using AWS CloudFormation/Terraform

```json
{
  "TableName": "PhotoFilterProUsers",
  "KeySchema": [
    {
      "AttributeName": "username",
      "KeyType": "HASH"
    }
  ],
  "AttributeDefinitions": [
    {
      "AttributeName": "username",
      "AttributeType": "S"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
```

## Step 4: Set IAM Permissions

Your AWS credentials need the following DynamoDB permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/PhotoFilterProUsers"
    }
  ]
}
```

## Step 5: Configure Environment Variables

Create a `.env` file or set environment variables:

```bash
# DynamoDB Configuration
DYNAMODB_TABLE_NAME=PhotoFilterProUsers
AWS_REGION=us-east-1

# AWS Credentials (if not using IAM roles)
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

Or use environment variables directly:

```bash
export DYNAMODB_TABLE_NAME=PhotoFilterProUsers
export AWS_REGION=us-east-1
```

## Step 6: Start the Application

```bash
npm start
```

The application will:
1. Connect to DynamoDB
2. Create the default user (`anter` / `kingkong`) if it doesn't exist
3. Start serving the API

## Table Schema

The DynamoDB table stores users with the following structure:

```
{
  "username": "string (Partition Key)",
  "id": "string",
  "password": "string (bcrypt hashed)",
  "email": "string",
  "createdAt": "string (ISO timestamp)",
  "refreshTokens": ["array of strings"],
  "emailVerified": boolean,
  "emailVerificationToken": "string | null"
}
```

## Troubleshooting

### Error: "Cannot find module '@aws-sdk/client-dynamodb'"

**Solution**: Run `npm install`

### Error: "The security token included in the request is invalid"

**Solution**: Check your AWS credentials are correctly configured

### Error: "ResourceNotFoundException: Requested resource not found"

**Solution**: 
1. Make sure the table name matches exactly
2. Check the table exists in the correct AWS region
3. Verify `DYNAMODB_TABLE_NAME` environment variable if using custom name

### Error: "AccessDeniedException"

**Solution**: Check IAM permissions for DynamoDB operations

### Using DynamoDB Local (for testing)

For local development without AWS:

```bash
# Install DynamoDB Local (Java required)
docker run -p 8000:8000 amazon/dynamodb-local

# Set endpoint
export AWS_ENDPOINT_URL=http://localhost:8000
```

Update `dynamodb.js` to support local endpoint (add to DynamoDBClient config):
```javascript
endpoint: process.env.AWS_ENDPOINT_URL || undefined
```

## Production Considerations

1. **Enable DynamoDB Point-in-Time Recovery** for backups
2. **Set up CloudWatch alarms** for table metrics
3. **Use IAM roles** instead of access keys where possible
4. **Enable encryption at rest** for sensitive data
5. **Consider creating a GSI** on `emailVerificationToken` for better query performance (currently uses Scan)

## Cost Estimation

With **PAY_PER_REQUEST** billing mode:
- **Free Tier**: 25 GB storage, 25 read/write units (enough for development)
- **After Free Tier**: ~$1.25 per million read requests, ~$1.25 per million write requests

For a small application with <1000 users and moderate traffic, costs are typically under $1/month.

