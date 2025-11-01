# HTTPS Setup Guide for PhotoFilter Pro

This guide will help you set up HTTPS for your application using AWS services.

## Prerequisites

1. ✅ Route53 subdomain created (e.g., `n11470941.cab432.com`)
2. ✅ EC2 instance running your application
3. ✅ AWS credentials configured
4. ✅ Application Load Balancer OR API Gateway (you'll set one up)

## Step 1: Create Subdomain in Route53

If you haven't already:

1. Go to [Route53 Console](https://console.aws.amazon.com/route53/)
2. Click **Hosted zones**
3. Select `cab432.com`
4. Click **Create record**
5. **Record name**: `n11470941` (or your subdomain name)
6. **Record type**: `A` or `CNAME`
7. **Value**: Your EC2 public IP (temporary - will update later)
8. Click **Create records**

## Step 2: Request SSL Certificate from ACM

1. Go to [AWS Certificate Manager (ACM)](https://console.aws.amazon.com/acm/)
2. **Important**: Make sure you're in the **US East (N. Virginia) us-east-1** region
   - ACM certificates must be in us-east-1 to work with API Gateway
   - For ALB, you can use certificates in your application region
3. Click **Request** in the top right
4. Click **Next** (accept default certificate type)
5. **Fully qualified domain name**: Enter your full subdomain
   - Example: `n11470941.cab432.com`
6. **Tags**: Add tag
   - Key: `qut-username`
   - Value: `n11470941@qut.edu.au` (your QUT email)
7. Click **Request**
8. You'll see the certificate details page
9. Click **Create records in Route53** (in the Domains section)
10. Click **Create records** on the next page
11. **Wait for validation** (can take 5-10 minutes)
   - Click the refresh button to check status
   - Status should change from "Pending validation" to "Issued"

## Step 3: Choose Your Integration Method

You have two options:

### Option A: Application Load Balancer (Recommended for your Express app)
**Best if:**
- You have a single Express server on EC2
- You want auto-scaling capability
- You want direct connection to your application

**Go to:** [Step 3A: ALB Integration](#step-3a-application-load-balancer-integration)

### Option B: API Gateway (Alternative)
**Best if:**
- You want a single API endpoint
- You need gateway-level features (rate limiting, etc.)
- You're planning to use Lambda functions

**Go to:** [Step 3B: API Gateway Integration](#step-3b-api-gateway-integration)

---

## Step 3A: Application Load Balancer Integration

### Prerequisites for ALB:
- Certificate should be in your application's region (e.g., `ap-southeast-2`)
- You can re-request the certificate in the correct region if needed

### Step 3A.1: Create Application Load Balancer

If you don't have an ALB yet:

1. Go to [EC2 Console → Load Balancers](https://console.aws.amazon.com/ec2/v2/home#LoadBalancers:)
2. Click **Create Load Balancer**
3. Choose **Application Load Balancer**
4. **Basic configuration**:
   - Name: `photofilter-pro-alb`
   - Scheme: **Internet-facing**
   - IP address type: **IPv4**
5. **Network mapping**:
   - VPC: Select your VPC
   - Availability Zones: Select at least 2 subnets in different AZs
6. **Security groups**: Create or select a security group that allows:
   - HTTP (80) from `0.0.0.0/0`
   - HTTPS (443) from `0.0.0.0/0`
7. **Listeners and routing**:
   - First listener: HTTP:80 → Create new target group
   - Target group name: `photofilter-pro-targets`
   - Target type: **Instances**
   - Protocol: **HTTP**
   - Port: **3000** (your app port)
   - Health check path: `/api/health`
8. Click **Create load balancer**
9. Wait for it to become **Active**

### Step 3A.2: Register EC2 Instance with Target Group

1. Go to [Target Groups](https://console.aws.amazon.com/ec2/v2/home#TargetGroups:)
2. Select your target group (`photofilter-pro-targets`)
3. Click **Register targets** tab
4. Select your EC2 instance
5. Port: `3000`
6. Click **Register pending targets**
7. Wait for health check to show as **healthy**

### Step 3A.3: Add HTTPS Listener to ALB

1. Go back to your Load Balancer
2. Click **Listeners** tab
3. Click **Add listener**
4. **Protocol**: **HTTPS**
5. **Port**: `443`
6. **Default actions**: Forward to your target group (`photofilter-pro-targets`)
7. **Secure listener settings**:
   - **Certificate (from ACM)**: Search and select your certificate
   - **Security policy**: Default (recommended)
8. Click **Add**
9. Wait for listener to be active

### Step 3A.4: Redirect HTTP to HTTPS (Optional but Recommended)

1. Still in the **Listeners** tab
2. Select the HTTP (80) listener
3. Click **Edit**
4. Change **Default action** to:
   - **Action type**: Redirect to URL
   - **Protocol**: HTTPS
   - **Port**: 443
   - **Status code**: 301 - Permanently moved
5. Click **Save changes**

### Step 3A.5: Update Route53 to Point to ALB

1. Go to [Route53 Console](https://console.aws.amazon.com/route53/)
2. Select your hosted zone (`cab432.com`)
3. Find your subdomain record (`n11470941.cab432.com`)
4. Click **Edit record**
5. **Record type**: `A`
6. **Alias**: **Yes**
7. **Route traffic to**: 
   - **Alias to Application and Classic Load Balancer**
   - **Region**: Select your region (e.g., `ap-southeast-2`)
   - **Load balancer**: Select your ALB
8. Click **Save record**

### Step 3A.6: Update Your Application

Your application is already configured correctly! The ALB forwards requests to port 3000.

However, if you're using a reverse proxy or need to handle forwarded headers:

**Update `server.js` to trust proxy headers** (if needed):
```javascript
// Add this after app creation
app.set('trust proxy', 1); // Trust first proxy (ALB)

// Update BASE_URL in .env
BASE_URL=https://n11470941.cab432.com
```

### Step 3A.7: Test HTTPS

1. Wait 5-10 minutes for DNS propagation
2. Visit: `https://n11470941.cab432.com`
3. You should see your application with a valid SSL certificate

---

## Step 3B: API Gateway Integration

### Step 3B.1: Create API Gateway (if you don't have one)

1. Go to [API Gateway Console](https://console.aws.amazon.com/apigateway/)
2. Click **Create API**
3. Choose **REST API** → **Build**
4. **Protocol**: REST
5. **Create new API**: New API
6. **API name**: `photofilter-pro-api`
7. Click **Create API**

### Step 3B.2: Create Resources and Methods

1. Click **Actions** → **Create Resource**
2. **Resource Name**: `api`
3. **Resource Path**: `/api`
4. Click **Create Resource**

5. Click **Actions** → **Create Resource** (under `/api`)
6. **Resource Name**: `{proxy+}`
7. **Resource Path**: `{proxy+}`
8. Enable **Proxy Resource**: Yes
9. Click **Create Resource**

10. Select `{proxy+}` resource
11. Click **Actions** → **Create Method**
12. Select **ANY** method
13. **Integration type**: HTTP Proxy
14. **Endpoint URL**: `http://YOUR-EC2-IP:3000/api/{proxy}`
   - Replace `YOUR-EC2-IP` with your EC2 public IP
   - Or better: Use your ALB DNS name if you have one
15. Click **Save**

### Step 3B.3: Deploy API

1. Click **Actions** → **Deploy API**
2. **Deployment stage**: `[New Stage]`
3. **Stage name**: `prod`
4. Click **Deploy**

### Step 3B.4: Create Custom Domain

1. In API Gateway, click **Custom domain names** (left sidebar)
2. Click **Create**
3. **Domain name**: `n11470941.cab432.com`
4. **Endpoint configuration**: 
   - **Regional** (recommended)
5. **ACM certificate**: Select your certificate from us-east-1
6. Click **Create domain name**

### Step 3B.5: Add Tags

1. On the custom domain details page
2. Click **Tags** tab
3. Click **Manage tags**
4. Add tag:
   - Key: `qut-username`
   - Value: `n11470941@qut.edu.au`
5. Click **Save**

### Step 3B.6: Configure API Mappings

1. Click **API mappings** tab
2. Click **Configure API mappings**
3. Click **Add new mapping**
4. **API**: Select your API (`photofilter-pro-api`)
5. **Stage**: `prod`
6. **Path**: Leave empty (maps to root)
7. Click **Save**

### Step 3B.7: Update Route53

1. In the custom domain **Configuration** tab
2. Copy the **API Gateway domain name** (looks like `d-xxxxx.execute-api.region.amazonaws.com`)
3. Go to [Route53](https://console.aws.amazon.com/route53/)
4. Edit your subdomain record (`n11470941.cab432.com`)
5. **Record type**: `CNAME`
6. **Value**: Paste the API Gateway domain name
7. Click **Save record**

### Step 3B.8: Update Your Application

Since API Gateway forwards to your backend, you may need to handle forwarded headers:

```javascript
// Add to server.js after app creation
app.set('trust proxy', 1); // Trust API Gateway proxy

// Update BASE_URL
BASE_URL=https://n11470941.cab432.com
```

---

## Step 4: Update Frontend Configuration

Once HTTPS is working, update your frontend to use HTTPS:

### Option 1: The frontend already uses `window.location.origin` ✅
Your `api-script.js` already uses:
```javascript
this.apiBaseUrl = window.location.origin;
```

This means it will **automatically** use HTTPS when accessed via HTTPS URL!

### Option 2: If you hardcoded URLs (you haven't)
If you had hardcoded `http://localhost:3000`, update it to use the environment.

---

## Step 5: Testing

1. **Wait for DNS propagation** (5-30 minutes)
   - Check: https://www.whatsmydns.net/
   - Enter your subdomain: `n11470941.cab432.com`

2. **Test HTTPS connection**:
   ```bash
   curl -I https://n11470941.cab432.com/api/health
   ```

3. **Visit in browser**:
   - `https://n11470941.cab432.com`
   - Check for the padlock icon 🔒
   - Certificate should show as valid

4. **Test API endpoints**:
   - `https://n11470941.cab432.com/api/health`
   - `https://n11470941.cab432.com/api/filters`

---

## Troubleshooting

### Certificate Status Stuck on "Pending Validation"
- Check DNS records in Route53
- Wait longer (can take up to 30 minutes)
- Verify domain name matches exactly

### "Certificate Not Found" in ALB/API Gateway
- **For API Gateway**: Certificate MUST be in **us-east-1** region
- **For ALB**: Certificate should be in your application's region
- Re-request certificate in the correct region if needed

### 502 Bad Gateway
- Check target group health (for ALB)
- Verify EC2 security group allows traffic from ALB
- Check EC2 instance is running
- Check application logs on EC2

### DNS Not Resolving
- Wait for DNS propagation
- Check Route53 record is correct
- Verify record type (A for ALB, CNAME for API Gateway)

### Mixed Content Warnings
- Ensure all API calls use HTTPS
- Update any hardcoded HTTP URLs
- Your frontend already uses `window.location.origin` which handles this ✅

---

## Recommendations

**For your Express application, I recommend:**

✅ **Option A: Application Load Balancer**
- More direct connection to your Express app
- Better for auto-scaling
- Simpler architecture
- Certificate can be in your app region

❌ **Option B: API Gateway** (only if you need gateway features)
- Adds extra layer
- Certificate must be in us-east-1
- More complex setup
- Useful if you're using Lambda or need rate limiting

---

## Security Notes

1. **Security Groups**: Ensure your EC2 security group only allows traffic from the ALB (if using ALB)
2. **HTTPS Only**: Redirect HTTP to HTTPS (ALB supports this)
3. **Update BASE_URL**: Set `BASE_URL=https://n11470941.cab432.com` in your `.env`
4. **CORS**: Your CORS is already configured to allow all origins (update if needed for production)

---

## Summary Checklist

- [ ] Subdomain created in Route53
- [ ] ACM certificate requested and validated
- [ ] ALB created (if using ALB)
- [ ] OR API Gateway configured (if using API Gateway)
- [ ] HTTPS listener added to ALB
- [ ] Route53 record points to ALB/API Gateway
- [ ] Application accessible via HTTPS
- [ ] Frontend uses HTTPS automatically
- [ ] All features working with HTTPS

---

## Next Steps

After HTTPS is working:
1. Update `BASE_URL` in `.env` file on EC2
2. Update email verification links (if using email)
3. Test all features with HTTPS
4. Monitor certificate expiration (ACM auto-renews)

Your application is ready for production with HTTPS! 🎉

