// DynamoDB Helper Module for PhotoFilter Pro (QUT CAB432 Configuration)
require('dotenv').config();
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// QUT CAB432 Configuration
const QUT_USERNAME = process.env.QUT_USERNAME || 'n11470941@qut.edu.au';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || `${QUT_USERNAME.split('@')[0]}-photofilter-users`;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const SORT_KEY = 'username'; // Sort key for the table

// Load AWS credentials from .aws folder or environment variables
const path = require('path');
const fs = require('fs');
const ini = require('ini');

// Function to read credentials from INI file
function loadCredentialsFromFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = ini.parse(content);
        return parsed.default || parsed;
    } catch (err) {
        return null;
    }
}

// Try to load credentials from project .aws folder
const projectCredentialsPath = path.join(__dirname, '.aws', 'credentials');
const projectConfigPath = path.join(__dirname, '.aws', 'config');

let credentials = null;

// Check for credentials in project .aws folder
if (fs.existsSync(projectCredentialsPath)) {
    const creds = loadCredentialsFromFile(projectCredentialsPath);
    if (creds && creds.aws_access_key_id && creds.aws_secret_access_key) {
        credentials = {
            accessKeyId: creds.aws_access_key_id,
            secretAccessKey: creds.aws_secret_access_key,
            sessionToken: creds.aws_session_token || undefined // Session token is optional
        };
        console.log('✅ Loaded AWS credentials from project .aws/credentials');
    }
}

// Fallback to environment variables
if (!credentials && (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)) {
    credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
    };
    console.log('✅ Loaded AWS credentials from environment variables');
}

// Initialize DynamoDB Client
const clientConfig = {
    region: AWS_REGION
};

// Add credentials if we have them, otherwise SDK will use default credential chain
if (credentials) {
    clientConfig.credentials = credentials;
} else {
    console.warn('⚠️  No explicit credentials found. SDK will use default credential chain.');
}

const client = new DynamoDBClient(clientConfig);

const docClient = DynamoDBDocumentClient.from(client);

/**
 * User Data Model in DynamoDB (QUT CAB432 Requirements):
 * - Partition Key: qut-username (String) - must be your QUT username
 * - Sort Key: username (String) - the actual username for the app
 * - Attributes:
 *   - id: String (same as username)
 *   - username: String (stored as sort key)
 *   - password: String (hashed)
 *   - email: String
 *   - createdAt: String (ISO timestamp)
 *   - refreshTokens: Array of Strings
 *   - emailVerified: Boolean
 *   - emailVerificationToken: String (nullable)
 */

class UserRepository {
    /**
     * Get user by username
     */
    async getUserByUsername(username) {
        try {
            const command = new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    'qut-username': QUT_USERNAME,
                    [SORT_KEY]: username
                }
            });
            
            const result = await docClient.send(command);
            return result.Item || null;
        } catch (error) {
            console.error('Error getting user:', error);
            throw error;
        }
    }

    /**
     * Create a new user
     */
    async createUser(userData) {
        try {
            // Convert refreshTokens Set to Array for DynamoDB
            const userItem = {
                'qut-username': QUT_USERNAME,
                [SORT_KEY]: userData.username,
                id: userData.id || userData.username,
                password: userData.password,
                email: userData.email || '',
                createdAt: userData.createdAt,
                refreshTokens: userData.refreshTokens ? Array.from(userData.refreshTokens) : [],
                emailVerified: userData.emailVerified || false,
                emailVerificationToken: userData.emailVerificationToken || null
            };

            const command = new PutCommand({
                TableName: TABLE_NAME,
                Item: userItem,
                ConditionExpression: 'attribute_not_exists(#sortKey)', // Prevent overwriting existing users
                ExpressionAttributeNames: {
                    '#sortKey': SORT_KEY
                }
            });

            await docClient.send(command);
            return userItem;
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('Username already exists');
            }
            console.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Update user attributes
     */
    async updateUser(username, updates) {
        try {
            // Build update expression
            const updateExpressions = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};

            Object.keys(updates).forEach((key, index) => {
                const alias = `#attr${index}`;
                const valueAlias = `:val${index}`;
                updateExpressions.push(`${alias} = ${valueAlias}`);
                expressionAttributeNames[alias] = key;
                expressionAttributeValues[valueAlias] = updates[key];
            });

            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    'qut-username': QUT_USERNAME,
                    [SORT_KEY]: username
                },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            });

            const result = await docClient.send(command);
            return result.Attributes;
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    /**
     * Add refresh token to user
     */
    async addRefreshToken(username, refreshToken) {
        try {
            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    'qut-username': QUT_USERNAME,
                    [SORT_KEY]: username
                },
                UpdateExpression: 'SET refreshTokens = list_append(if_not_exists(refreshTokens, :emptyList), :token)',
                ExpressionAttributeValues: {
                    ':token': [refreshToken],
                    ':emptyList': []
                },
                ReturnValues: 'ALL_NEW'
            });

            const result = await docClient.send(command);
            return result.Attributes;
        } catch (error) {
            console.error('Error adding refresh token:', error);
            throw error;
        }
    }

    /**
     * Remove refresh token from user
     */
    async removeRefreshToken(username, refreshToken) {
        try {
            // First get the user to filter out the token
            const user = await this.getUserByUsername(username);
            if (!user || !user.refreshTokens) {
                return user;
            }

            // Filter out the token to remove
            const updatedTokens = user.refreshTokens.filter(token => token !== refreshToken);
            
            // If no change, token wasn't found
            if (updatedTokens.length === user.refreshTokens.length) {
                return user;
            }

            // Update with filtered tokens
            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    'qut-username': QUT_USERNAME,
                    [SORT_KEY]: username
                },
                UpdateExpression: 'SET refreshTokens = :tokens',
                ExpressionAttributeValues: {
                    ':tokens': updatedTokens
                },
                ReturnValues: 'ALL_NEW'
            });

            const result = await docClient.send(command);
            return result.Attributes;
        } catch (error) {
            console.error('Error removing refresh token:', error);
            throw error;
        }
    }

    /**
     * Clear all refresh tokens for a user
     */
    async clearRefreshTokens(username) {
        try {
            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    'qut-username': QUT_USERNAME,
                    [SORT_KEY]: username
                },
                UpdateExpression: 'SET refreshTokens = :emptyList',
                ExpressionAttributeValues: {
                    ':emptyList': []
                },
                ReturnValues: 'ALL_NEW'
            });

            const result = await docClient.send(command);
            return result.Attributes;
        } catch (error) {
            console.error('Error clearing refresh tokens:', error);
            throw error;
        }
    }

    /**
     * Check if refresh token exists for user
     */
    async hasRefreshToken(username, refreshToken) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user || !user.refreshTokens) {
                return false;
            }
            return user.refreshTokens.includes(refreshToken);
        } catch (error) {
            console.error('Error checking refresh token:', error);
            return false;
        }
    }

    /**
     * Find user by email verification token
     * Note: This uses Scan which is slower but necessary since we can't query by emailVerificationToken
     */
    async getUserByVerificationToken(token) {
        try {
            const command = new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: '#qutUsername = :qutUsername AND emailVerificationToken = :token',
                ExpressionAttributeNames: {
                    '#qutUsername': 'qut-username'
                },
                ExpressionAttributeValues: {
                    ':qutUsername': QUT_USERNAME,
                    ':token': token
                },
                Limit: 1
            });

            const result = await docClient.send(command);
            return result.Items && result.Items.length > 0 ? result.Items[0] : null;
        } catch (error) {
            console.error('Error finding user by verification token:', error);
            throw error;
        }
    }

    /**
     * Create the DynamoDB table if it doesn't exist
     * Call this once before using the repository
     */
    async ensureTableExists() {
        try {
            // Try to create the table
            const command = new CreateTableCommand({
                TableName: TABLE_NAME,
                AttributeDefinitions: [
                    {
                        AttributeName: 'qut-username',
                        AttributeType: 'S'
                    },
                    {
                        AttributeName: SORT_KEY,
                        AttributeType: 'S'
                    }
                ],
                KeySchema: [
                    {
                        AttributeName: 'qut-username',
                        KeyType: 'HASH' // Partition key
                    },
                    {
                        AttributeName: SORT_KEY,
                        KeyType: 'RANGE' // Sort key
                    }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 1,
                    WriteCapacityUnits: 1
                }
            });

            await client.send(command);
            console.log(`✅ DynamoDB table "${TABLE_NAME}" created successfully`);
            
            // Wait for table to be active
            console.log('⏳ Waiting for table to be active...');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            
            return true;
        } catch (error) {
            if (error.name === 'ResourceInUseException') {
                console.log(`✅ DynamoDB table "${TABLE_NAME}" already exists`);
                return true;
            }
            console.error('❌ Error creating table:', error.message);
            throw error;
        }
    }
}

module.exports = new UserRepository();
