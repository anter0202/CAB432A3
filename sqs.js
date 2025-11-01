// AWS SQS Helper Module for PhotoFilter Pro (QUT CAB432 Configuration)
require('dotenv').config();
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } = require('@aws-sdk/client-sqs');

// SQS Configuration from environment variables
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const VISIBILITY_TIMEOUT = parseInt(process.env.SQS_VISIBILITY_TIMEOUT) || 30; // Default 30 seconds

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

let credentials = null;

// Check for credentials in project .aws folder
if (fs.existsSync(projectCredentialsPath)) {
    const creds = loadCredentialsFromFile(projectCredentialsPath);
    if (creds && creds.aws_access_key_id && creds.aws_secret_access_key) {
        credentials = {
            accessKeyId: creds.aws_access_key_id,
            secretAccessKey: creds.aws_secret_access_key,
            sessionToken: creds.aws_session_token || undefined
        };
    }
}

// Fallback to environment variables
if (!credentials && (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)) {
    credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
    };
}

// Initialize SQS Client
const clientConfig = {
    region: AWS_REGION
};

// Add credentials if we have them, otherwise SDK will use default credential chain
if (credentials) {
    clientConfig.credentials = credentials;
} else {
    console.warn('⚠️  No explicit credentials found. SDK will use default credential chain.');
}

const sqsClient = new SQSClient(clientConfig);

class SQSHelper {
    /**
     * Send a message to the SQS queue
     * @param {string} messageBody - The message body to send
     * @param {Object} messageAttributes - Optional message attributes (key-value pairs)
     * @param {number} delaySeconds - Optional delay in seconds before the message becomes available
     * @returns {Promise<Object>} The result containing MessageId
     */
    async sendMessage(messageBody, messageAttributes = {}, delaySeconds = 0) {
        try {
            if (!QUEUE_URL) {
                throw new Error('SQS_QUEUE_URL not configured. Please set it in .env or environment variables.');
            }

            const params = {
                QueueUrl: QUEUE_URL,
                MessageBody: typeof messageBody === 'string' ? messageBody : JSON.stringify(messageBody)
            };

            // Add delay if specified
            if (delaySeconds > 0) {
                params.DelaySeconds = delaySeconds;
            }

            // Add message attributes if provided
            if (Object.keys(messageAttributes).length > 0) {
                params.MessageAttributes = {};
                for (const [key, value] of Object.entries(messageAttributes)) {
                    params.MessageAttributes[key] = {
                        DataType: typeof value === 'string' ? 'String' : 'Number',
                        StringValue: typeof value === 'string' ? value : value.toString()
                    };
                }
            }

            const command = new SendMessageCommand(params);
            const response = await sqsClient.send(command);

            return {
                success: true,
                messageId: response.MessageId,
                md5OfBody: response.MD5OfMessageBody
            };
        } catch (error) {
            console.error('SQS send message error:', error);
            throw error;
        }
    }

    /**
     * Receive messages from the SQS queue
     * @param {number} maxNumberOfMessages - Maximum number of messages to receive (1-10, default: 1)
     * @param {number} waitTimeSeconds - Long polling wait time in seconds (0-20, default: 0)
     * @param {number} visibilityTimeout - Visibility timeout in seconds (default: from config)
     * @returns {Promise<Array>} Array of received messages
     */
    async receiveMessages(maxNumberOfMessages = 1, waitTimeSeconds = 0, visibilityTimeout = null) {
        try {
            if (!QUEUE_URL) {
                throw new Error('SQS_QUEUE_URL not configured. Please set it in .env or environment variables.');
            }

            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: Math.min(Math.max(1, maxNumberOfMessages), 10), // Clamp between 1-10
                WaitTimeSeconds: Math.min(Math.max(0, waitTimeSeconds), 20), // Clamp between 0-20
                AttributeNames: ['All'],
                MessageAttributeNames: ['All']
            };

            // Set visibility timeout if provided
            if (visibilityTimeout !== null) {
                params.VisibilityTimeout = visibilityTimeout;
            } else {
                params.VisibilityTimeout = VISIBILITY_TIMEOUT;
            }

            const command = new ReceiveMessageCommand(params);
            const response = await sqsClient.send(command);

            if (!response.Messages || response.Messages.length === 0) {
                return [];
            }

            // Parse messages and extract attributes
            return response.Messages.map(msg => ({
                messageId: msg.MessageId,
                receiptHandle: msg.ReceiptHandle,
                body: msg.Body,
                attributes: msg.Attributes,
                messageAttributes: msg.MessageAttributes,
                md5OfBody: msg.MD5OfBody
            }));
        } catch (error) {
            console.error('SQS receive messages error:', error);
            throw error;
        }
    }

    /**
     * Delete a message from the queue
     * @param {string} receiptHandle - The receipt handle of the message to delete
     * @returns {Promise<Object>} Success status
     */
    async deleteMessage(receiptHandle) {
        try {
            if (!QUEUE_URL) {
                throw new Error('SQS_QUEUE_URL not configured. Please set it in .env or environment variables.');
            }

            const params = {
                QueueUrl: QUEUE_URL,
                ReceiptHandle: receiptHandle
            };

            const command = new DeleteMessageCommand(params);
            await sqsClient.send(command);

            return {
                success: true,
                message: 'Message deleted successfully'
            };
        } catch (error) {
            console.error('SQS delete message error:', error);
            throw error;
        }
    }

    /**
     * Change the visibility timeout of a message
     * Useful for extending processing time
     * @param {string} receiptHandle - The receipt handle of the message
     * @param {number} visibilityTimeout - New visibility timeout in seconds
     * @returns {Promise<Object>} Success status
     */
    async changeMessageVisibility(receiptHandle, visibilityTimeout) {
        try {
            if (!QUEUE_URL) {
                throw new Error('SQS_QUEUE_URL not configured. Please set it in .env or environment variables.');
            }

            const params = {
                QueueUrl: QUEUE_URL,
                ReceiptHandle: receiptHandle,
                VisibilityTimeout: visibilityTimeout
            };

            const command = new ChangeMessageVisibilityCommand(params);
            await sqsClient.send(command);

            return {
                success: true,
                message: `Visibility timeout changed to ${visibilityTimeout} seconds`
            };
        } catch (error) {
            console.error('SQS change message visibility error:', error);
            throw error;
        }
    }

    /**
     * Get the queue URL (if configured)
     * @returns {string|null} The queue URL or null if not configured
     */
    getQueueUrl() {
        return QUEUE_URL || null;
    }
}

// Export singleton instance
const sqsHelper = new SQSHelper();
module.exports = sqsHelper;

