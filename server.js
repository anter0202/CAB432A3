const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'photofilter-pro-secret-key-2024';
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Email Configuration
const EMAIL_CONFIG = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
};

const EMAIL_FROM = process.env.EMAIL_FROM || 'PhotoFilter Pro <noreply@photofilterpro.com>';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// In-memory user store (in production, use a real database)
const users = new Map();

// Initialize default user
const initializeDefaultUser = async () => {
    const hashedPassword = await bcrypt.hash('kingkong', 10);
    users.set('anter', {
        id: 'anter',
        username: 'anter',
        password: hashedPassword,
        email: 'anter@example.com',
        createdAt: new Date().toISOString(),
        refreshTokens: new Set(), // Store refresh tokens
        emailVerified: true, // Default user is pre-verified
        emailVerificationToken: null
    });
    console.log('✅ Default user "anter" initialized');
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve current directory

// Email utility functions
const createEmailTransporter = () => {
    return nodemailer.createTransporter(EMAIL_CONFIG);
};

const sendVerificationEmail = async (email, username, verificationToken) => {
    try {
        const transporter = createEmailTransporter();
        const verificationUrl = `${BASE_URL}/api/verify-email?token=${verificationToken}`;
        
        const mailOptions = {
            from: EMAIL_FROM,
            to: email,
            subject: 'Welcome to PhotoFilter Pro - Verify Your Email',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Welcome to PhotoFilter Pro!</h2>
                    <p>Hi ${username},</p>
                    <p>Thank you for registering with PhotoFilter Pro. To complete your registration and start using our amazing photo filters, please verify your email address by clicking the button below:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationUrl}" 
                           style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Verify Email Address
                        </a>
                    </div>
                    
                    <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
                    
                    <p>This verification link will expire in 24 hours.</p>
                    
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px;">
                        If you didn't create an account with PhotoFilter Pro, please ignore this email.
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Verification email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Error sending verification email:', error);
        return false;
    }
};

// Create directories
const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(processedDir);

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Available filters
const filters = {
    grayscale: { name: 'Grayscale', description: 'Convert to black and white' },
    sepia: { name: 'Sepia', description: 'Vintage brown tone effect' },
    vintage: { name: 'Vintage', description: 'Retro color adjustment' },
    blur: { name: 'Blur', description: 'Soft blur effect' },
    brightness: { name: 'Brightness', description: 'Enhanced brightness' },
    contrast: { name: 'Contrast', description: 'Increased contrast' },
    saturate: { name: 'Saturate', description: 'Enhanced color saturation' },
    invert: { name: 'Invert', description: 'Color inversion' },
    hue: { name: 'Hue Shift', description: 'Color hue rotation' },
    emboss: { name: 'Emboss', description: '3D embossed effect' },
    sharpen: { name: 'Sharpen', description: 'Enhanced sharpness' },
    warm: { name: 'Warm', description: 'Warm color tones' },
    cool: { name: 'Cool', description: 'Cool color tones' },
    dramatic: { name: 'Dramatic', description: 'High contrast with color boost' }
};

// Filter processing functions
const applyFilter = async (imagePath, filterName) => {
    let sharpInstance = sharp(imagePath);
    
    switch (filterName) {
        case 'grayscale':
            sharpInstance = sharpInstance.grayscale();
            break;
        case 'sepia':
            sharpInstance = sharpInstance.modulate({
                brightness: 1.1,
                saturation: 0.8,
                hue: 30
            });
            break;
        case 'vintage':
            sharpInstance = sharpInstance.modulate({
                brightness: 1.05,
                saturation: 1.2,
                hue: 15
            });
            break;
        case 'blur':
            sharpInstance = sharpInstance.blur(2);
            break;
        case 'brightness':
            sharpInstance = sharpInstance.modulate({
                brightness: 1.3
            });
            break;
        case 'contrast':
            sharpInstance = sharpInstance.linear(1.5, -(128 * 0.5));
            break;
        case 'saturate':
            sharpInstance = sharpInstance.modulate({
                saturation: 1.5
            });
            break;
        case 'invert':
            sharpInstance = sharpInstance.negate();
            break;
        case 'hue':
            sharpInstance = sharpInstance.modulate({
                hue: 30
            });
            break;
        case 'emboss':
            sharpInstance = sharpInstance.convolve({
                width: 3,
                height: 3,
                kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2]
            });
            break;
        case 'sharpen':
            sharpInstance = sharpInstance.convolve({
                width: 3,
                height: 3,
                kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0]
            });
            break;
        case 'warm':
            sharpInstance = sharpInstance.modulate({
                brightness: 1.05,
                saturation: 1.1,
                hue: -10
            });
            break;
        case 'cool':
            sharpInstance = sharpInstance.modulate({
                brightness: 1.05,
                saturation: 1.1,
                hue: 10
            });
            break;
        case 'dramatic':
            sharpInstance = sharpInstance
                .linear(1.8, -(128 * 0.4))
                .modulate({
                    saturation: 1.5
                });
            break;
        default:
            // Return original image
            break;
    }
    
    return sharpInstance;
};

// API Routes

// Authentication endpoints
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        if (users.has(username)) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const emailVerificationToken = uuidv4();
        
        const user = {
            id: username,
            username,
            password: hashedPassword,
            email: email || '',
            createdAt: new Date().toISOString(),
            refreshTokens: new Set(),
            emailVerified: false,
            emailVerificationToken: emailVerificationToken
        };

        users.set(username, user);

        // Send verification email if email is provided
        let emailSent = false;
        if (email) {
            emailSent = await sendVerificationEmail(email, username, emailVerificationToken);
        }

        // Only generate tokens if email is verified or no email provided
        let token = null;
        let refreshToken = null;
        
        if (!email || emailSent) {
            token = jwt.sign(
                { id: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            refreshToken = jwt.sign(
                { id: user.id, username: user.username, type: 'refresh' },
                JWT_SECRET,
                { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
            );

            // Store refresh token
            user.refreshTokens.add(refreshToken);
        }

        res.status(201).json({
            success: true,
            message: email ? 
                (emailSent ? 'User registered successfully. Please check your email to verify your account.' : 
                 'User registered successfully, but verification email could not be sent.') :
                'User registered successfully',
            token,
            refreshToken,
            emailVerificationRequired: !!email,
            emailSent,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const user = users.get(username);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: user.id, username: user.username, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
        );

        // Store refresh token
        user.refreshTokens.add(refreshToken);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

app.get('/api/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is required'
            });
        }

        // Find user by verification token
        let userToVerify = null;
        for (const [username, user] of users.entries()) {
            if (user.emailVerificationToken === token) {
                userToVerify = user;
                break;
            }
        }

        if (!userToVerify) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        // Mark email as verified
        userToVerify.emailVerified = true;
        userToVerify.emailVerificationToken = null;

        // Generate tokens for the verified user
        const token = jwt.sign(
            { id: userToVerify.id, username: userToVerify.username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: userToVerify.id, username: userToVerify.username, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
        );

        // Store refresh token
        userToVerify.refreshTokens.add(refreshToken);

        res.json({
            success: true,
            message: 'Email verified successfully! You can now use all features.',
            token,
            refreshToken,
            user: {
                id: userToVerify.id,
                username: userToVerify.username,
                email: userToVerify.email,
                emailVerified: userToVerify.emailVerified,
                createdAt: userToVerify.createdAt
            }
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Email verification failed',
            error: error.message
        });
    }
});

app.post('/api/resend-verification', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        const user = users.get(username);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        if (!user.email) {
            return res.status(400).json({
                success: false,
                message: 'No email address associated with this account'
            });
        }

        // Generate new verification token
        const newVerificationToken = uuidv4();
        user.emailVerificationToken = newVerificationToken;

        // Send verification email
        const emailSent = await sendVerificationEmail(user.email, user.username, newVerificationToken);

        res.json({
            success: emailSent,
            message: emailSent ? 
                'Verification email sent successfully' : 
                'Failed to send verification email'
        });

    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend verification email',
            error: error.message
        });
    }
});

app.post('/api/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        
        if (decoded.type !== 'refresh') {
            return res.status(403).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        const user = users.get(decoded.username);
        if (!user || !user.refreshTokens.has(refreshToken)) {
            return res.status(403).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const newToken = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Generate new refresh token
        const newRefreshToken = jwt.sign(
            { id: user.id, username: user.username, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
        );

        // Remove old refresh token and add new one
        user.refreshTokens.delete(refreshToken);
        user.refreshTokens.add(newRefreshToken);

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            token: newToken,
            refreshToken: newRefreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(403).json({
            success: false,
            message: 'Invalid or expired refresh token'
        });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.username);
        if (user) {
            // Clear all refresh tokens for the user
            user.refreshTokens.clear();
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

app.get('/api/profile', authenticateToken, (req, res) => {
    const user = users.get(req.user.username);
    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        });
    }

    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'PhotoFilter Pro API is running',
        timestamp: new Date().toISOString()
    });
});

// Get available filters
app.get('/api/filters', (req, res) => {
    res.json({
        success: true,
        filters: filters,
        count: Object.keys(filters).length
    });
});

// Upload image
app.post('/api/upload', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        // Use the actual filename as the imageId (without extension)
        const imageId = req.file.filename.split('.')[0]; // Remove extension
        const originalPath = req.file.path;
        const metadata = await sharp(originalPath).metadata();

        res.json({
            success: true,
            imageId: imageId,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            dimensions: {
                width: metadata.width,
                height: metadata.height
            },
            message: 'Image uploaded successfully'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading image',
            error: error.message
        });
    }
});

// Apply single filter
app.post('/api/apply-filter', authenticateToken, async (req, res) => {
    try {
        const { imageId, filterName } = req.body;

        if (!imageId || !filterName) {
            return res.status(400).json({
                success: false,
                message: 'Image ID and filter name are required'
            });
        }

        if (!filters[filterName]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filter name'
            });
        }

        // Find the uploaded image by imageId
        const uploads = await fs.readdir(uploadsDir);
        const imageFile = uploads.find(file => file.startsWith(imageId));
        
        if (!imageFile) {
            console.log('Looking for imageId:', imageId);
            console.log('Available files:', uploads);
            return res.status(404).json({
                success: false,
                message: 'Image not found',
                imageId: imageId,
                availableFiles: uploads
            });
        }

        const inputPath = path.join(uploadsDir, imageFile);
        const outputFilename = `${imageId}-${filterName}.png`;
        const outputPath = path.join(processedDir, outputFilename);

        // Apply filter
        const filteredImage = await applyFilter(inputPath, filterName);
        await filteredImage.png().toFile(outputPath);

        // Get processed image metadata
        const metadata = await sharp(outputPath).metadata();

        res.json({
            success: true,
            imageId: imageId,
            filterName: filterName,
            filterDisplayName: filters[filterName].name,
            processedImageUrl: `/api/download/${outputFilename}`,
            filename: outputFilename,
            dimensions: {
                width: metadata.width,
                height: metadata.height
            },
            fileSize: metadata.size,
            message: 'Filter applied successfully'
        });

    } catch (error) {
        console.error('Filter processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing filter',
            error: error.message
        });
    }
});

// Apply all filters at once
app.post('/api/apply-all-filters', authenticateToken, async (req, res) => {
    try {
        const { imageId } = req.body;

        if (!imageId) {
            return res.status(400).json({
                success: false,
                message: 'Image ID is required'
            });
        }

        // Find the uploaded image by imageId
        const uploads = await fs.readdir(uploadsDir);
        const imageFile = uploads.find(file => file.startsWith(imageId));
        
        if (!imageFile) {
            console.log('Looking for imageId:', imageId);
            console.log('Available files:', uploads);
            return res.status(404).json({
                success: false,
                message: 'Image not found',
                imageId: imageId,
                availableFiles: uploads
            });
        }

        const inputPath = path.join(uploadsDir, imageFile);
        const results = [];

        // Process all filters
        for (const [filterKey, filterInfo] of Object.entries(filters)) {
            try {
                const outputFilename = `${imageId}-${filterKey}.png`;
                const outputPath = path.join(processedDir, outputFilename);

                const filteredImage = await applyFilter(inputPath, filterKey);
                await filteredImage.png().toFile(outputPath);

                const metadata = await sharp(outputPath).metadata();

                results.push({
                    filterKey: filterKey,
                    filterName: filterInfo.name,
                    description: filterInfo.description,
                    processedImageUrl: `/api/view/${outputFilename}`,
                    downloadUrl: `/api/download/${outputFilename}`,
                    filename: outputFilename,
                    dimensions: {
                        width: metadata.width,
                        height: metadata.height
                    },
                    fileSize: metadata.size
                });
            } catch (filterError) {
                console.error(`Error processing filter ${filterKey}:`, filterError);
                results.push({
                    filterKey: filterKey,
                    filterName: filterInfo.name,
                    error: filterError.message
                });
            }
        }

        res.json({
            success: true,
            imageId: imageId,
            results: results,
            totalFilters: results.length,
            successfulFilters: results.filter(r => !r.error).length,
            message: 'All filters processed'
        });

    } catch (error) {
        console.error('Batch processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing filters',
            error: error.message
        });
    }
});

// View processed image (for display in browser)
app.get('/api/view/:filename', authenticateToken, async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(processedDir, filename);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.setHeader('Content-Type', 'image/png');
        res.sendFile(filePath);

    } catch (error) {
        console.error('View error:', error);
        res.status(500).json({
            success: false,
            message: 'Error viewing file',
            error: error.message
        });
    }
});

// Download processed image
app.get('/api/download/:filename', authenticateToken, async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(processedDir, filename);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.download(filePath, filename);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
});

// Get image info
app.get('/api/image/:imageId', authenticateToken, async (req, res) => {
    try {
        const imageId = req.params.imageId;
        
        // Find the uploaded image by imageId
        const uploads = await fs.readdir(uploadsDir);
        const imageFile = uploads.find(file => file.startsWith(imageId));
        
        if (!imageFile) {
            console.log('Looking for imageId:', imageId);
            console.log('Available files:', uploads);
            return res.status(404).json({
                success: false,
                message: 'Image not found',
                imageId: imageId,
                availableFiles: uploads
            });
        }

        const imagePath = path.join(uploadsDir, imageFile);
        const metadata = await sharp(imagePath).metadata();

        res.json({
            success: true,
            imageId: imageId,
            filename: imageFile,
            dimensions: {
                width: metadata.width,
                height: metadata.height
            },
            format: metadata.format,
            size: metadata.size,
            originalImageUrl: `/api/download-original/${imageFile}`
        });

    } catch (error) {
        console.error('Image info error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting image info',
            error: error.message
        });
    }
});

// Download original image
app.get('/api/download-original/:filename', authenticateToken, async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadsDir, filename);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.download(filePath, filename);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
});

// Clean up old files (optional endpoint)
app.delete('/api/cleanup', async (req, res) => {
    try {
        const { olderThanHours = 24 } = req.body;
        const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
        
        let deletedFiles = 0;
        
        // Clean uploads
        const uploads = await fs.readdir(uploadsDir);
        for (const file of uploads) {
            const filePath = path.join(uploadsDir, file);
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() < cutoffTime) {
                await fs.remove(filePath);
                deletedFiles++;
            }
        }
        
        // Clean processed files
        const processed = await fs.readdir(processedDir);
        for (const file of processed) {
            const filePath = path.join(processedDir, file);
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() < cutoffTime) {
                await fs.remove(filePath);
                deletedFiles++;
            }
        }
        
        res.json({
            success: true,
            message: `Cleaned up ${deletedFiles} files older than ${olderThanHours} hours`
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during cleanup',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.'
            });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        availableEndpoints: [
            'GET /api/health',
            'GET /api/filters',
            'POST /api/upload',
            'POST /api/apply-filter',
            'POST /api/apply-all-filters',
            'GET /api/download/:filename',
            'GET /api/image/:imageId',
            'GET /api/download-original/:filename',
            'DELETE /api/cleanup'
        ]
    });
});

// Start server
app.listen(PORT, async () => {
    await initializeDefaultUser();
    
    console.log(`🚀 PhotoFilter Pro API server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${uploadsDir}`);
    console.log(`📁 Processed directory: ${processedDir}`);
    console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
    console.log(`🔐 JWT Authentication: Enabled`);
    console.log(`📖 Available endpoints:`);
    console.log(`   POST /api/register - User registration`);
    console.log(`   POST /api/login - User login`);
    console.log(`   GET  /api/verify-email - Email verification`);
    console.log(`   POST /api/resend-verification - Resend verification email`);
    console.log(`   POST /api/refresh - Refresh access token`);
    console.log(`   POST /api/logout - User logout`);
    console.log(`   GET  /api/profile - Get user profile`);
    console.log(`   GET  /api/health - Health check`);
    console.log(`   GET  /api/filters - Get available filters`);
    console.log(`   POST /api/upload - Upload image (🔒)`);
    console.log(`   POST /api/apply-filter - Apply single filter (🔒)`);
    console.log(`   POST /api/apply-all-filters - Apply all filters (🔒)`);
    console.log(`   GET  /api/view/:filename - View processed image (🔒)`);
    console.log(`   GET  /api/download/:filename - Download processed image (🔒)`);
    console.log(`   GET  /api/image/:imageId - Get image info (🔒)`);
    console.log(`   GET  /api/download-original/:filename - Download original image (🔒)`);
    console.log(`   DELETE /api/cleanup - Clean up old files`);
    console.log(`\n🔑 Default user: anter / kingkong`);
});

module.exports = app;
