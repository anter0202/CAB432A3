// PhotoFilter Pro API Client JavaScript
class PhotoFilterAPI {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3000'; // Remove /api from here
        this.currentImageId = null;
        this.selectedResult = null;
        this.results = [];
        this.authToken = localStorage.getItem('authToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAPIHealth();
        this.checkAuthStatus();
    }

    // Helper method to get auth headers
    async refreshAuthToken() {
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

        // If unauthorized, try to refresh token
        if (response.status === 401 && this.refreshToken) {
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
        
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        uploadArea.addEventListener('click', () => {
            fileInput.click();
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
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleFileUpload(file);
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

        document.getElementById('newPhotoBtn').addEventListener('click', () => {
            this.newPhoto();
        });
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

                    // Update UI
                    document.getElementById('welcomeUser').textContent = `Welcome, ${this.currentUser.username}!`;
                    document.getElementById('loginScreen').classList.remove('active');
                    document.getElementById('appScreen').classList.add('active');
                    
                    console.log('Login successful:', this.currentUser);
                } else {
                    alert(data.message || 'Login failed');
                }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
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
        this.showPhotoEditor();
        this.updateProgress('Step 1: Uploading image to server...');

        try {
            // Upload image to API
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch(`${this.apiBaseUrl}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                console.log('Image uploaded successfully:', data);
                this.currentImageId = data.imageId;
                this.updateProgress('Step 2: Processing filters on server...');
                await this.processAllFilters();
            } else {
                throw new Error(data.message || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            alert('Error uploading image: ' + error.message);
            this.hidePhotoEditor();
        }
    }

    async processAllFilters() {
        try {
            this.updateProgress('Step 3: Applying all filters...');

            const response = await fetch(`${this.apiBaseUrl}/api/apply-all-filters`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
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
    }

    hidePhotoEditor() {
        document.getElementById('photoEditor').style.display = 'none';
        document.querySelector('.upload-section').style.display = 'grid';
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
        
        const resultsGrid = document.getElementById('resultsGrid');
        resultsGrid.innerHTML = '';
        
        // Process results sequentially to avoid overwhelming the server
        for (let i = 0; i < this.results.length; i++) {
            const result = this.results[i];
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            resultItem.dataset.index = i;
            
            try {
                const base64Image = await this.getImageAsBase64(result.processedImageUrl);
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
                            <i class="fas fa-image"></i>
                            <span>Loading...</span>
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
            
            resultsGrid.appendChild(resultItem);
        }
        
        // Enable download button
        document.getElementById('downloadBtn').disabled = false;
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
        
        // Enable download button
        document.getElementById('downloadBtn').disabled = false;
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
        this.hidePhotoEditor();
        document.getElementById('fileInput').value = '';
        this.currentImageId = null;
        this.selectedResult = null;
        this.results = [];
        
        // Reset download button
        document.getElementById('downloadBtn').disabled = true;
        
        // Stop camera if running
        const video = document.getElementById('video');
        if (!video.hidden && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.hidden = true;
            document.getElementById('cameraBtn').innerHTML = '<i class="fas fa-camera"></i> Take Photo';
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
    new PhotoFilterAPI();
});
