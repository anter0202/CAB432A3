// Cognito Confirm Sign Up Demo Script
// Run with: node confirm.js

require('dotenv').config();
const cognito = require('./cognito');

// Configuration - Update these values
const username = process.env.COGNITO_TEST_USERNAME || 'matt';
const confirmationCode = process.env.COGNITO_CONFIRMATION_CODE || '123456'; // Replace with code from email

async function confirmSignUp() {
    try {
        console.log('🚀 Attempting to confirm user signup...');
        console.log(`   Username: ${username}`);
        console.log(`   Confirmation Code: ${confirmationCode}`);
        console.log('');

        const result = await cognito.confirmSignUp(username, confirmationCode);

        console.log('✅ Email confirmed successfully!');
        console.log(`   ${result.message}`);
        console.log('');
        console.log('🎉 User is now ready to authenticate.');
        console.log('   Run: node authenticate.js');

    } catch (error) {
        console.error('❌ Confirmation failed:', error.name || error.message);
        
        if (error.name === 'CodeMismatchException') {
            console.error('   Invalid confirmation code. Please check your email and try again.');
        } else if (error.name === 'ExpiredCodeException') {
            console.error('   Confirmation code has expired.');
            console.error('   Run: node resendCode.js to get a new code.');
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

confirmSignUp();

