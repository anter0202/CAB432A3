// Cognito Resend Confirmation Code Script
// Run with: node resendCode.js

require('dotenv').config();
const cognito = require('./cognito');

// Configuration
const username = process.env.COGNITO_TEST_USERNAME || 'matt';

async function resendCode() {
    try {
        console.log('🚀 Resending confirmation code...');
        console.log(`   Username: ${username}`);
        console.log('');

        const result = await cognito.resendConfirmationCode(username);

        console.log('✅ Confirmation code sent successfully!');
        console.log(`   Delivery Method: ${result.codeDeliveryDetails?.DeliveryMedium || 'Email'}`);
        console.log(`   Destination: ${result.codeDeliveryDetails?.Destination || 'N/A'}`);
        console.log('');
        console.log('📧 Please check your email for the new confirmation code.');
        console.log('   Then run: node confirm.js');

    } catch (error) {
        console.error('❌ Failed to resend code:', error.name || error.message);
        
        if (error.name === 'UserNotFoundException') {
            console.error('   User not found. Make sure you ran signUp.js first.');
        } else if (error.name === 'InvalidParameterException') {
            console.error('   Username is required.');
        }
        
        process.exit(1);
    }
}

resendCode();

