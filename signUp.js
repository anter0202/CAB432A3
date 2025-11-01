// Cognito Sign Up Demo Script
// Run with: node signUp.js

require('dotenv').config();
const cognito = require('./cognito');

// Configuration - Update these values from your Cognito User Pool
const username = process.env.COGNITO_TEST_USERNAME || 'matt';
const password = process.env.COGNITO_TEST_PASSWORD || 'Password123!';
const email = process.env.COGNITO_TEST_EMAIL || 'your-email@example.com';

async function signUp() {
    try {
        console.log('🚀 Attempting to sign up user...');
        console.log(`   Username: ${username}`);
        console.log(`   Email: ${email}`);
        console.log('');

        const result = await cognito.signUp(username, password, email);

        console.log('✅ User signed up successfully!');
        console.log(`   User Sub: ${result.userSub}`);
        console.log(`   Delivery Method: ${result.codeDeliveryDetails?.DeliveryMedium || 'Email'}`);
        console.log(`   Destination: ${result.codeDeliveryDetails?.Destination || 'N/A'}`);
        console.log('');
        console.log('📧 Please check your email for the confirmation code.');
        console.log('   Then run: node confirm.js');

    } catch (error) {
        console.error('❌ Sign up failed:', error.name || error.message);
        
        if (error.name === 'UsernameExistsException') {
            console.error('   User already exists. Try a different username.');
        } else if (error.name === 'InvalidParameterException') {
            console.error('   Invalid parameters. Check username, email, and password.');
        } else if (error.name === 'InvalidPasswordException') {
            console.error('   Password does not meet requirements:');
            console.error('   - 8 character(s) minimum');
            console.error('   - Contains at least 1 number');
            console.error('   - Contains at least 1 uppercase letter');
            console.error('   - Contains at least 1 lowercase letter');
            console.error('   - Contains at least 1 symbol');
        } else if (error.message.includes('COGNITO_CLIENT_ID')) {
            console.error('');
            console.error('   Missing configuration. Please set:');
            console.error('   - COGNITO_USER_POOL_ID');
            console.error('   - COGNITO_CLIENT_ID');
            console.error('   - COGNITO_CLIENT_SECRET (if required)');
            console.error('');
            console.error('   Add these to your .env file or environment variables.');
        }
        
        process.exit(1);
    }
}

signUp();

