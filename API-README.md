# PhotoFilter Pro - REST API Version

A full-stack photo filtering application with REST API backend and modern frontend.

## 🏗️ Architecture

### Backend (Node.js + Express)
- **REST API** with comprehensive endpoints
- **Image processing** using Sharp library
- **File upload** with Multer
- **15 professional filters** applied server-side
- **Automatic cleanup** of old files

### Frontend (HTML + CSS + JavaScript)
- **Modern UI** with responsive design
- **API integration** for all operations
- **Real-time progress** updates
- **Camera capture** support
- **Drag & drop** file upload

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ installed
- Modern web browser

### Installation & Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Start the API Server**
```bash
npm start
# or for development with auto-restart:
npm run dev
```

3. **Open the Application**
- **API Version**: Open `api-index.html` in your browser
- **Original Version**: Open `index.html` in your browser

## 📡 API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/filters` | Get available filters |
| `POST` | `/api/upload` | Upload image |
| `POST` | `/api/apply-filter` | Apply single filter |
| `POST` | `/api/apply-all-filters` | Apply all filters |
| `GET` | `/api/download/:filename` | Download processed image |
| `GET` | `/api/image/:imageId` | Get image info |
| `GET` | `/api/download-original/:filename` | Download original image |
| `DELETE` | `/api/cleanup` | Clean up old files |

### Example API Usage

**Upload Image:**
```bash
curl -X POST -F "image=@photo.jpg" http://localhost:3000/api/upload
```

**Apply All Filters:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"imageId":"your-image-id"}' \
  http://localhost:3000/api/apply-all-filters
```

**Get Available Filters:**
```bash
curl http://localhost:3000/api/filters
```

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

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000                    # Server port
NODE_ENV=development         # Environment mode
```

### File Storage
- **Uploads**: `./uploads/` - Original images
- **Processed**: `./processed/` - Filtered images
- **Auto-cleanup**: Files older than 24 hours (configurable)

## 📱 Features

### Frontend Features
- **Login System** - Demo authentication
- **File Upload** - Drag & drop or click to select
- **Camera Capture** - Take photos directly
- **Real-time Processing** - Progress updates
- **Results Grid** - View all 15 filtered results
- **Download** - Save selected filtered image
- **Responsive Design** - Works on all devices

### Backend Features
- **RESTful API** - Standard HTTP methods
- **Image Processing** - Server-side filtering
- **File Management** - Automatic cleanup
- **Error Handling** - Comprehensive error responses
- **CORS Support** - Cross-origin requests
- **File Size Limits** - 10MB maximum upload

## 🧪 Testing

### Manual Testing
1. Start the server: `npm start`
2. Open `api-index.html` in browser
3. Login with `demo`/`demo123`
4. Upload an image or take a photo
5. Wait for processing to complete
6. Select and download your favorite result

### API Testing
```bash
# Health check
curl http://localhost:3000/api/health

# Get filters
curl http://localhost:3000/api/filters

# Upload image
curl -X POST -F "image=@test.jpg" http://localhost:3000/api/upload
```

## 🚀 Deployment

### AWS EC2 Deployment
1. **Upload files** to EC2 instance
2. **Install Node.js** and dependencies
3. **Configure web server** (Nginx/Apache)
4. **Set up SSL** for HTTPS
5. **Configure firewall** for port 3000
6. **Set up PM2** for process management

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Performance

- **Processing Speed**: ~2-3 seconds for all filters
- **File Size Limit**: 10MB per image
- **Concurrent Users**: Supports multiple simultaneous uploads
- **Memory Usage**: Optimized with Sharp library
- **Storage**: Automatic cleanup prevents disk space issues

## 🔒 Security

- **File Type Validation** - Only image files allowed
- **File Size Limits** - Prevents large file uploads
- **CORS Configuration** - Controlled cross-origin access
- **Error Handling** - No sensitive information exposed
- **Input Validation** - All inputs validated

## 🛠️ Development

### Project Structure
```
CAB432A3/
├── server.js              # Main API server
├── package.json           # Dependencies
├── api-index.html         # API version frontend
├── api-script.js          # API client JavaScript
├── index.html             # Original frontend
├── script.js              # Original JavaScript
├── styles.css             # Shared styles
├── uploads/               # Uploaded images
├── processed/             # Processed images
└── README.md              # This file
```

### Adding New Filters
1. Add filter to `filters` object in `server.js`
2. Implement filter logic in `applyFilter` function
3. Update frontend filter display if needed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - Feel free to use and modify as needed.

## 🆘 Support

For issues or questions:
1. Check the browser console for errors
2. Verify the API server is running
3. Check file permissions for upload/processed directories
4. Ensure Node.js version is 14+

---

**Happy Filtering! 🎨📸**
