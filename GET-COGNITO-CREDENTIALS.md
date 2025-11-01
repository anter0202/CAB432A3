# Quick Guide: Get Your Cognito Credentials

After creating your Cognito User Pool, follow these steps to get the required credentials.

## Step 1: Get User Pool ID

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Click **User pools** in the left sidebar
3. Find your user pool (e.g., `n11470941-photofilter-pool`)
4. **Click on the pool name** (not the checkbox)
5. In the **Overview** tab, look for **User pool ID**
6. **Copy the User pool ID** - format: `ap-southeast-2_XXXXXXXXX`

## Step 2: Get Client ID and Client Secret

1. Still in your user pool details page
2. Click **App clients** in the left sidebar
3. You should see one app client listed
4. **Click on the app client name** (not the checkbox)
5. Find **Client ID** - copy this long alphanumeric string
6. Find **Client secret** - if visible, copy it. If hidden:
   - Click **Show** button next to it
   - **Copy immediately** - you won't be able to see it again after closing!

## Step 3: Add to .env File

Create or edit `.env` file in your project root:

```env
COGNITO_USER_POOL_ID=ap-southeast-2_YOUR_POOL_ID_HERE
COGNITO_CLIENT_ID=your-client-id-here
COGNITO_CLIENT_SECRET=your-client-secret-here
AWS_REGION=ap-southeast-2
```

**Important Notes:**
- Replace `YOUR_POOL_ID_HERE` with the actual User Pool ID from Step 1
- Replace `your-client-id-here` with the Client ID from Step 2
- Replace `your-client-secret-here` with the Client Secret from Step 2
- Keep the quotes if there are any special characters

## Step 4: Verify Configuration

After setting up `.env`, test with:

```bash
node signUp.js
```

If configured correctly, you should see:
```
✅ User signed up successfully!
```

If you see errors about missing configuration, check that:
- All three values are in `.env`
- No typos in variable names
- File is named exactly `.env` (not `.env.txt`)

## Visual Guide

```
AWS Cognito Console
└── User pools
    └── [Your Pool Name] ← Click here
        ├── Overview
        │   └── User pool ID ← Copy this
        └── App clients ← Click here
            └── [App Client Name] ← Click here
                ├── Client ID ← Copy this
                └── Client secret ← Copy this (click Show if hidden)
```

## Common Issues

**"I can't find Client secret"**
- Some app clients don't have secrets
- If not shown, your app client might not have a secret configured
- You can create a new app client with a secret if needed

**"Client secret is hidden and I can't see it"**
- Once you close the page, you cannot retrieve it
- You'll need to create a new app client or reset it

**"Where is the .env file?"**
- It should be in your project root directory
- Same folder as `package.json` and `server.js`
- If it doesn't exist, create it as a new file named `.env`

