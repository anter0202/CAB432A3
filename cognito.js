// AWS Cognito Helper Module for PhotoFilter Pro
require('dotenv').config();
const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand, GetUserCommand, ResendConfirmationCodeCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

// Cognito Configuration from environment variables
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Load AWS credentials (same pattern as dynamodb.js)
const path = require('path');
const fs = require('fs');
const ini = require('ini');

function loadCredentialsFromFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = ini.parse(content);
        return parsed.default || parsed;
    } catch (err) {
        return null;
    }
}

const projectCredentialsPath = path.join(__dirname, '.aws', 'credentials');
let credentials = null;

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

if (!credentials && (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)) {
    credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
    };
}

// Initialize Cognito Client
const clientConfig = {
    region: AWS_REGION
};

if (credentials) {
    clientConfig.credentials = credentials;
}

const cognitoClient = new CognitoIdentityProviderClient(clientConfig);

// JWT Verifier for validating Cognito tokens
let jwtVerifier = null;
if (USER_POOL_ID) {
    try {
        // If CLIENT_ID is available, use it for client-specific verification
        // Otherwise, set it to null explicitly to allow any client
        const verifierConfig = {
            userPoolId: USER_POOL_ID,
            tokenUse: 'id'
        };
        
        if (CLIENT_ID) {
            verifierConfig.clientId = CLIENT_ID;
        } else {
            // Explicitly set to null to allow tokens from any client
            verifierConfig.clientId = null;
        }
        
        jwtVerifier = CognitoJwtVerifier.create(verifierConfig);
    } catch (error) {
        console.warn('⚠️  JWT verifier not initialized:', error.message);
    }
}

class CognitoHelper {
    /**
     * Calculate the secret hash for Cognito authentication
     * Required when using a client secret
     */
    calculateSecretHash(username) {
        if (!CLIENT_SECRET) {
            return undefined;
        }
        const crypto = require('crypto');
        return crypto
            .createHmac('SHA256', CLIENT_SECRET)
            .update(username + CLIENT_ID)
            .digest('base64');
    }

    /**
     * Sign up a new user
     */
    async signUp(username, password, email) {
        try {
            if (!CLIENT_ID) {
                throw new Error('COGNITO_CLIENT_ID not configured');
            }

            const params = {
                ClientId: CLIENT_ID,
                Username: username,
                Password: password,
                UserAttributes: [
                    {
                        Name: 'email',
                        Value: email
                    }
                ]
            };

            // Add secret hash if client secret is configured
            const secretHash = this.calculateSecretHash(username);
            if (secretHash) {
                params.SecretHash = secretHash;
            }

            const command = new SignUpCommand(params);
            const response = await cognitoClient.send(command);

            return {
                success: true,
                userSub: response.UserSub,
                codeDeliveryDetails: response.CodeDeliveryDetails,
                message: 'User registered successfully. Please check your email for confirmation code.'
            };
        } catch (error) {
            console.error('Cognito signup error:', error);
            throw error;
        }
    }

    /**
     * Confirm user signup with verification code
     */
    async confirmSignUp(username, confirmationCode) {
        try {
            if (!CLIENT_ID) {
                throw new Error('COGNITO_CLIENT_ID not configured');
            }

            const params = {
                ClientId: CLIENT_ID,
                Username: username,
                ConfirmationCode: confirmationCode
            };

            // Add secret hash if client secret is configured
            const secretHash = this.calculateSecretHash(username);
            if (secretHash) {
                params.SecretHash = secretHash;
            }

            const command = new ConfirmSignUpCommand(params);
            await cognitoClient.send(command);

            return {
                success: true,
                message: 'Email confirmed successfully'
            };
        } catch (error) {
            console.error('Cognito confirmation error:', error);
            throw error;
        }
    }

    /**
     * Resend confirmation code
     */
    async resendConfirmationCode(username) {
        try {
            if (!CLIENT_ID) {
                throw new Error('COGNITO_CLIENT_ID not configured');
            }

            const params = {
                ClientId: CLIENT_ID,
                Username: username
            };

            // Add secret hash if client secret is configured
            const secretHash = this.calculateSecretHash(username);
            if (secretHash) {
                params.SecretHash = secretHash;
            }

            const command = new ResendConfirmationCodeCommand(params);
            const response = await cognitoClient.send(command);

            return {
                success: true,
                message: 'Confirmation code sent successfully',
                codeDeliveryDetails: response.CodeDeliveryDetails
            };
        } catch (error) {
            console.error('Cognito resend confirmation error:', error);
            throw error;
        }
    }

    /**
     * Authenticate user (login)
     */
    async authenticate(username, password) {
        try {
            if (!CLIENT_ID) {
                throw new Error('COGNITO_CLIENT_ID not configured');
            }

            const params = {
                ClientId: CLIENT_ID,
                AuthFlow: 'USER_PASSWORD_AUTH',
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password
                }
            };

            // Add secret hash if client secret is configured
            const secretHash = this.calculateSecretHash(username);
            if (secretHash) {
                params.AuthParameters.SECRET_HASH = secretHash;
            }

            const command = new InitiateAuthCommand(params);
            const response = await cognitoClient.send(command);

            if (response.AuthenticationResult) {
                return {
                    success: true,
                    accessToken: response.AuthenticationResult.AccessToken,
                    idToken: response.AuthenticationResult.IdToken,
                    refreshToken: response.AuthenticationResult.RefreshToken,
                    expiresIn: response.AuthenticationResult.ExpiresIn,
                    tokenType: response.AuthenticationResult.TokenType
                };
            } else {
                throw new Error('Authentication failed - no tokens returned');
            }
        } catch (error) {
            console.error('Cognito authentication error:', error);
            throw error;
        }
    }

    /**
     * Get user information from access token
     */
    async getUser(accessToken) {
        try {
            const command = new GetUserCommand({
                AccessToken: accessToken
            });
            const response = await cognitoClient.send(command);

            // Extract user attributes
            const userAttributes = {};
            response.UserAttributes.forEach(attr => {
                userAttributes[attr.Name] = attr.Value;
            });

            return {
                username: response.Username,
                attributes: userAttributes,
                userStatus: response.UserStatus
            };
        } catch (error) {
            console.error('Cognito get user error:', error);
            throw error;
        }
    }

    /**
     * Verify and decode JWT token
     */
    async verifyToken(idToken) {
        try {
            if (!jwtVerifier) {
                throw new Error('JWT verifier not initialized. Check COGNITO_USER_POOL_ID configuration.');
            }
            const payload = await jwtVerifier.verify(idToken);
            return payload;
        } catch (error) {
            // Don't log expected errors (e.g., when token is not a Cognito token)
            // These errors are caught by the authentication middleware and fallback to legacy JWT
            // Only log unexpected errors that might indicate a configuration issue
            if (error.message && error.message.includes('clientId must be provided')) {
                // This is a configuration error, not a token validation error
                // Suppress it since we handle it by setting clientId to null
                throw error;
            }
            // For other errors, rethrow silently - middleware will handle fallback
            throw error;
        }
    }

    /**
     * Extract user info from ID token (without verification - for development/testing)
     * Note: Use verifyToken for production
     */
    decodeToken(idToken) {
        try {
            // Decode without verification (for development/testing)
            const base64Url = idToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                Buffer.from(base64, 'base64')
                    .toString()
                    .split('')
                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('Token decode error:', error);
            throw error;
        }
    }
}

module.exports = new CognitoHelper();

