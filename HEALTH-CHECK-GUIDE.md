# PhotoFilter Pro API Health Check Guide

## 🔍 **How to Check All Endpoints Health**

### **Method 1: Automated Health Check Scripts**

#### **Node.js Script (Recommended)**
```bash
node health-check.js
```
- ✅ Tests all endpoints automatically
- ✅ Shows detailed results and success rates
- ✅ Tests both public and protected endpoints
- ✅ Cross-platform (Windows, Mac, Linux)

#### **PowerShell Script (Windows)**
```powershell
powershell -ExecutionPolicy Bypass -File simple-health-check.ps1
```
- ✅ Quick basic endpoint testing
- ✅ Windows-native
- ✅ Simple and fast

### **Method 2: Manual Testing**

#### **1. Basic Health Check**
```bash
curl http://localhost:3000/api/health
```
**Expected Response:**
```json
{
  "status": "OK",
  "message": "PhotoFilter Pro API is running",
  "timestamp": "2025-10-23T05:44:16.639Z"
}
```

#### **2. Test Authentication**
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"anter","password":"kingkong"}'
```
**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "anter",
    "username": "anter",
    "email": "anter@example.com",
    "createdAt": "2025-10-23T05:44:16.639Z"
  }
}
```

#### **3. Test Protected Endpoint**
```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### **Method 3: Browser Testing**

#### **Frontend Testing**
1. **Go to**: http://localhost:3000
2. **Login** with `anter`/`kingkong`
3. **Upload a photo** or **take one with camera**
4. **Check all 15 filters** are displayed
5. **Try downloading** a filtered image

#### **API Testing with Browser DevTools**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Perform actions in the app
4. Check all API calls return 200 status

### **Method 4: Comprehensive Testing Checklist**

#### **✅ Public Endpoints**
- [ ] `GET /api/health` - Returns 200 OK
- [ ] `GET /api/filters` - Returns 200 OK with filter list
- [ ] `POST /api/login` - Returns 200 OK with token
- [ ] `POST /api/register` - Returns 201 Created

#### **✅ Protected Endpoints (with valid token)**
- [ ] `GET /api/profile` - Returns 200 OK with user data
- [ ] `POST /api/upload` - Returns 200 OK with image ID
- [ ] `POST /api/apply-all-filters` - Returns 200 OK with results
- [ ] `GET /api/view/:filename` - Returns 200 OK with image
- [ ] `GET /api/download/:filename` - Returns 200 OK with file

#### **✅ Error Handling**
- [ ] Invalid credentials return 401
- [ ] Missing token returns 401
- [ ] Invalid token returns 403
- [ ] Non-existent endpoints return 404

### **Method 5: Performance Testing**

#### **Load Testing (Optional)**
```bash
# Install Apache Bench
# Test concurrent requests
ab -n 100 -c 10 http://localhost:3000/api/health
```

### **Method 6: Production Readiness Check**

#### **Security Checklist**
- [ ] JWT tokens expire properly (24 hours)
- [ ] Passwords are hashed with bcrypt
- [ ] CORS is configured correctly
- [ ] File uploads are validated
- [ ] Error messages don't leak sensitive info

#### **Performance Checklist**
- [ ] Image processing completes in < 5 seconds
- [ ] API responses are < 1 second
- [ ] Memory usage is reasonable
- [ ] No memory leaks during testing

### **Method 7: Monitoring Commands**

#### **Check Server Status**
```bash
# Check if server is running
netstat -an | grep :3000

# Check server logs
# Look at terminal where npm start is running
```

#### **Check File System**
```bash
# Check uploads directory
ls -la uploads/

# Check processed directory  
ls -la processed/

# Check disk space
df -h
```

## 🎯 **Quick Health Check Commands**

### **Windows PowerShell**
```powershell
# Quick test
Invoke-RestMethod -Uri "http://localhost:3000/api/health"

# Login test
$login = Invoke-RestMethod -Uri "http://localhost:3000/api/login" -Method POST -ContentType "application/json" -Body '{"username":"anter","password":"kingkong"}'
Write-Host "Token: $($login.token)"
```

### **Linux/Mac Bash**
```bash
# Quick test
curl http://localhost:3000/api/health

# Login test
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"anter","password":"kingkong"}'
```

## 🚨 **Troubleshooting Common Issues**

### **Port Already in Use**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9  # Mac/Linux
netstat -ano | findstr :3000   # Windows
```

### **Permission Issues**
```bash
# Fix file permissions
chmod 755 uploads/ processed/
```

### **Memory Issues**
```bash
# Check memory usage
top -p $(pgrep node)
```

## 📊 **Expected Results**

### **Healthy API Response**
- ✅ All public endpoints return 200-201
- ✅ Authentication works correctly
- ✅ Protected endpoints require valid token
- ✅ Image processing completes successfully
- ✅ Downloads work properly
- ✅ Error handling is appropriate

### **Success Rate Target**
- 🎯 **95%+ success rate** for all endpoints
- 🎯 **< 2 seconds** response time for most endpoints
- 🎯 **< 5 seconds** for image processing
- 🎯 **Zero** critical security vulnerabilities

---

**💡 Pro Tip**: Run the health check before deploying to production to ensure everything is working correctly!
