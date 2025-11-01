# AWS Cognito Setup Guide for PhotoFilter Pro

This guide will help you complete the Cognito integration after creating your user pool.

## Step 1: Get Your Cognito Credentials

After creating your Cognito User Pool, you need to collect these three values:

### 1. User Pool ID

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Click on **User pools** in the left sidebar
3. Find your user pool (e.g., `n11470941-photofilter-pool`)
4. Click on the pool name
5. In the **Overview** page, copy the **User pool ID** (format: `ap-southeast-2_XXXXXXXXX`)

### 2. Client ID

1. In the same user pool details page, click **App clients** in the sidebar
2. You should see one app client - click on its name
3. Copy the **Client ID** (a long alphanumeric string)

### 3. Client Secret

1. Still in the **App client** details page
2. Look for **Client secret** - if it shows, copy it
3. If it's hidden, click **Show** to reveal it
4. **Important**: Copy this immediately - you won't be able to see it again!

## Step 2: Configure Environment Variables

Create or update your `.env` file in the project root:

```env
# Cognito Configuration
COGNITO_USER_POOL_ID=ap-southeast-2_XXXXXXXXX
COGNITO_CLIENT_ID=your-client-id-here
COGNITO_CLIENT_SECRET=your-client-secret-here
AWS_REGION=ap-southeast-2

# Test user (optional - for demo scripts)
COGNITO_TEST_USERNAME=matt
COGNITO_TEST_PASSWORD=Password123!
COGNITO_TEST_EMAIL=your-email@example.com
```

Or set them as environment variables:

```powershell
# Windows PowerShell
$env:COGNITO_USER_POOL_ID="ap-southeast-2_XXXXXXXXX"
$env:COGNITO_CLIENT_ID="your-client-id"
$env:COGNITO_CLIENT_SECRET="your-client-secret"
$env:AWS_REGION="ap-southeast-2"
```

```bash
# Linux/Mac/Bash
export COGNITO_USER_POOL_ID=ap-southeast-2_XXXXXXXXX
export COGNITO_CLIENT_ID=your-client-id
export COGNITO_CLIENT_SECRET=your-client-secret
export AWS_REGION=ap-southeast-2
```

## Step 3: Verify Authentication Flow is Enabled

1. In Cognito Console → Your User Pool → **App clients**
2. Click on your app client
3. Click **Edit** in the top right
4. Under **Authentication flows**, ensure:
   - ✅ **Sign in with username and password**: `ALLOW_USER_PASSWORD_AUTH` is checked
5. Click **Save changes**

## Step 4: Test Sign Up

Run the sign up script:

```bash
node signUp.js
```

Or edit `signUp.js` and set:
- `username` - your chosen username
- `password` - must meet Cognito requirements:
  - 8+ characters
  - Contains at least 1 number
  - Contains at least 1 uppercase letter
  - Contains at least 1 lowercase letter
  - Contains at least 1 symbol
- `email` - your email address (must be accessible)

Example:
```javascript
const username = 'matt';
const password = 'Password123!';
const email = 'matt@example.com';
```

**Expected Output:**
```
✅ User signed up successfully!
📧 Please check your email for the confirmation code.
```

## Step 5: Confirm Sign Up

1. Check your email for the confirmation code
2. Edit `confirm.js` and set:
   - `username` - same as in signUp.js
   - `confirmationCode` - the 6-digit code from email

3. Run:
```bash
node confirm.js
```

**Expected Output:**
```
✅ Email confirmed successfully!
🎉 User is now ready to authenticate.
```

## Step 6: Test Authentication

Edit `authenticate.js` and set:
- `username` - same as before
- `password` - same as before

Run:
```bash
node authenticate.js
```

**Expected Output:**
```
✅ Authentication successful!
📋 Tokens received:
   Access Token: eyJraWQiOiJ...
   ID Token: eyJraWQiOiJ...
   ...
```

The ID Token is what you'll use for authenticated API requests.

## Step 7: Verify in AWS Console

1. Go back to Cognito Console → Your User Pool → **Users**
2. You should see your user listed
3. The **Email verified** column should now show **Yes** (after confirmation)

## Troubleshooting

### "COGNITO_CLIENT_ID not configured"
- Make sure you've set environment variables or added them to `.env`
- Restart your terminal/Node process after setting environment variables

### "InvalidPasswordException"
- Password must meet all requirements:
  - 8+ characters
  - At least 1 number
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 symbol (e.g., !@#$%^&*)

### "UsernameExistsException"
- User already exists
- Try a different username or delete the user from Cognito Console

### "CodeMismatchException"
- Invalid confirmation code
- Check your email again for the correct 6-digit code

### "ExpiredCodeException"
- Confirmation code expired
- Run `node resendCode.js` to get a new code

### "UserNotConfirmedException"
- Email not confirmed yet
- Run `node confirm.js` first

### "NotAuthorizedException"
- Invalid username or password
- Make sure email is confirmed

## Next Steps

Once you've successfully tested the three scripts, you can:

1. **Integrate into your API** - The Cognito endpoints are already set up in `server.js`
2. **Update frontend** - Modify `api-script.js` to use Cognito endpoints
3. **Use tokens** - Use the ID Token in `Authorization: Bearer <token>` header

## API Endpoints Available

Your server already has these Cognito endpoints:

- `POST /api/cognito/signup` - Register new user
- `POST /api/cognito/confirm` - Confirm email
- `POST /api/cognito/login` - Login and get tokens
- `POST /api/cognito/resend-code` - Resend confirmation code

See `COGNITO-API.md` for detailed API documentation.

