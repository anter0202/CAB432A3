// Cognito Authenticate Demo Script
// Run with: node authenticate.js

require('dotenv').config();
const cognito = require('./cognito');

// Configuration - Update these values
const username = process.env.COGNITO_TEST_USERNAME || 'matt';
const password = process.env.COGNITO_TEST_PASSWORD || 'Password123!';

async function authenticate() {
    try {
        console.log('🚀 Attempting to authenticate user...');
        console.log(`   Username: ${username}`);
        console.log('');

        const result = await cognito.authenticate(username, password);

        console.log('✅ Authentication successful!');
        console.log('');
        console.log('📋 Tokens received:');
        console.log(`   Access Token: ${result.accessToken.substring(0, 50)}...`);
        console.log(`   ID Token: ${result.idToken.substring(0, 50)}...`);
        console.log(`   Refresh Token: ${result.refreshToken.substring(0, 50)}...`);
        console.log(`   Expires In: ${result.expiresIn} seconds`);
        console.log('');

        // Decode and display ID token contents
        console.log('🔍 ID Token Contents:');
        try {
            const tokenPayload = cognito.decodeToken(result.idToken);
            console.log(JSON.stringify(tokenPayload, null, 2));
        } catch (error) {
            console.log('   Could not decode token:', error.message);
        }
        
        console.log('');

        // Verify token (requires USER_POOL_ID)
        if (process.env.COGNITO_USER_POOL_ID) {
            console.log('✅ Verifying ID token...');
            try {
                const verifiedPayload = await cognito.verifyToken(result.idToken);
                console.log('✅ Token verified successfully!');
                console.log(`   User: ${verifiedPayload['cognito:username'] || verifiedPayload.username}`);
                console.log(`   Email: ${verifiedPayload.email}`);
                console.log(`   Email Verified: ${verifiedPayload.email_verified}`);
            } catch (verifyError) {
                console.log('⚠️  Token verification failed:', verifyError.message);
            }
        } else {
            console.log('⚠️  Skipping token verification (COGNITO_USER_POOL_ID not set)');
        }

        console.log('');
        console.log('💡 Use the ID Token in Authorization header:');
        console.log('   Authorization: Bearer ' + result.idToken.substring(0, 50) + '...');

    } catch (error) {
        console.error('❌ Authentication failed:', error.name || error.message);
        
        if (error.name === 'NotAuthorizedException') {
            console.error('   Invalid username or password.');
        } else if (error.name === 'UserNotConfirmedException') {
            console.error('   User email not confirmed.');
            console.error('   Please run: node confirm.js first');
        } else if (error.name === 'UserNotFoundException') {
            console.error('   User not found. Make sure you ran signUp.js first.');
        } else if (error.message.includes('COGNITO_CLIENT_ID')) {
            console.error('');
            console.error('   Missing configuration. Please set:');
            console.error('   - COGNITO_USER_POOL_ID');
            console.error('   - COGNITO_CLIENT_ID');
            console.error('   - COGNITO_CLIENT_SECRET (if required)');
        }
        
        process.exit(1);
    }
}

authenticate();

