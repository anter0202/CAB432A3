# PhotoFilter Pro - REST API Version

A modern photo filtering application with REST API backend and beautiful frontend.

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ installed
- Modern web browser

### Installation & Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Start the Server**
```bash
npm start
```

3. **Open the Application**
- Go to http://localhost:3000
- The server serves both the frontend and API

## 🔐 JWT Authentication

The API uses JWT (JSON Web Tokens) for secure authentication:

- **Access Token**: Valid for 24 hours, used for API requests
- **Refresh Token**: Valid for 7 days, used to get new access tokens
- **Automatic Refresh**: Frontend automatically refreshes expired tokens
- **Secure Logout**: Clears both client and server-side tokens
- **Email Verification**: Required for accounts with email addresses

### Token Flow:
1. **Login/Register** → Receive access + refresh tokens
2. **API Requests** → Use access token in Authorization header
3. **Token Expired** → Automatically refresh using refresh token
4. **Logout** → Clear all tokens (client + server)

### Email Verification Flow:
1. **Register with Email** → Account created, verification email sent
2. **Check Email** → Click verification link in email
3. **Email Verified** → Account activated, tokens generated
4. **Resend Email** → Option to resend if verification email not received

## 📡 API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/register` | User registration | ❌ |
| `POST` | `/api/login` | User login | ❌ |
| `GET` | `/api/verify-email` | Email verification | ❌ |
| `POST` | `/api/resend-verification` | Resend verification email | ❌ |
| `POST` | `/api/refresh` | Refresh access token | ❌ |
| `POST` | `/api/logout` | User logout | ✅ |
| `GET` | `/api/profile` | Get user profile | ✅ |
| `GET` | `/api/health` | Health check | ❌ |
| `GET` | `/api/filters` | Get available filters | ❌ |
| `POST` | `/api/upload` | Upload image | ✅ |
| `POST` | `/api/apply-filter` | Apply single filter | ✅ |
| `POST` | `/api/apply-all-filters` | Apply all filters | ✅ |
| `GET` | `/api/view/:filename` | View processed image | ✅ |
| `GET` | `/api/download/:filename` | Download processed image | ✅ |
| `GET` | `/api/image/:imageId` | Get image info | ✅ |
| `GET` | `/api/download-original/:filename` | Download original image | ✅ |
| `DELETE` | `/api/cleanup` | Clean up old files | ❌ |

## 📧 Email Configuration

To enable email verification, configure your email settings:

### Environment Variables:
```bash
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_FROM=PhotoFilter Pro <noreply@photofilterpro.com>
BASE_URL=http://localhost:3000
```

### Gmail Setup:
1. Enable 2-Factor Authentication
2. Generate App Password: Google Account → Security → App Passwords
3. Use App Password (not regular password) in EMAIL_PASS

### Other Providers:
- **Outlook**: `smtp-mail.outlook.com:587`
- **Yahoo**: `smtp.mail.yahoo.com:587`
- **Custom SMTP**: Configure your own server

See `email-config.example.js` for detailed configuration examples.

## 🎨 Available Filters

1. **Grayscale** - Black and white conversion
2. **Sepia** - Vintage brown tone
3. **Vintage** - Retro color adjustment
4. **Blur** - Soft blur effect
5. **Brightness** - Enhanced brightness
6. **Contrast** - Increased contrast
7. **Saturate** - Enhanced color saturation
8. **Invert** - Color inversion
9. **Hue Shift** - Color hue rotation
10. **Emboss** - 3D embossed effect
11. **Sharpen** - Enhanced sharpness
12. **Warm** - Warm color tones
13. **Cool** - Cool color tones
14. **Dramatic** - High contrast with color boost

## 📱 How to Use

1. **Go to**: http://localhost:3000
2. **Login** with `anter`/`kingkong` or **Register** a new account
3. **Upload a photo** or **take one with camera**
4. **Watch progress** - Server processes all filters
5. **Choose your favorite** from 15 results
6. **Download** the selected image

## 🔧 Features

- **Single Server** - Frontend and API on one port (3000)
- **JWT Authentication** - Secure user login and session management
- **User Registration** - Create new accounts with secure password hashing
- **RESTful API** with Express.js
- **Image processing** using Sharp library
- **15 professional filters** applied server-side
- **Real-time progress** updates
- **Camera capture** support
- **Drag & drop** file upload
- **Responsive design** for all devices
- **Automatic file cleanup**
- **Protected endpoints** - All image operations require authentication

## 🚀 Deployment

Ready for AWS EC2 deployment:
1. Upload files to EC2 instance
2. Install Node.js and dependencies
3. Run `npm start`
4. Configure firewall for port 3000
5. Set up SSL for HTTPS (optional)

## 📊 Performance

- **Processing Speed**: ~2-3 seconds for all filters
- **File Size Limit**: 10MB per image
- **Concurrent Users**: Supports multiple simultaneous uploads
- **Memory Usage**: Optimized with Sharp library

---

**Happy Filtering! 🎨📸**
