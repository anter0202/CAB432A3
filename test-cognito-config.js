// Quick test script to verify Cognito configuration
require('dotenv').config();

console.log('🔍 Checking Cognito Configuration...\n');

const requiredVars = {
    'COGNITO_USER_POOL_ID': process.env.COGNITO_USER_POOL_ID,
    'COGNITO_CLIENT_ID': process.env.COGNITO_CLIENT_ID,
    'COGNITO_CLIENT_SECRET': process.env.COGNITO_CLIENT_SECRET,
    'AWS_REGION': process.env.AWS_REGION || 'ap-southeast-2'
};

let allConfigured = true;

for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
        if (key === 'COGNITO_CLIENT_SECRET') {
            console.log(`✅ ${key}: ***HIDDEN***`);
        } else {
            console.log(`✅ ${key}: ${value}`);
        }
    } else {
        console.log(`❌ ${key}: NOT SET`);
        allConfigured = false;
    }
}

console.log('');

if (allConfigured) {
    console.log('✅ All Cognito configuration is set!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Edit signUp.js with your test user details');
    console.log('  2. Run: node signUp.js');
    console.log('  3. Check your email for confirmation code');
    console.log('  4. Run: node confirm.js');
    console.log('  5. Run: node authenticate.js');
} else {
    console.log('❌ Some configuration is missing. Please check your .env file.');
}

