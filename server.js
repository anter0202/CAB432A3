require('dotenv').config();
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
const userRepo = require('./dynamodb');
const sqsHelper = require('./sqs');

// Get SQS queue URL from environment
const QUEUE_URL = process.env.SQS_QUEUE_URL;

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

// Initialize default user
const initializeDefaultUser = async () => {
    try {
        // Check if default user already exists
        const existingUser = await userRepo.getUserByUsername('anter');
        if (existingUser) {
            console.log('✅ Default user "anter" already exists in DynamoDB');
            return;
        }

        const hashedPassword = await bcrypt.hash('kingkong', 10);
        await userRepo.createUser({
            id: 'anter',
            username: 'anter',
            password: hashedPassword,
            email: 'anter@example.com',
            createdAt: new Date().toISOString(),
            refreshTokens: new Set(),
            emailVerified: true,
            emailVerificationToken: null
        });
        console.log('✅ Default user "anter" initialized in DynamoDB');
    } catch (error) {
        if (error.message === 'Username already exists') {
            console.log('✅ Default user "anter" already exists in DynamoDB');
        } else if (error.name === 'UnrecognizedClientException' || error.message.includes('security token')) {
            console.error('❌ AWS session token has expired. Please refresh your AWS credentials in .aws/credentials');
            console.error('   You need to get new temporary credentials from AWS.');
        } else {
            console.error('❌ Error initializing default user:', error.message);
        }
    }
};

// Middleware
// Trust proxy for AWS ALB/API Gateway (needed for proper HTTPS handling)
app.set('trust proxy', 1);

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

// Cognito Authentication (if configured)
let cognito = null;
try {
    cognito = require('./cognito');
} catch (error) {
    // Cognito not configured - this is OK
}

// Cognito JWT Authentication Middleware (if Cognito is configured)
const authenticateCognitoToken = async (req, res, next) => {
    if (!cognito) {
        return res.status(501).json({
            success: false,
            message: 'Cognito authentication not configured'
        });
    }

    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        // Verify Cognito ID token
        const payload = await cognito.verifyToken(token);
        req.user = {
            id: payload.sub,
            username: payload['cognito:username'] || payload.username,
            email: payload.email,
            emailVerified: payload.email_verified
        };
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.message
        });
    }
};

// Unified Authentication Middleware - tries Cognito first, falls back to legacy JWT
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    // Try Cognito authentication first (if configured)
    if (cognito) {
        try {
            const payload = await cognito.verifyToken(token);
            req.user = {
                id: payload.sub,
                username: payload['cognito:username'] || payload.username,
                email: payload.email,
                emailVerified: payload.email_verified
            };
            return next();
        } catch (cognitoError) {
            // If Cognito verification fails (e.g., token is not a Cognito token), 
            // silently fall back to legacy JWT authentication
            // This is expected behavior when using legacy JWT tokens
        }
    }

    // Try legacy JWT authentication
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Return 401 for expired tokens to allow refresh, 403 for invalid tokens
            const statusCode = err.name === 'TokenExpiredError' ? 401 : 403;
            return res.status(statusCode).json({
                success: false,
                message: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or expired token',
                error: err.message
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
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
        files: 10 // Maximum 10 files for batch upload
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
const applyFilter = async (imagePath, filterName, customParams = null) => {
    let sharpInstance = sharp(imagePath);
    
    // Handle custom filter parameters
    if (customParams) {
        const params = customParams;
        
        // Apply custom brightness if specified
        if (params.brightness !== undefined) {
            sharpInstance = sharpInstance.modulate({
                brightness: Math.max(0.1, Math.min(3.0, params.brightness))
            });
        }
        
        // Apply custom saturation if specified
        if (params.saturation !== undefined) {
            sharpInstance = sharpInstance.modulate({
                saturation: Math.max(0, Math.min(3.0, params.saturation))
            });
        }
        
        // Apply custom hue if specified
        if (params.hue !== undefined) {
            sharpInstance = sharpInstance.modulate({
                hue: Math.max(-180, Math.min(180, params.hue))
            });
        }
        
        // Apply custom blur if specified
        if (params.blur !== undefined) {
            sharpInstance = sharpInstance.blur(Math.max(0, Math.min(100, params.blur)));
        }
        
        // Apply custom contrast if specified
        if (params.contrast !== undefined) {
            const contrastValue = Math.max(0.5, Math.min(3.0, params.contrast));
            sharpInstance = sharpInstance.linear(contrastValue, -(128 * (contrastValue - 1) / 2));
        }
        
        // Apply grayscale if specified
        if (params.grayscale === true) {
            sharpInstance = sharpInstance.grayscale();
        }
        
        // Apply invert if specified
        if (params.invert === true) {
            sharpInstance = sharpInstance.negate();
        }
        
        return sharpInstance;
    }
    
    // Standard filters
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

// Store custom filters per user (in-memory, could be moved to DynamoDB)
const customFilters = new Map();

// Store shared image tokens (in-memory, could be moved to DynamoDB or Redis)
const sharedImages = new Map(); // token -> { imageId, filename, filterName, expiresAt, userId }

// API Routes

// Cognito Authentication endpoints
if (cognito) {
    app.post('/api/cognito/signup', async (req, res) => {
        try {
            const { username, password, email } = req.body;

            if (!username || !password || !email) {
                return res.status(400).json({
                    success: false,
                    message: 'Username, password, and email are required'
                });
            }

            const result = await cognito.signUp(username, password, email);
            res.status(201).json(result);
        } catch (error) {
            console.error('Cognito signup error:', error);
            
            let statusCode = 500;
            let message = 'Registration failed';
            
            // Handle specific Cognito errors
            if (error.name === 'UsernameExistsException') {
                statusCode = 409;
                message = 'Username already exists. Please choose a different username.';
            } else if (error.name === 'InvalidPasswordException') {
                statusCode = 400;
                const errorMsg = error.message || '';
                if (errorMsg.includes('not long enough')) {
                    message = 'Password must be at least 8 characters long.';
                } else if (errorMsg.includes('uppercase')) {
                    message = 'Password must contain at least one uppercase letter.';
                } else if (errorMsg.includes('lowercase')) {
                    message = 'Password must contain at least one lowercase letter.';
                } else if (errorMsg.includes('number')) {
                    message = 'Password must contain at least one number.';
                } else if (errorMsg.includes('symbol')) {
                    message = 'Password must contain at least one symbol (!@#$%^&*).';
                } else {
                    message = 'Password does not meet requirements: Must be 8+ characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 symbol.';
                }
            } else if (error.name === 'InvalidParameterException') {
                statusCode = 400;
                message = error.message || 'Invalid input. Please check your username, email, and password.';
            } else {
                message = error.message || 'Registration failed. Please try again.';
            }
            
            res.status(statusCode).json({
                success: false,
                message: message,
                error: error.message,
                errorType: error.name
            });
        }
    });

    app.post('/api/cognito/confirm', async (req, res) => {
        try {
            const { username, confirmationCode } = req.body;

            if (!username || !confirmationCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and confirmation code are required'
                });
            }

            const result = await cognito.confirmSignUp(username, confirmationCode);
            res.json(result);
        } catch (error) {
            console.error('Cognito confirmation error:', error);
            res.status(500).json({
                success: false,
                message: error.name === 'CodeMismatchException' ? 'Invalid confirmation code' : 'Confirmation failed',
                error: error.message
            });
        }
    });

    app.post('/api/cognito/resend-code', async (req, res) => {
        try {
            const { username } = req.body;

            if (!username) {
                return res.status(400).json({
                    success: false,
                    message: 'Username is required'
                });
            }

            const result = await cognito.resendConfirmationCode(username);
            res.json(result);
        } catch (error) {
            console.error('Cognito resend code error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to resend confirmation code',
                error: error.message
            });
        }
    });

    app.post('/api/cognito/login', async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password are required'
                });
            }

            const result = await cognito.authenticate(username, password);
            
            // Decode ID token to get user info
            const userInfo = cognito.decodeToken(result.idToken);

            res.json({
                success: true,
                message: 'Login successful',
                accessToken: result.accessToken,
                idToken: result.idToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
                user: {
                    id: userInfo.sub,
                    username: userInfo['cognito:username'] || username,
                    email: userInfo.email,
                    emailVerified: userInfo.email_verified
                }
            });
        } catch (error) {
            console.error('Cognito login error:', error);
            
            let statusCode = 500;
            let message = 'Login failed';

            if (error.name === 'NotAuthorizedException') {
                statusCode = 401;
                message = 'Invalid username or password';
            } else if (error.name === 'UserNotConfirmedException') {
                statusCode = 403;
                message = 'User email not confirmed. Please check your email for confirmation code.';
            }

            res.status(statusCode).json({
                success: false,
                message: message,
                error: error.message
            });
        }
    });
}

// Legacy Authentication endpoints (DynamoDB-based)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Check if user already exists
        const existingUser = await userRepo.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const emailVerificationToken = uuidv4();
        
        const userData = {
            id: username,
            username,
            password: hashedPassword,
            email: email || '',
            createdAt: new Date().toISOString(),
            refreshTokens: new Set(),
            emailVerified: false,
            emailVerificationToken: emailVerificationToken
        };

        // Create user in DynamoDB
        await userRepo.createUser(userData);

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
                { id: userData.id, username: userData.username },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            refreshToken = jwt.sign(
                { id: userData.id, username: userData.username, type: 'refresh' },
                JWT_SECRET,
                { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
            );

            // Store refresh token in DynamoDB
            await userRepo.addRefreshToken(username, refreshToken);
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
                id: userData.id,
                username: userData.username,
                email: userData.email,
                emailVerified: userData.emailVerified,
                createdAt: userData.createdAt
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        if (error.message === 'Username already exists') {
            return res.status(409).json({
                success: false,
                message: 'Username already exists'
            });
        }
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

        const user = await userRepo.getUserByUsername(username);
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

        // Store refresh token in DynamoDB
        await userRepo.addRefreshToken(username, refreshToken);

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
        const userToVerify = await userRepo.getUserByVerificationToken(token);

        if (!userToVerify) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        // Mark email as verified and clear verification token
        await userRepo.updateUser(userToVerify.username, {
            emailVerified: true,
            emailVerificationToken: null
        });

        // Generate tokens for the verified user
        const accessToken = jwt.sign(
            { id: userToVerify.id, username: userToVerify.username },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: userToVerify.id, username: userToVerify.username, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
        );

        // Store refresh token in DynamoDB
        await userRepo.addRefreshToken(userToVerify.username, refreshToken);

        res.json({
            success: true,
            message: 'Email verified successfully! You can now use all features.',
            token: accessToken,
            refreshToken,
            user: {
                id: userToVerify.id,
                username: userToVerify.username,
                email: userToVerify.email,
                emailVerified: true,
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

        const user = await userRepo.getUserByUsername(username);
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
        await userRepo.updateUser(username, {
            emailVerificationToken: newVerificationToken
        });

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

        const user = await userRepo.getUserByUsername(decoded.username);
        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Check if refresh token exists in DynamoDB
        const hasToken = await userRepo.hasRefreshToken(decoded.username, refreshToken);
        if (!hasToken) {
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

        // Remove old refresh token and add new one in DynamoDB
        await userRepo.removeRefreshToken(decoded.username, refreshToken);
        await userRepo.addRefreshToken(decoded.username, newRefreshToken);

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

app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        // Clear all refresh tokens for the user in DynamoDB
        await userRepo.clearRefreshTokens(req.user.username);

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

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await userRepo.getUserByUsername(req.user.username);
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
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            error: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'PhotoFilter Pro API is running',
        timestamp: new Date().toISOString()
    });
});

// SQS Endpoints

// Send a message to the SQS queue
app.post('/api/sqs/send', authenticateToken, async (req, res) => {
    try {
        const { message, messageAttributes, delaySeconds } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message body is required'
            });
        }

        const result = await sqsHelper.sendMessage(
            message,
            messageAttributes || {},
            delaySeconds || 0
        );

        res.json({
            success: true,
            message: 'Message sent to queue successfully',
            messageId: result.messageId,
            md5OfBody: result.md5OfBody
        });
    } catch (error) {
        console.error('SQS send error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message to queue',
            error: error.message
        });
    }
});

// Receive messages from the SQS queue
app.post('/api/sqs/receive', authenticateToken, async (req, res) => {
    try {
        const { maxNumberOfMessages = 1, waitTimeSeconds = 0, visibilityTimeout } = req.body;

        const messages = await sqsHelper.receiveMessages(
            maxNumberOfMessages,
            waitTimeSeconds,
            visibilityTimeout
        );

        res.json({
            success: true,
            messageCount: messages.length,
            messages: messages
        });
    } catch (error) {
        console.error('SQS receive error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to receive messages from queue',
            error: error.message
        });
    }
});

// Delete a message from the SQS queue
app.delete('/api/sqs/message', authenticateToken, async (req, res) => {
    try {
        const { receiptHandle } = req.body;

        if (!receiptHandle) {
            return res.status(400).json({
                success: false,
                message: 'Receipt handle is required'
            });
        }

        const result = await sqsHelper.deleteMessage(receiptHandle);

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('SQS delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message',
            error: error.message
        });
    }
});

// Change message visibility timeout
app.post('/api/sqs/message/visibility', authenticateToken, async (req, res) => {
    try {
        const { receiptHandle, visibilityTimeout } = req.body;

        if (!receiptHandle || visibilityTimeout === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Receipt handle and visibility timeout are required'
            });
        }

        const result = await sqsHelper.changeMessageVisibility(receiptHandle, visibilityTimeout);

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('SQS change visibility error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change message visibility',
            error: error.message
        });
    }
});

// Get SQS queue information
app.get('/api/sqs/info', authenticateToken, (req, res) => {
    try {
        const queueUrl = sqsHelper.getQueueUrl();
        
        if (!queueUrl) {
            return res.status(404).json({
                success: false,
                message: 'SQS queue URL not configured. Please set SQS_QUEUE_URL in environment variables.'
            });
        }

        res.json({
            success: true,
            queueUrl: queueUrl,
            region: process.env.AWS_REGION || 'ap-southeast-2',
            visibilityTimeout: process.env.SQS_VISIBILITY_TIMEOUT || 30
        });
    } catch (error) {
        console.error('SQS info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue information',
            error: error.message
        });
    }
});

// Get available filters
app.get('/api/filters', (req, res) => {
    res.json({
        success: true,
        filters: filters,
        count: Object.keys(filters).length
    });
});

// Upload single image
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

// Batch upload multiple images
app.post('/api/upload/batch', authenticateToken, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No image files provided'
            });
        }

        const uploadResults = [];
        
        for (const file of req.files) {
            try {
                const imageId = file.filename.split('.')[0];
                const originalPath = file.path;
                const metadata = await sharp(originalPath).metadata();

                uploadResults.push({
                    success: true,
                    imageId: imageId,
                    filename: file.filename,
                    originalName: file.originalname,
                    size: file.size,
                    dimensions: {
                        width: metadata.width,
                        height: metadata.height
                    }
                });
            } catch (fileError) {
                uploadResults.push({
                    success: false,
                    filename: file.originalname,
                    error: fileError.message
                });
            }
        }

        const successCount = uploadResults.filter(r => r.success).length;
        const failCount = uploadResults.length - successCount;

        res.json({
            success: true,
            totalFiles: req.files.length,
            successCount: successCount,
            failCount: failCount,
            results: uploadResults,
            message: `Uploaded ${successCount} of ${req.files.length} images successfully`
        });

    } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading images',
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

        // Check if it's a custom filter
        let customParams = null;
        if (filterName.startsWith('custom:')) {
            const filterId = filterName.replace('custom:', '');
            const userId = req.user.username;
            const userFilters = customFilters.get(userId) || {};
            const customFilter = userFilters[filterId];
            if (!customFilter) {
                return res.status(404).json({
                    success: false,
                    message: 'Custom filter not found'
                });
            }
            customParams = customFilter.params;
            filterName = customFilter.name || 'custom';
        }
        
        // Apply filter
        const filteredImage = await applyFilter(inputPath, filterName, customParams);
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

// Batch process multiple images with all filters
app.post('/api/process/batch', authenticateToken, async (req, res) => {
    try {
        const { imageIds, filterNames } = req.body;

        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Image IDs array is required'
            });
        }

        // If filterNames not provided, use all filters
        const filtersToApply = filterNames && filterNames.length > 0 
            ? filterNames.filter(f => filters[f]) 
            : Object.keys(filters);

        if (filtersToApply.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid filters specified'
            });
        }

        const batchResults = [];

        for (const imageId of imageIds) {
            const uploads = await fs.readdir(uploadsDir);
            const imageFile = uploads.find(file => file.startsWith(imageId));
            
            if (!imageFile) {
                batchResults.push({
                    imageId: imageId,
                    success: false,
                    error: 'Image not found'
                });
                continue;
            }

            const inputPath = path.join(uploadsDir, imageFile);
            const imageResults = [];

            for (const filterKey of filtersToApply) {
                try {
                    const outputFilename = `${imageId}-${filterKey}.png`;
                    const outputPath = path.join(processedDir, outputFilename);

                    const filteredImage = await applyFilter(inputPath, filterKey);
                    await filteredImage.png().toFile(outputPath);

                    const metadata = await sharp(outputPath).metadata();

                    imageResults.push({
                        filterKey: filterKey,
                        filterName: filters[filterKey].name,
                        processedImageUrl: `/api/view/${outputFilename}`,
                        downloadUrl: `/api/download/${outputFilename}`,
                        filename: outputFilename,
                        dimensions: {
                            width: metadata.width,
                            height: metadata.height
                        }
                    });
                } catch (filterError) {
                    imageResults.push({
                        filterKey: filterKey,
                        error: filterError.message
                    });
                }
            }

            batchResults.push({
                imageId: imageId,
                success: true,
                results: imageResults,
                successfulFilters: imageResults.filter(r => !r.error).length
            });
        }

        res.json({
            success: true,
            totalImages: imageIds.length,
            processedImages: batchResults.filter(r => r.success).length,
            results: batchResults,
            message: `Processed ${batchResults.filter(r => r.success).length} of ${imageIds.length} images`
        });

    } catch (error) {
        console.error('Batch processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing batch',
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

// Custom Filter Endpoints

// Create or save a custom filter
app.post('/api/filters/custom', authenticateToken, async (req, res) => {
    try {
        const { name, params } = req.body;
        const userId = req.user.username;

        if (!name || !params) {
            return res.status(400).json({
                success: false,
                message: 'Filter name and parameters are required'
            });
        }

        // Validate parameters
        const validParams = {};
        if (params.brightness !== undefined) validParams.brightness = parseFloat(params.brightness);
        if (params.saturation !== undefined) validParams.saturation = parseFloat(params.saturation);
        if (params.hue !== undefined) validParams.hue = parseFloat(params.hue);
        if (params.blur !== undefined) validParams.blur = parseFloat(params.blur);
        if (params.contrast !== undefined) validParams.contrast = parseFloat(params.contrast);
        if (params.grayscale === true || params.grayscale === 'true') validParams.grayscale = true;
        if (params.invert === true || params.invert === 'true') validParams.invert = true;

        if (Object.keys(validParams).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one valid parameter is required'
            });
        }

        // Store custom filter
        if (!customFilters.has(userId)) {
            customFilters.set(userId, {});
        }
        const userFilters = customFilters.get(userId);
        const filterId = uuidv4();
        userFilters[filterId] = {
            id: filterId,
            name: name,
            params: validParams,
            createdAt: new Date().toISOString()
        };
        customFilters.set(userId, userFilters);

        res.json({
            success: true,
            filterId: filterId,
            filterName: name,
            filterKey: `custom:${filterId}`,
            message: 'Custom filter created successfully'
        });

    } catch (error) {
        console.error('Custom filter creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating custom filter',
            error: error.message
        });
    }
});

// Get user's custom filters
app.get('/api/filters/custom', authenticateToken, (req, res) => {
    try {
        const userId = req.user.username;
        const userFilters = customFilters.get(userId) || {};

        const filtersList = Object.values(userFilters).map(filter => ({
            id: filter.id,
            name: filter.name,
            filterKey: `custom:${filter.id}`,
            params: filter.params,
            createdAt: filter.createdAt
        }));

        res.json({
            success: true,
            filters: filtersList,
            count: filtersList.length
        });

    } catch (error) {
        console.error('Get custom filters error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching custom filters',
            error: error.message
        });
    }
});

// Apply custom filter directly with parameters (without saving)
app.post('/api/apply-custom-filter', authenticateToken, async (req, res) => {
    try {
        const { imageId, params } = req.body;

        if (!imageId || !params) {
            return res.status(400).json({
                success: false,
                message: 'Image ID and filter parameters are required'
            });
        }

        // Find the uploaded image by imageId
        const uploads = await fs.readdir(uploadsDir);
        const imageFile = uploads.find(file => file.startsWith(imageId));
        
        if (!imageFile) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        const inputPath = path.join(uploadsDir, imageFile);
        const outputFilename = `${imageId}-custom-${Date.now()}.png`;
        const outputPath = path.join(processedDir, outputFilename);

        // Apply custom filter
        const filteredImage = await applyFilter(inputPath, null, params);
        await filteredImage.png().toFile(outputPath);

        const metadata = await sharp(outputPath).metadata();

        res.json({
            success: true,
            imageId: imageId,
            processedImageUrl: `/api/view/${outputFilename}`,
            downloadUrl: `/api/download/${outputFilename}`,
            filename: outputFilename,
            originalImageUrl: `/api/view-original/${imageFile}`,
            dimensions: {
                width: metadata.width,
                height: metadata.height
            },
            message: 'Custom filter applied successfully'
        });

    } catch (error) {
        console.error('Custom filter application error:', error);
        res.status(500).json({
            success: false,
            message: 'Error applying custom filter',
            error: error.message
        });
    }
});

// Image comparison endpoint - returns both original and filtered image URLs
app.get('/api/compare/:imageId/:filterName', authenticateToken, async (req, res) => {
    try {
        const { imageId, filterName } = req.params;

        // Find the uploaded image
        const uploads = await fs.readdir(uploadsDir);
        const imageFile = uploads.find(file => file.startsWith(imageId));
        
        if (!imageFile) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        const originalImageUrl = `/api/view-original/${imageFile}`;
        let filteredImageUrl = null;
        let processedFilename = null;

        // If filter is specified, find or create the filtered version
        if (filterName && filterName !== 'none') {
            const outputFilename = `${imageId}-${filterName}.png`;
            const outputPath = path.join(processedDir, outputFilename);
            
            // Check if filtered version exists, if not create it
            if (!await fs.pathExists(outputPath)) {
                // Apply filter if it doesn't exist
                const inputPath = path.join(uploadsDir, imageFile);
                let customParams = null;
                
                if (filterName.startsWith('custom:')) {
                    const filterId = filterName.replace('custom:', '');
                    const userId = req.user.username;
                    const userFilters = customFilters.get(userId) || {};
                    const customFilter = userFilters[filterId];
                    if (customFilter) {
                        customParams = customFilter.params;
                    }
                }
                
                const filteredImage = await applyFilter(inputPath, filterName, customParams);
                await filteredImage.png().toFile(outputPath);
            }
            
            filteredImageUrl = `/api/view/${outputFilename}`;
            processedFilename = outputFilename;
        }

        res.json({
            success: true,
            imageId: imageId,
            originalImageUrl: originalImageUrl,
            filteredImageUrl: filteredImageUrl,
            processedFilename: processedFilename,
            filterName: filterName === 'none' ? null : filterName
        });

    } catch (error) {
        console.error('Image comparison error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting image comparison',
            error: error.message
        });
    }
});

// View original image (for comparison)
app.get('/api/view-original/:filename', authenticateToken, async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadsDir, filename);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Determine content type from file extension
        const ext = path.extname(filename).toLowerCase();
        const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                           ext === '.png' ? 'image/png' :
                           ext === '.gif' ? 'image/gif' : 'image/jpeg';

        res.setHeader('Content-Type', contentType);
        res.sendFile(filePath);

    } catch (error) {
        console.error('View original error:', error);
        res.status(500).json({
            success: false,
            message: 'Error viewing original file',
            error: error.message
        });
    }
});

// Image Sharing Endpoints

// Generate a shareable link for a processed image
app.post('/api/share', authenticateToken, async (req, res) => {
    try {
        const { imageId, filterName, expiresInHours = 24 } = req.body;
        const userId = req.user.username;

        if (!imageId || !filterName) {
            return res.status(400).json({
                success: false,
                message: 'Image ID and filter name are required'
            });
        }

        // Find the processed image
        const processed = await fs.readdir(processedDir);
        const filename = processed.find(file => 
            file.startsWith(imageId) && file.includes(filterName)
        );

        if (!filename) {
            return res.status(404).json({
                success: false,
                message: 'Processed image not found'
            });
        }

        // Generate share token
        const shareToken = uuidv4();
        const expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));

        sharedImages.set(shareToken, {
            imageId,
            filename,
            filterName,
            userId,
            expiresAt: expiresAt.toISOString(),
            createdAt: new Date().toISOString()
        });

        const shareUrl = `${BASE_URL}/api/shared/${shareToken}`;

        res.json({
            success: true,
            shareToken: shareToken,
            shareUrl: shareUrl,
            expiresAt: expiresAt.toISOString(),
            message: 'Shareable link created successfully'
        });

    } catch (error) {
        console.error('Share creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating shareable link',
            error: error.message
        });
    }
});

// Access shared image (no authentication required)
app.get('/api/shared/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const sharedImage = sharedImages.get(token);

        if (!sharedImage) {
            return res.status(404).json({
                success: false,
                message: 'Shared link not found or expired'
            });
        }

        // Check if expired
        if (new Date(sharedImage.expiresAt) < new Date()) {
            sharedImages.delete(token);
            return res.status(410).json({
                success: false,
                message: 'Shared link has expired'
            });
        }

        const filePath = path.join(processedDir, sharedImage.filename);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Image file not found'
            });
        }

        res.setHeader('Content-Type', 'image/png');
        res.sendFile(filePath);

    } catch (error) {
        console.error('Shared image access error:', error);
        res.status(500).json({
            success: false,
            message: 'Error accessing shared image',
            error: error.message
        });
    }
});

// Background Processing with SQS

// Queue image processing job
app.post('/api/process/queue', authenticateToken, async (req, res) => {
    try {
        const { imageId, filterNames, useSQS = true } = req.body;
        const userId = req.user.username;

        if (!imageId) {
            return res.status(400).json({
                success: false,
                message: 'Image ID is required'
            });
        }

        // Verify image exists
        const uploads = await fs.readdir(uploadsDir);
        const imageFile = uploads.find(file => file.startsWith(imageId));
        
        if (!imageFile) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        if (useSQS && QUEUE_URL) {
            // Queue the job via SQS
            const jobId = uuidv4();
            const jobMessage = {
                jobId: jobId,
                userId: userId,
                imageId: imageId,
                imageFile: imageFile,
                filterNames: filterNames || Object.keys(filters),
                createdAt: new Date().toISOString()
            };

            await sqsHelper.sendMessage(
                JSON.stringify(jobMessage),
                {
                    jobType: 'image_processing',
                    userId: userId,
                    imageId: imageId
                }
            );

            res.json({
                success: true,
                jobId: jobId,
                message: 'Processing job queued successfully',
                queued: true,
                estimatedCompletion: 'Processing in background'
            });
        } else {
            // Process synchronously if SQS not available
            const filtersToApply = filterNames && filterNames.length > 0 
                ? filterNames.filter(f => filters[f]) 
                : Object.keys(filters);

            const inputPath = path.join(uploadsDir, imageFile);
            const results = [];

            for (const filterKey of filtersToApply) {
                try {
                    const outputFilename = `${imageId}-${filterKey}.png`;
                    const outputPath = path.join(processedDir, outputFilename);
                    const filteredImage = await applyFilter(inputPath, filterKey);
                    await filteredImage.png().toFile(outputPath);

                    const metadata = await sharp(outputPath).metadata();
                    results.push({
                        filterKey: filterKey,
                        filterName: filters[filterKey].name,
                        processedImageUrl: `/api/view/${outputFilename}`,
                        downloadUrl: `/api/download/${outputFilename}`,
                        filename: outputFilename,
                        dimensions: {
                            width: metadata.width,
                            height: metadata.height
                        }
                    });
                } catch (filterError) {
                    results.push({
                        filterKey: filterKey,
                        error: filterError.message
                    });
                }
            }

            res.json({
                success: true,
                imageId: imageId,
                results: results,
                queued: false,
                message: 'Processing completed'
            });
        }

    } catch (error) {
        console.error('Queue processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Error queueing processing job',
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
    try {
        // Ensure DynamoDB table exists
        console.log('⏳ Checking DynamoDB table...');
        await userRepo.ensureTableExists();
        
        // Initialize default user
        await initializeDefaultUser();
    } catch (error) {
        if (error.name === 'UnrecognizedClientException' || error.message.includes('security token')) {
            console.error('❌ AWS session token has expired or is invalid.');
            console.error('   Please update your AWS credentials in .aws/credentials');
            console.error('   Get fresh credentials from AWS Console or your instructor.');
        } else {
            console.error('❌ Error during startup:', error.message);
            console.error('Make sure AWS credentials are configured and the DynamoDB table can be created.');
        }
    }
    
    console.log(`🚀 PhotoFilter Pro API server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${uploadsDir}`);
    console.log(`📁 Processed directory: ${processedDir}`);
    console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
    console.log(`🔐 JWT Authentication: Enabled`);
    console.log(`📖 Available endpoints:`);
    if (cognito) {
        console.log(`   POST /api/cognito/signup - Cognito signup`);
        console.log(`   POST /api/cognito/confirm - Cognito email confirmation`);
        console.log(`   POST /api/cognito/login - Cognito login`);
        console.log(`   POST /api/cognito/resend-code - Resend confirmation code`);
    }
    console.log(`   POST /api/register - User registration (Legacy)`);
    console.log(`   POST /api/login - User login (Legacy)`);
    console.log(`   GET  /api/verify-email - Email verification`);
    console.log(`   POST /api/resend-verification - Resend verification email`);
    console.log(`   POST /api/refresh - Refresh access token`);
    console.log(`   POST /api/logout - User logout`);
    console.log(`   GET  /api/profile - Get user profile`);
    console.log(`   GET  /api/health - Health check`);
    console.log(`   GET  /api/filters - Get available filters`);
    console.log(`   POST /api/upload - Upload single image (🔒)`);
    console.log(`   POST /api/upload/batch - Batch upload multiple images (🔒)`);
    console.log(`   POST /api/apply-filter - Apply single filter (🔒)`);
    console.log(`   POST /api/apply-all-filters - Apply all filters (🔒)`);
    console.log(`   POST /api/process/batch - Batch process multiple images (🔒)`);
    console.log(`   GET  /api/view/:filename - View processed image (🔒)`);
    console.log(`   GET  /api/view-original/:filename - View original image (🔒)`);
    console.log(`   GET  /api/download/:filename - Download processed image (🔒)`);
    console.log(`   GET  /api/image/:imageId - Get image info (🔒)`);
    console.log(`   GET  /api/download-original/:filename - Download original image (🔒)`);
    console.log(`   GET  /api/compare/:imageId/:filterName - Compare original vs filtered (🔒)`);
    console.log(`   POST /api/filters/custom - Create custom filter (🔒)`);
    console.log(`   GET  /api/filters/custom - Get user's custom filters (🔒)`);
    console.log(`   POST /api/apply-custom-filter - Apply custom filter directly (🔒)`);
    console.log(`   POST /api/share - Generate shareable link (🔒)`);
    console.log(`   GET  /api/shared/:token - Access shared image (public)`);
    console.log(`   POST /api/process/queue - Queue background processing job (🔒)`);
    console.log(`   DELETE /api/cleanup - Clean up old files`);
    console.log(`\n📬 SQS Endpoints:`);
    console.log(`   POST /api/sqs/send - Send message to queue (🔒)`);
    console.log(`   POST /api/sqs/receive - Receive messages from queue (🔒)`);
    console.log(`   DELETE /api/sqs/message - Delete message from queue (🔒)`);
    console.log(`   POST /api/sqs/message/visibility - Change message visibility timeout (🔒)`);
    console.log(`   GET  /api/sqs/info - Get queue information (🔒)`);
    console.log(`\n🔑 Default user: anter / kingkong`);
});

module.exports = app;
