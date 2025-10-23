// Email Configuration Example
// Copy this file to email-config.js and update with your email settings

module.exports = {
    // Gmail Configuration (Recommended)
    gmail: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: 'your-email@gmail.com',
            pass: 'your-app-password' // Use App Password, not regular password
        }
    },

    // Outlook Configuration
    outlook: {
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
        auth: {
            user: 'your-email@outlook.com',
            pass: 'your-password'
        }
    },

    // Yahoo Configuration
    yahoo: {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false,
        auth: {
            user: 'your-email@yahoo.com',
            pass: 'your-app-password'
        }
    },

    // Custom SMTP Configuration
    custom: {
        host: 'your-smtp-server.com',
        port: 587,
        secure: false,
        auth: {
            user: 'your-email@yourdomain.com',
            pass: 'your-password'
        }
    }
};

// Instructions:
// 1. Choose your email provider configuration above
// 2. Update the credentials with your actual email and password
// 3. For Gmail/Yahoo: Use App Passwords (not regular passwords)
// 4. Set environment variables:
//    EMAIL_USER=your-email@gmail.com
//    EMAIL_PASS=your-app-password
//    EMAIL_HOST=smtp.gmail.com
//    EMAIL_PORT=587
//    EMAIL_FROM=PhotoFilter Pro <noreply@photofilterpro.com>
//    BASE_URL=http://localhost:3000
