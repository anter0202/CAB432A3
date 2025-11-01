// PhotoFilter Pro API Client JavaScript
class PhotoFilterAPI {
    constructor() {
        // Use the current origin so it works both locally and on a deployed host
        this.apiBaseUrl = window.location.origin;
        this.currentImageId = null;
        this.selectedResult = null;
        this.results = [];
        this.authToken = localStorage.getItem('authToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        this.authType = localStorage.getItem('authType') || 'legacy'; // 'cognito' or 'legacy'
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAPIHealth();
        this.checkAuthStatus();
    }

    // Helper method to get auth headers
    async refreshAuthToken() {
        // Cognito tokens cannot be refreshed via /api/refresh endpoint
        // They need to be refreshed through Cognito API or user needs to re-login
        if (this.authType === 'cognito') {
            console.log('Cognito tokens cannot be refreshed via this endpoint. Please log in again.');
            return false;
        }

        if (!this.refreshToken) {
            console.log('No refresh token available');
            return false;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            const data = await response.json();

            if (data.success) {
                // Update tokens
                this.authToken = data.token;
                this.refreshToken = data.refreshToken;
                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('refreshToken', this.refreshToken);
                
                console.log('Token refreshed successfully');
                return true;
            } else {
                console.log('Token refresh failed:', data.message);
                this.handleLogout();
                return false;
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.handleLogout();
            return false;
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        // If unauthorized or forbidden, try to refresh token
        if ((response.status === 401 || response.status === 403) && this.refreshToken) {
            // Check if it's an expired token error
            let errorData = null;
            try {
                const text = await response.clone().text();
                errorData = JSON.parse(text);
            } catch (e) {
                // Ignore parse errors
            }
            
            // Only refresh on 401 or if error message indicates expired token
            if (response.status === 401 || (errorData && errorData.message && errorData.message.includes('expired'))) {
                console.log('Access token expired, attempting refresh...');
                const refreshed = await this.refreshAuthToken();
                
                if (refreshed) {
                    // Retry the request with new token
                    headers['Authorization'] = `Bearer ${this.authToken}`;
                    return fetch(url, {
                        ...options,
                        headers
                    });
                }
            }
        }

        return response;
    }

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        return headers;
    }

    // Check if user is already authenticated
    checkAuthStatus() {
        if (this.authToken && this.currentUser) {
            document.getElementById('welcomeUser').textContent = `Welcome, ${this.currentUser.username}!`;
            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('appScreen').classList.add('active');
        }
    }

    async checkAPIHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            const data = await response.json();
            console.log('API Health Check:', data);
        } catch (error) {
            console.error('API Health Check Failed:', error);
            alert('API server is not running. Please start the server first.');
        }
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Registration form
        document.getElementById('registrationForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegistration();
        });

        // Show/hide registration form
        document.getElementById('showRegister').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegistrationForm();
        });

        document.getElementById('showLogin').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        // Email verification buttons
        document.getElementById('resendVerificationBtn').addEventListener('click', () => {
            this.resendVerificationEmail();
        });

        document.getElementById('backToLoginBtn').addEventListener('click', () => {
            this.hideEmailVerificationScreen();
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    this.handleFileUpload(e.target.files[0]);
                }
            });
        }

        const batchFileInputElement = document.getElementById('batchFileInput');
        if (batchFileInputElement) {
            // Ensure multiple attribute is set
            batchFileInputElement.setAttribute('multiple', 'multiple');
            
            batchFileInputElement.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                console.log(`Batch file picker: ${files.length} files selected`, files.map(f => f.name));
                
                if (files.length === 0) {
                    console.log('No files selected');
                    return;
                }
                
                if (files.length === 1) {
                    // Only one file selected - ask if they want to use batch or single
                    if (confirm('You selected only 1 file. Did you want to select multiple?\n\nClick OK to use Single Upload, or Cancel to try Batch Upload again (use Ctrl+Click to select multiple files).')) {
                        // Use single upload
                        this.handleFileUpload(files[0]);
                        // Reset batch input
                        e.target.value = '';
                    } else {
                        // Reset and let them try again
                        e.target.value = '';
                        setTimeout(() => {
                            batchFileInputElement.click();
                        }, 100);
                        return;
                    }
                } else {
                    // Multiple files - use batch upload
                    this.handleBatchUpload(files);
                }
            });
        } else {
            console.warn('Batch file input not found');
        }
        
        // Help text is now always visible, no need to show/hide

        uploadArea.addEventListener('click', (e) => {
            // Only trigger single upload if clicking directly on the upload area
            if (!e.target.closest('.upload-buttons')) {
                fileInput.click();
            }
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
            
            if (files.length === 0) {
                alert('Please drop image files only');
                return;
            }
            
            if (files.length === 1) {
                // Single file - use single upload
                this.handleFileUpload(files[0]);
            } else {
                // Multiple files - use batch upload
                this.handleBatchUpload(files);
            }
        });

        // Camera functionality
        document.getElementById('cameraBtn').addEventListener('click', () => {
            this.toggleCamera();
        });

        // Action buttons
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadSelectedImage();
        });

        document.getElementById('shareBtn').addEventListener('click', () => {
            this.shareImage();
        });

        document.getElementById('newPhotoBtn').addEventListener('click', () => {
            this.newPhoto();
        });
        
        // Cancel processing button
        const cancelBtn = document.getElementById('cancelProcessingBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (confirm('Cancel processing and return to upload? This will stop the current operation.')) {
                    // Abort any ongoing fetch requests
                    if (this.currentAbortController) {
                        this.currentAbortController.abort();
                        this.currentAbortController = null;
                    }
                    this.newPhoto();
                }
            });
        }

        // Custom filter buttons (multiple locations)
        const customFilterBtn = document.getElementById('customFilterBtn');
        if (customFilterBtn) {
            customFilterBtn.addEventListener('click', () => {
                this.showCustomFilterCreator();
            });
        } else {
            console.warn('Custom filter button (upload section) not found');
        }
        
        // Custom filter button in results section
        const customFilterBtnResults = document.getElementById('customFilterBtnResults');
        if (customFilterBtnResults) {
            customFilterBtnResults.addEventListener('click', () => {
                this.showCustomFilterCreator();
            });
        }
        
        // Custom filter button in processing section
        const customFilterBtnProcessing = document.getElementById('customFilterBtnProcessing');
        if (customFilterBtnProcessing) {
            customFilterBtnProcessing.addEventListener('click', () => {
                this.showCustomFilterCreator();
            });
        }

        // Custom filter controls
        try {
            this.setupCustomFilterControls();
        } catch (error) {
            console.error('Error setting up custom filter controls:', error);
        }

        // Compare button
        const compareBtn = document.getElementById('compareModeBtn');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => {
                this.showComparison();
            });
        }

        const closeComparisonBtn = document.getElementById('closeComparisonBtn');
        if (closeComparisonBtn) {
            closeComparisonBtn.addEventListener('click', () => {
                this.hideComparison();
            });
        }

        // Custom filter action buttons
        const previewCustomBtn = document.getElementById('previewCustomBtn');
        if (previewCustomBtn) {
            previewCustomBtn.addEventListener('click', () => {
                this.previewCustomFilter();
            });
        } else {
            console.warn('Preview custom filter button not found');
        }

        const saveCustomBtn = document.getElementById('saveCustomBtn');
        if (saveCustomBtn) {
            saveCustomBtn.addEventListener('click', () => {
                this.saveCustomFilter();
            });
        } else {
            console.warn('Save custom filter button not found');
        }

        const cancelCustomBtn = document.getElementById('cancelCustomBtn');
        if (cancelCustomBtn) {
            cancelCustomBtn.addEventListener('click', () => {
                this.hideCustomFilterCreator();
            });
        } else {
            console.warn('Cancel custom filter button not found');
        }
    }

    showRegistrationForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }

    showLoginForm() {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    }

    async handleRegistration() {
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        
        // Try Cognito signup first
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/cognito/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (data.success) {
                // Show email confirmation prompt
                const confirmationCode = prompt(
                    `Registration successful! Please check your email (${email}) for a confirmation code.\n\nEnter the 6-digit confirmation code:`,
                    ''
                );
                
                if (confirmationCode) {
                    // Confirm the user
                    try {
                        const confirmResponse = await fetch(`${this.apiBaseUrl}/api/cognito/confirm`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ username, confirmationCode })
                        });

                        const confirmData = await confirmResponse.json();
                        
                        if (confirmData.success) {
                            alert('Email confirmed successfully! Please log in.');
                            // Reset forms
                            this.showLoginForm();
                            document.getElementById('regUsername').value = '';
                            document.getElementById('regEmail').value = '';
                            document.getElementById('regPassword').value = '';
                        } else {
                            alert('Confirmation failed: ' + (confirmData.message || confirmData.error));
                        }
                    } catch (confirmError) {
                        console.error('Confirmation error:', confirmError);
                        alert('Confirmation failed. You can confirm your email later.');
                        this.showLoginForm();
                    }
                } else {
                    alert('Registration successful! Check your email for the confirmation code. You can confirm later.');
                    this.showLoginForm();
                }
                return;
            } else {
                // Show detailed error message
                let errorMsg = data.message || 'Registration failed';
                if (data.error && data.error.includes('Password')) {
                    errorMsg += '\n\nPassword requirements:\n- At least 8 characters\n- At least 1 uppercase letter\n- At least 1 lowercase letter\n- At least 1 number\n- At least 1 symbol (!@#$%^&*)';
                }
                alert(errorMsg);
                return;
            }
        } catch (cognitoError) {
            console.log('Cognito signup failed, trying legacy:', cognitoError);
            // Fallback to legacy registration
        }

        // Fallback to legacy registration
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (data.success) {
                // Check if email verification is required
                if (data.emailVerificationRequired && !data.emailVerified) {
                    // Show email verification screen
                    this.showEmailVerificationScreen(username);
                    return;
                }

                // Store token and user data
                this.authToken = data.token;
                this.refreshToken = data.refreshToken;
                this.currentUser = data.user;
                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('refreshToken', this.refreshToken);
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));

                // Update UI
                document.getElementById('welcomeUser').textContent = `Welcome, ${this.currentUser.username}!`;
                document.getElementById('loginScreen').classList.remove('active');
                document.getElementById('appScreen').classList.add('active');
                
                // Reset forms
                this.showLoginForm();
                document.getElementById('regUsername').value = '';
                document.getElementById('regEmail').value = '';
                document.getElementById('regPassword').value = '';
                
                console.log('Registration successful:', this.currentUser);
                alert('Account created successfully!');
            } else {
                alert(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed: ' + error.message);
        }
    }

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        if (!username || !password) {
            alert('Please enter both username and password');
            return;
        }
        
        // Try Cognito login first
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/cognito/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                // Store Cognito tokens
                this.authToken = data.idToken; // Use ID token for Cognito
                this.refreshToken = data.refreshToken;
                this.currentUser = data.user;
                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('refreshToken', this.refreshToken);
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                localStorage.setItem('authType', 'cognito');

                // Update UI
                document.getElementById('welcomeUser').textContent = `Welcome, ${this.currentUser.username}!`;
                document.getElementById('loginScreen').classList.remove('active');
                document.getElementById('appScreen').classList.add('active');
                
                console.log('Cognito login successful:', this.currentUser);
                return;
            } else {
                // Show specific error messages
                let errorMsg = data.message || 'Login failed';
                if (data.message && data.message.includes('not confirmed')) {
                    errorMsg += '\n\nPlease check your email and confirm your account first, then try logging in again.';
                } else if (data.message && data.message.includes('Invalid')) {
                    errorMsg += '\n\nIf you haven\'t registered yet, please create an account first.';
                }
                alert(errorMsg);
                return;
            }
        } catch (cognitoError) {
            console.error('Cognito login error:', cognitoError);
            
            // If Cognito endpoint doesn't exist or fails, try legacy
            if (cognitoError.message && cognitoError.message.includes('Failed to fetch')) {
                alert('Cannot connect to server. Please make sure the server is running.');
                return;
            }
            
            // Try legacy login as fallback
            try {
                const response = await fetch(`${this.apiBaseUrl}/api/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    // Store token and user data
                    this.authToken = data.token;
                    this.refreshToken = data.refreshToken;
                    this.currentUser = data.user;
                    localStorage.setItem('authToken', this.authToken);
                    localStorage.setItem('refreshToken', this.refreshToken);
                    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                    localStorage.setItem('authType', 'legacy');

                    // Update UI
                    document.getElementById('welcomeUser').textContent = `Welcome, ${this.currentUser.username}!`;
                    document.getElementById('loginScreen').classList.remove('active');
                    document.getElementById('appScreen').classList.add('active');
                    
                    console.log('Legacy login successful:', this.currentUser);
                } else {
                    alert(data.message || 'Login failed');
                }
            } catch (error) {
                console.error('Legacy login error:', error);
                alert('Login failed. Please make sure:\n1. You have registered an account\n2. Your account email is confirmed (check your email)\n3. You are using the correct username and password');
            }
        }
    }

    showEmailVerificationScreen(username) {
        // Store username for resend functionality
        this.pendingVerificationUsername = username;
        
        // Hide login screen and show verification screen
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('emailVerificationSection').style.display = 'flex';
    }

    hideEmailVerificationScreen() {
        document.getElementById('emailVerificationSection').style.display = 'none';
        document.getElementById('loginScreen').classList.add('active');
    }

    async resendVerificationEmail() {
        if (!this.pendingVerificationUsername) {
            alert('No pending verification found');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/resend-verification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: this.pendingVerificationUsername })
            });

            const data = await response.json();

            if (data.success) {
                alert('Verification email sent successfully!');
            } else {
                alert(data.message || 'Failed to resend verification email');
            }
        } catch (error) {
            console.error('Resend verification error:', error);
            alert('Failed to resend verification email: ' + error.message);
        }
    }

    async handleLogout() {
        try {
            // Call logout endpoint to clear server-side refresh tokens
            if (this.authToken) {
                await fetch(`${this.apiBaseUrl}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
        }

        // Clear authentication data
        this.authToken = null;
        this.refreshToken = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('currentUser');
        
        // Reset UI
        document.getElementById('loginScreen').classList.add('active');
        document.getElementById('appScreen').classList.remove('active');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        // Reset app state
        this.newPhoto();
        
        console.log('Logged out successfully');
    }

    async handleFileUpload(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select a valid image file');
            return;
        }

        console.log('File selected:', file.name, file.type, file.size);
        
        // Store abort controller for cancellation
        this.currentAbortController = new AbortController();
        
        this.showPhotoEditor();
        this.updateProgress('Step 1: Uploading image to server...');

        try {
            // Upload image to API with token refresh support
            const formData = new FormData();
            formData.append('image', file);

            let response = await fetch(`${this.apiBaseUrl}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData,
                signal: this.currentAbortController?.signal
            });

            // If unauthorized or forbidden (token expired/invalid), try to refresh token and retry
            if (response.status === 401 || response.status === 403) {
                // Try to get error message first
                let errorData = null;
                try {
                    const text = await response.clone().text();
                    errorData = JSON.parse(text);
                } catch (e) {
                    // Ignore parse errors
                }

                // Only attempt refresh if we have a refresh token and it's likely an expired token
                if ((response.status === 401 || (errorData && errorData.message && errorData.message.includes('expired'))) && this.refreshToken) {
                    console.log('Access token expired or invalid, attempting refresh...');
                    const refreshed = await this.refreshAuthToken();
                    
                    if (refreshed) {
                        // Retry the request with new token
                        response = await fetch(`${this.apiBaseUrl}/api/upload`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.authToken}`
                            },
                            body: formData
                        });
                    } else {
                        this.handleLogout();
                        alert('Your session has expired. Please log in again.');
                        throw new Error('Session expired. Please login again.');
                    }
                } else {
                    // Token is invalid and can't be refreshed
                    console.error('Authentication failed:', errorData?.message || `Status ${response.status}`);
                    this.handleLogout();
                    alert('Authentication failed. Please log in again.');
                    throw new Error(errorData?.message || 'Authentication failed');
                }
            }

            // Check if response is OK before parsing JSON
            if (!response.ok) {
                let errorMessage = 'Upload failed';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = `Upload failed with status ${response.status}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (data.success) {
                console.log('Image uploaded successfully:', data);
                this.currentImageId = data.imageId;
                
                // Show custom filter button now that image is uploaded (while processing)
                const customFilterBtnProcessing = document.getElementById('customFilterBtnProcessing');
                if (customFilterBtnProcessing) {
                    customFilterBtnProcessing.style.display = 'block';
                }
                const cancelBtn = document.getElementById('cancelProcessingBtn');
                if (cancelBtn) {
                    cancelBtn.style.display = 'block';
                }
                
                this.updateProgress('Step 2: Processing filters on server...');
                await this.processAllFilters();
            } else {
                throw new Error(data.message || 'Upload failed');
            }

        } catch (error) {
            // Don't show alert if user cancelled
            if (error.name === 'AbortError') {
                console.log('Upload cancelled by user');
                this.hidePhotoEditor();
                return;
            }
            console.error('Upload error:', error);
            alert('Error uploading image: ' + error.message);
            this.hidePhotoEditor();
        } finally {
            this.currentAbortController = null;
        }
    }

    async processAllFilters() {
        try {
            this.updateProgress('Step 3: Applying all filters...');

            let response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/apply-all-filters`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageId: this.currentImageId
                })
            });

            const data = await response.json();

            if (data.success) {
                console.log('All filters processed:', data);
                this.results = data.results.filter(result => !result.error);
                this.updateProgress('Step 4: Loading results...');
                setTimeout(async () => {
                    await this.showResults();
                }, 500);
            } else {
                throw new Error(data.message || 'Filter processing failed');
            }

        } catch (error) {
            console.error('Filter processing error:', error);
            alert('Error processing filters: ' + error.message);
            this.hidePhotoEditor();
        }
    }

    showPhotoEditor() {
        document.getElementById('photoEditor').style.display = 'block';
        document.querySelector('.upload-section').style.display = 'none';
        document.getElementById('processingSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';
        
        // Show cancel button during processing
        const cancelBtn = document.getElementById('cancelProcessingBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'block';
        }
        
        // Show custom filter button in processing section (as soon as image is uploaded)
        const customFilterBtnProcessing = document.getElementById('customFilterBtnProcessing');
        if (customFilterBtnProcessing && this.currentImageId) {
            customFilterBtnProcessing.style.display = 'block';
        }
    }

    hidePhotoEditor() {
        document.getElementById('photoEditor').style.display = 'none';
        document.querySelector('.upload-section').style.display = 'grid';
        
        // Hide cancel button
        const cancelBtn = document.getElementById('cancelProcessingBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
        
        // Reset batch file list
        const batchFileList = document.getElementById('batchFileList');
        if (batchFileList) {
            batchFileList.style.display = 'none';
        }
    }

    updateProgress(message) {
        const progressInfo = document.getElementById('progressInfo');
        if (progressInfo) {
            progressInfo.innerHTML = `<p>${message}</p>`;
        }
    }

    async showResults() {
        document.getElementById('processingSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
        
        // Hide cancel button and processing custom filter button when showing results
        const cancelBtn = document.getElementById('cancelProcessingBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
        const customFilterBtnProcessing = document.getElementById('customFilterBtnProcessing');
        if (customFilterBtnProcessing) {
            customFilterBtnProcessing.style.display = 'none';
        }
        
        const resultsGrid = document.getElementById('resultsGrid');
        resultsGrid.innerHTML = '';
        
        // Process results in parallel with timeout to avoid hanging
        const imageLoadPromises = this.results.map(async (result, i) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            resultItem.dataset.index = i;
            
            // Show placeholder immediately
            resultItem.innerHTML = `
                <div class="result-image-container">
                    <div class="result-image-placeholder">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading...</span>
                    </div>
                </div>
                <div class="result-label">
                    <i class="fas fa-image"></i>
                    ${result.filterName}
                </div>
            `;
            resultsGrid.appendChild(resultItem);
            
            try {
                // Add timeout to image loading (10 seconds max per image)
                const loadImageWithTimeout = Promise.race([
                    this.getImageAsBase64(result.processedImageUrl),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Image load timeout')), 10000)
                    )
                ]);
                
                const base64Image = await loadImageWithTimeout;
                resultItem.innerHTML = `
                    <div class="result-image-container">
                        <img src="data:image/png;base64,${base64Image}" alt="${result.filterName}" class="result-image">
                    </div>
                    <div class="result-label">
                        <i class="fas fa-image"></i>
                        ${result.filterName}
                    </div>
                `;
            } catch (error) {
                console.error(`Error loading image for ${result.filterName}:`, error);
                resultItem.innerHTML = `
                    <div class="result-image-container">
                        <div class="result-image-placeholder">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>Failed to load</span>
                        </div>
                    </div>
                    <div class="result-label">
                        <i class="fas fa-image"></i>
                        ${result.filterName}
                    </div>
                `;
            }
            
            resultItem.addEventListener('click', () => {
                this.selectResult(i);
            });
        });
        
        // Wait for all images to load (or timeout)
        await Promise.allSettled(imageLoadPromises);
        
        // Reset button states
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('shareBtn').disabled = true;
        document.getElementById('compareModeBtn').style.display = 'none';
    }

    selectResult(index) {
        // Remove previous selection
        document.querySelectorAll('.result-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        document.querySelector(`[data-index="${index}"]`).classList.add('selected');
        
        // Store selected result
        this.selectedResult = this.results[index];
        
        // Enable download and share buttons
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('shareBtn').disabled = false;
        
        // Show compare button
        document.getElementById('compareModeBtn').style.display = 'flex';
    }

    async downloadSelectedImage() {
        if (!this.selectedResult) {
            alert('Please select a filter result first');
            return;
        }
        
        try {
            console.log('Downloading:', this.selectedResult);
            const downloadUrl = `${this.apiBaseUrl}${this.selectedResult.downloadUrl || this.selectedResult.processedImageUrl}`;
            console.log('Download URL:', downloadUrl);
            
            // Use authenticated request to get the image blob
            const response = await this.makeAuthenticatedRequest(downloadUrl);
            
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }
            
            // Get the blob from the response
            const blob = await response.blob();
            
            // Create a blob URL and trigger download
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `filtered-photo-${this.selectedResult.filterName.toLowerCase().replace(/\s+/g, '-')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the blob URL
            window.URL.revokeObjectURL(blobUrl);
            
            console.log('Download started for:', this.selectedResult.filterName);
        } catch (error) {
            console.error('Download error:', error);
            alert('Error downloading image: ' + error.message);
        }
    }

    // Camera functionality
    async toggleCamera() {
        const video = document.getElementById('video');
        const cameraBtn = document.getElementById('cameraBtn');
        
        if (video.hidden) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: 640, height: 480 } 
                });
                video.srcObject = stream;
                video.hidden = false;
                cameraBtn.innerHTML = '<i class="fas fa-stop"></i> Capture Photo';
            } catch (err) {
                alert('Camera access denied or not available');
            }
        } else {
            this.capturePhoto();
        }
    }

    capturePhoto() {
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        // Stop camera
        video.srcObject.getTracks().forEach(track => track.stop());
        video.hidden = true;
        document.getElementById('cameraBtn').innerHTML = '<i class="fas fa-camera"></i> Take Photo';
        
        // Convert canvas to blob and upload
        canvas.toBlob((blob) => {
            const file = new File([blob], 'camera-photo.png', { type: 'image/png' });
            this.handleFileUpload(file);
        });
    }

    newPhoto() {
        // Abort any ongoing requests
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        
        this.hidePhotoEditor();
        this.hideComparison();
        this.hideCustomFilterCreator();
        document.getElementById('fileInput').value = '';
        document.getElementById('batchFileInput').value = '';
        this.currentImageId = null;
        this.selectedResult = null;
        this.results = [];
        
        // Reset buttons
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('shareBtn').disabled = true;
        document.getElementById('compareModeBtn').style.display = 'none';
        
        // Stop camera if running
        const video = document.getElementById('video');
        if (video && !video.hidden && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.hidden = true;
            document.getElementById('cameraBtn').innerHTML = '<i class="fas fa-camera"></i> Take Photo';
        }
        
        // Ensure upload section is visible and interactive
        const uploadSection = document.querySelector('.upload-section');
        if (uploadSection) {
            uploadSection.style.display = 'grid';
            uploadSection.style.pointerEvents = 'auto';
            uploadSection.style.opacity = '1';
        }
        
        // Enable custom filter button
        const customFilterBtn = document.getElementById('customFilterBtn');
        if (customFilterBtn) {
            customFilterBtn.disabled = false;
            customFilterBtn.style.pointerEvents = 'auto';
            customFilterBtn.style.opacity = '1';
        }
    }

    // Batch Upload Feature
    async handleBatchUpload(files) {
        if (files.length === 0) return;
        
        // Limit to 10 files
        if (files.length > 10) {
            alert('Maximum 10 images allowed. Only the first 10 will be uploaded.');
            files = files.slice(0, 10);
        }

        // Show file count and file names
        const batchFileList = document.getElementById('batchFileList');
        const batchFileCount = document.getElementById('batchFileCount');
        batchFileList.style.display = 'block';
        
        const fileNames = files.slice(0, 3).map(f => f.name).join(', ');
        const moreCount = files.length > 3 ? ` and ${files.length - 3} more` : '';
        batchFileCount.textContent = `✓ ${files.length} file(s) selected: ${fileNames}${moreCount}`;

        this.showPhotoEditor();
        this.updateProgress(`Uploading ${files.length} images...`);

        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('images', file);
            });

            let response = await fetch(`${this.apiBaseUrl}/api/upload/batch`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });

            if (response.status === 401 || response.status === 403) {
                const refreshed = await this.refreshAuthToken();
                if (refreshed) {
                    response = await fetch(`${this.apiBaseUrl}/api/upload/batch`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.authToken}`
                        },
                        body: formData
                    });
                } else {
                    throw new Error('Session expired');
                }
            }

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                const imageIds = data.results.filter(r => r.success).map(r => r.imageId);
                if (imageIds.length > 0) {
                    this.updateProgress(`Processing ${imageIds.length} images with filters...`);
                    await this.processBatchImages(imageIds);
                } else {
                    throw new Error('No images uploaded successfully');
                }
            } else {
                throw new Error(data.message || 'Batch upload failed');
            }
        } catch (error) {
            console.error('Batch upload error:', error);
            alert('Error uploading images: ' + error.message);
            this.hidePhotoEditor();
        }
    }

    async processBatchImages(imageIds) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/process/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageIds })
            });

            const data = await response.json();

            if (data.success) {
                // Combine all results
                this.results = [];
                data.results.forEach(imageResult => {
                    if (imageResult.success && imageResult.results) {
                        imageResult.results.forEach(filterResult => {
                            this.results.push({
                                ...filterResult,
                                imageId: imageResult.imageId
                            });
                        });
                    }
                });

                this.updateProgress('Loading results...');
                setTimeout(async () => {
                    await this.showResults();
                }, 500);
            } else {
                throw new Error(data.message || 'Batch processing failed');
            }
        } catch (error) {
            console.error('Batch processing error:', error);
            alert('Error processing images: ' + error.message);
            this.hidePhotoEditor();
        }
    }

    // Image Comparison Feature
    async showComparison() {
        if (!this.currentImageId || !this.selectedResult) {
            alert('Please select a filter result first');
            return;
        }

        try {
            const filterName = this.selectedResult.filterKey || this.selectedResult.filterName.toLowerCase().replace(/\s+/g, '-');
            const response = await this.makeAuthenticatedRequest(
                `${this.apiBaseUrl}/api/compare/${this.currentImageId}/${filterName}`
            );

            const data = await response.json();

            if (data.success) {
                // Hide results section and show comparison
                document.getElementById('resultsSection').style.display = 'none';
                document.getElementById('comparisonSection').style.display = 'block';

                // Load images
                const originalImg = document.getElementById('originalImage');
                const filteredImg = document.getElementById('filteredImage');

                originalImg.src = `${this.apiBaseUrl}${data.originalImageUrl}`;
                filteredImg.src = `${this.apiBaseUrl}${data.filteredImageUrl}`;

                originalImg.onerror = () => {
                    alert('Error loading original image');
                };
                filteredImg.onerror = () => {
                    alert('Error loading filtered image');
                };
            } else {
                throw new Error(data.message || 'Comparison failed');
            }
        } catch (error) {
            console.error('Comparison error:', error);
            alert('Error showing comparison: ' + error.message);
        }
    }

    hideComparison() {
        document.getElementById('comparisonSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
    }

    // Custom Filter Feature
    setupCustomFilterControls() {
        // Update value displays as sliders change
        const sliders = ['brightness', 'saturation', 'hue', 'blur', 'contrast'];
        sliders.forEach(name => {
            const slider = document.getElementById(`${name}Slider`);
            const valueDisplay = document.getElementById(`${name}Value`);
            if (slider && valueDisplay) {
                slider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    if (name === 'hue') {
                        valueDisplay.textContent = `${value}°`;
                    } else {
                        valueDisplay.textContent = value.toFixed(1);
                    }
                });
            }
        });
    }

    showCustomFilterCreator() {
        if (!this.currentImageId) {
            alert('Please upload an image first');
            return;
        }

        // Reset form
        document.getElementById('customFilterName').value = '';
        document.getElementById('brightnessSlider').value = 1.0;
        document.getElementById('saturationSlider').value = 1.0;
        document.getElementById('hueSlider').value = 0;
        document.getElementById('blurSlider').value = 0;
        document.getElementById('contrastSlider').value = 1.0;
        document.getElementById('grayscaleCheck').checked = false;
        document.getElementById('invertCheck').checked = false;

        // Update displays
        document.getElementById('brightnessValue').textContent = '1.0';
        document.getElementById('saturationValue').textContent = '1.0';
        document.getElementById('hueValue').textContent = '0°';
        document.getElementById('blurValue').textContent = '0';
        document.getElementById('contrastValue').textContent = '1.0';

        // Hide other sections and show custom filter section
        document.getElementById('processingSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('comparisonSection').style.display = 'none';
        document.getElementById('customFilterSection').style.display = 'block';
    }

    hideCustomFilterCreator() {
        document.getElementById('customFilterSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
    }

    async previewCustomFilter() {
        if (!this.currentImageId) {
            alert('Please upload an image first');
            return;
        }

        try {
            const params = this.getCustomFilterParams();
            this.updateProgress('Applying custom filter...');

            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/apply-custom-filter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageId: this.currentImageId,
                    params: params
                })
            });

            const data = await response.json();

            if (data.success) {
                // Show the result in comparison view
                document.getElementById('customFilterSection').style.display = 'none';
                document.getElementById('comparisonSection').style.display = 'block';

                const originalImg = document.getElementById('originalImage');
                const filteredImg = document.getElementById('filteredImage');

                originalImg.src = `${this.apiBaseUrl}${data.originalImageUrl}`;
                filteredImg.src = `${this.apiBaseUrl}${data.processedImageUrl}`;

                // Store the result for sharing/downloading
                this.customPreviewResult = data;
            } else {
                throw new Error(data.message || 'Preview failed');
            }
        } catch (error) {
            console.error('Preview error:', error);
            alert('Error previewing filter: ' + error.message);
        }
    }

    getCustomFilterParams() {
        const params = {};
        
        const brightness = parseFloat(document.getElementById('brightnessSlider').value);
        if (brightness !== 1.0) params.brightness = brightness;

        const saturation = parseFloat(document.getElementById('saturationSlider').value);
        if (saturation !== 1.0) params.saturation = saturation;

        const hue = parseFloat(document.getElementById('hueSlider').value);
        if (hue !== 0) params.hue = hue;

        const blur = parseFloat(document.getElementById('blurSlider').value);
        if (blur > 0) params.blur = blur;

        const contrast = parseFloat(document.getElementById('contrastSlider').value);
        if (contrast !== 1.0) params.contrast = contrast;

        if (document.getElementById('grayscaleCheck').checked) {
            params.grayscale = true;
        }

        if (document.getElementById('invertCheck').checked) {
            params.invert = true;
        }

        return params;
    }

    async saveCustomFilter() {
        const name = document.getElementById('customFilterName').value.trim();
        if (!name) {
            alert('Please enter a filter name');
            return;
        }

        const params = this.getCustomFilterParams();
        if (Object.keys(params).length === 0) {
            alert('Please adjust at least one filter parameter');
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/filters/custom`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    params: params
                })
            });

            const data = await response.json();

            if (data.success) {
                alert(`Custom filter "${name}" saved successfully!`);
                this.hideCustomFilterCreator();
            } else {
                throw new Error(data.message || 'Failed to save filter');
            }
        } catch (error) {
            console.error('Save filter error:', error);
            alert('Error saving filter: ' + error.message);
        }
    }

    // Image Sharing Feature
    async shareImage() {
        if (!this.currentImageId || !this.selectedResult) {
            alert('Please select a filter result first');
            return;
        }

        try {
            const filterName = this.selectedResult.filterKey || this.selectedResult.filterName.toLowerCase().replace(/\s+/g, '-');
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageId: this.currentImageId,
                    filterName: filterName,
                    expiresInHours: 24
                })
            });

            const data = await response.json();

            if (data.success) {
                // Copy to clipboard
                await navigator.clipboard.writeText(data.shareUrl);
                alert(`Shareable link copied to clipboard!\n\n${data.shareUrl}\n\nLink expires in 24 hours.`);
            } else {
                throw new Error(data.message || 'Failed to create share link');
            }
        } catch (error) {
            console.error('Share error:', error);
            alert('Error creating share link: ' + error.message);
        }
    }

    // Background Processing with SQS
    async queueBackgroundProcessing(filterNames = null) {
        if (!this.currentImageId) {
            alert('Please upload an image first');
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/process/queue`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageId: this.currentImageId,
                    filterNames: filterNames || null,
                    useSQS: true
                })
            });

            const data = await response.json();

            if (data.success) {
                if (data.queued) {
                    // Show queue status
                    document.getElementById('queueStatus').style.display = 'block';
                    document.getElementById('queueMessage').textContent = `Job ${data.jobId} queued successfully`;
                    document.getElementById('queueInfo').textContent = 'Processing in background. Check back later for results.';
                } else {
                    // Processed synchronously
                    this.results = data.results || [];
                    await this.showResults();
                }
            } else {
                throw new Error(data.message || 'Failed to queue job');
            }
        } catch (error) {
            console.error('Queue error:', error);
            alert('Error queueing job: ' + error.message);
        }
    }

    // API utility methods
    async getAvailableFilters() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/filters`);
            const data = await response.json();
            return data.filters;
        } catch (error) {
            console.error('Error fetching filters:', error);
            return {};
        }
    }

    async getImageAsBase64(imageUrl) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}${imageUrl}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1]; // Remove data:image/png;base64, prefix
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Error loading image:', error);
            return ''; // Return empty string if image fails to load
        }
    }

    async getImageInfo(imageId) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBaseUrl}/api/image/${imageId}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching image info:', error);
            return null;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const api = new PhotoFilterAPI();
    
    // Ensure batch file input has multiple attribute set
    const batchInput = document.getElementById('batchFileInput');
    if (batchInput) {
        batchInput.setAttribute('multiple', 'multiple');
        console.log('Batch upload input configured for multiple file selection');
    }
});
