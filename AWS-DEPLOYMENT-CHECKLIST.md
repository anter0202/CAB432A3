# AWS Deployment Checklist

## ✅ Code Quality Check
- [x] **No linter errors** - All files pass linting
- [x] **File upload directories** - Auto-created on startup (`uploads/`, `processed/`)
- [x] **Error handling** - Comprehensive try-catch blocks in place
- [x] **Dependencies** - All required packages in `package.json`

## ⚠️ Required Environment Variables

Before deploying to AWS, ensure these are set:

### Required for Basic Functionality:
```env
PORT=3000
JWT_SECRET=your-secret-key-change-this
DYNAMODB_TABLE_NAME=n11470941-photofilter-users
AWS_REGION=ap-southeast-2
```

### AWS Credentials (one of the following):
- IAM Role attached to EC2 instance (recommended)
- OR `.aws/credentials` file in project directory
- OR Environment variables:
  ```env
  AWS_ACCESS_KEY_ID=your-access-key
  AWS_SECRET_ACCESS_KEY=your-secret-key
  ```

### Optional (but recommended):
```env
# Cognito (if using Cognito authentication)
COGNITO_USER_POOL_ID=ap-southeast-2_XXXXXXXXX
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret

# SQS (if using background processing)
SQS_QUEUE_URL=https://sqs.ap-southeast-2.amazonaws.com/...
SQS_VISIBILITY_TIMEOUT=30

# Email (if using email verification)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_FROM=PhotoFilter Pro <noreply@photofilterpro.com>
BASE_URL=http://your-ec2-public-ip:3000
```

## 📦 Deployment Steps

### 1. On Your Local Machine:

1. **Test the application locally:**
   ```bash
   npm install
   npm start
   ```

2. **Create a deployment package:**
   ```bash
   # Exclude unnecessary files
   # Make sure .env is NOT included (use .env.example if needed)
   ```

3. **Files to include:**
   - ✅ All `.js` files (server.js, api-script.js, etc.)
   - ✅ `package.json` and `package-lock.json`
   - ✅ `index.html`
   - ✅ `styles.css` (if separate)
   - ✅ `.aws/credentials` (or use IAM role)
   - ✅ `dynamodb.js`, `cognito.js`, `sqs.js` helper files
   - ❌ `.env` file (set environment variables on EC2 instead)
   - ❌ `node_modules/` (run `npm install` on EC2)
   - ❌ `uploads/` and `processed/` (will be created automatically)

### 2. On EC2 Instance:

1. **Install Node.js 14+** (if not already installed):
   ```bash
   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
   sudo yum install -y nodejs
   ```

2. **Upload your code:**
   ```bash
   # Use SCP or Git to transfer files
   scp -i your-key.pem -r ./CAB432A3 ec2-user@your-ec2-ip:~/
   ```

3. **Install dependencies:**
   ```bash
   cd ~/CAB432A3
   npm install --production
   ```

4. **Set environment variables:**
   ```bash
   # Option 1: Create .env file
   nano .env
   # Add your environment variables here
   
   # Option 2: Use export (temporary, for current session)
   export PORT=3000
   export JWT_SECRET=your-secret-key
   export DYNAMODB_TABLE_NAME=n11470941-photofilter-users
   export AWS_REGION=ap-southeast-2
   ```

5. **Test the application:**
   ```bash
   npm start
   ```

6. **Run in background (using PM2 or screen):**
   ```bash
   # Option 1: Using PM2 (recommended)
   npm install -g pm2
   pm2 start server.js --name photofilter-pro
   pm2 save
   pm2 startup  # Follow instructions to enable on boot
   
   # Option 2: Using screen
   screen -S photofilter
   npm start
   # Press Ctrl+A, then D to detach
   ```

### 3. Security Configuration:

1. **EC2 Security Group:**
   - Open port `3000` (or your PORT) for inbound HTTP traffic
   - Or use a load balancer/proxy (port 80/443)

2. **IAM Role Permissions (if using IAM role):**
   - DynamoDB: `dynamodb:*` on your table
   - Cognito: `cognito-idp:*` (if using Cognito)
   - SQS: `sqs:*` on your queue (if using SQS)

3. **Update BASE_URL:**
   ```env
   BASE_URL=http://your-ec2-public-ip:3000
   # Or if using domain with HTTPS:
   BASE_URL=https://n11470941.cab432.com
   ```

4. **HTTPS Setup:**
   - Follow the `HTTPS-SETUP-GUIDE.md` for setting up SSL certificates
   - Use Application Load Balancer (recommended) or API Gateway
   - Update BASE_URL to use HTTPS once certificate is configured

## 🐛 Common Issues & Solutions

### Issue 1: "Cannot find module"
**Solution:** Run `npm install` on EC2

### Issue 2: "AWS credentials not found"
**Solution:** 
- Ensure `.aws/credentials` file exists, OR
- Attach IAM role to EC2 instance, OR
- Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables

### Issue 3: "Port already in use"
**Solution:**
```bash
# Find process using port 3000
sudo lsof -i :3000
# Kill it
sudo kill -9 <PID>
```

### Issue 4: "DynamoDB table not found"
**Solution:**
- Check `DYNAMODB_TABLE_NAME` matches your table name exactly
- Ensure AWS region is correct
- Verify IAM permissions for DynamoDB

### Issue 5: "Application works locally but not on EC2"
**Solution:**
- Check security group allows inbound traffic on your PORT
- Verify environment variables are set correctly
- Check EC2 instance has internet access
- Review CloudWatch logs: `pm2 logs` or check `/var/log/`

## ✅ Pre-Deployment Test Checklist

Before deploying to production:

- [ ] Application runs locally without errors
- [ ] All endpoints respond correctly
- [ ] Image upload works
- [ ] Filters apply correctly
- [ ] Authentication works (login/register)
- [ ] DynamoDB connection successful
- [ ] AWS credentials configured
- [ ] Environment variables set correctly
- [ ] Security group configured
- [ ] Port accessible from outside (if needed)

## 📝 Notes

- The application automatically creates `uploads/` and `processed/` directories
- DynamoDB table is created automatically if it doesn't exist
- Default user (`anter`/`kingkong`) is created automatically on first run
- All new features (batch upload, custom filter, compare, share) are implemented and tested

## 🚀 Ready for Deployment!

If all checks pass, your application is ready to deploy to AWS EC2.

