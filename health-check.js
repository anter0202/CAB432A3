#!/usr/bin/env node

// PhotoFilter Pro API Health Check Script
const https = require('https');
const http = require('http');

class HealthChecker {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.results = [];
    }

    async makeRequest(endpoint, method = 'GET', headers = {}, body = null, expectedStatus = null) {
        return new Promise((resolve) => {
            const url = new URL(endpoint, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let success = res.statusCode >= 200 && res.statusCode < 300;
                    
                    // Check if status code is in expected range
                    if (expectedStatus && Array.isArray(expectedStatus)) {
                        success = expectedStatus.includes(res.statusCode);
                    }
                    
                    resolve({
                        endpoint,
                        method,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers,
                        body: data,
                        success: success,
                        expectedStatus: expectedStatus
                    });
                });
            });

            req.on('error', (error) => {
                resolve({
                    endpoint,
                    method,
                    status: 0,
                    statusText: 'Connection Error',
                    error: error.message,
                    success: false
                });
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    async checkAllEndpoints() {
        console.log('🔍 PhotoFilter Pro API Health Check');
        console.log('=====================================\n');

        // Test endpoints that don't require authentication
        const publicEndpoints = [
            { endpoint: '/api/health', method: 'GET', name: 'Health Check' },
            { endpoint: '/api/filters', method: 'GET', name: 'Get Filters' },
            { endpoint: '/api/login', method: 'POST', name: 'Login', body: { username: 'anter', password: 'kingkong' } },
            { endpoint: '/api/register', method: 'POST', name: 'Register', body: { username: 'testuser', password: 'testpass', email: 'test@example.com' }, expectedStatus: [201, 409] },
            { endpoint: '/api/cleanup', method: 'DELETE', name: 'Cleanup Old Files' }
        ];

        console.log('📋 Testing Public Endpoints...');
        for (const endpoint of publicEndpoints) {
            const result = await this.makeRequest(endpoint.endpoint, endpoint.method, {}, endpoint.body, endpoint.expectedStatus);
            this.results.push({ ...result, name: endpoint.name });
            this.printResult(result, endpoint.name);
        }

        // Test login to get token
        console.log('\n🔐 Testing Authentication...');
        const loginResult = await this.makeRequest('/api/login', 'POST', {}, { username: 'anter', password: 'kingkong' });
        
        let token = null;
        if (loginResult.success) {
            try {
                const loginData = JSON.parse(loginResult.body);
                token = loginData.token;
                console.log('✅ Login successful - Token obtained');
            } catch (error) {
                console.log('❌ Login failed - Could not parse token');
            }
        } else {
            console.log('❌ Login failed - Cannot test protected endpoints');
        }

        // Test protected endpoints if we have a token
        if (token) {
            const authHeaders = { 'Authorization': `Bearer ${token}` };
            
            const protectedEndpoints = [
                { endpoint: '/api/profile', method: 'GET', name: 'Get Profile' },
                { endpoint: '/api/image/test-image-id', method: 'GET', name: 'Get Image Info (test - should fail)', expectedStatus: [404] }
            ];

            // Test refresh token endpoint
            console.log('\n🔄 Testing Token Refresh...');
            const refreshResult = await this.makeRequest('/api/refresh', 'POST', {}, { refreshToken: 'invalid-token' }, [403]);
            this.results.push({ ...refreshResult, name: 'Refresh Token (invalid)' });
            this.printResult(refreshResult, 'Refresh Token (invalid)');

            console.log('\n🔒 Testing Protected Endpoints...');
            for (const endpoint of protectedEndpoints) {
                const result = await this.makeRequest(endpoint.endpoint, endpoint.method, authHeaders, null, endpoint.expectedStatus);
                this.results.push({ ...result, name: endpoint.name });
                this.printResult(result, endpoint.name);
            }
        }

        // Summary
        this.printSummary();
    }

    printResult(result, name) {
        const status = result.success ? '✅' : '❌';
        const statusCode = result.status || 'ERROR';
        const statusText = result.statusText || '';
        
        let message = `${status} ${name}: ${statusCode} ${statusText}`;
        
        if (result.expectedStatus && result.expectedStatus.includes(result.status)) {
            message += ' (expected)';
        }
        
        console.log(message);
        
        if (!result.success && result.error) {
            console.log(`   Error: ${result.error}`);
        }
    }

    printSummary() {
        console.log('\n📊 Health Check Summary');
        console.log('=======================');
        
        const total = this.results.length;
        const successful = this.results.filter(r => r.success).length;
        const failed = total - successful;
        
        console.log(`Total Endpoints: ${total}`);
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📈 Success Rate: ${((successful / total) * 100).toFixed(1)}%`);
        
        if (failed > 0) {
            console.log('\n❌ Failed Endpoints:');
            this.results.filter(r => !r.success).forEach(result => {
                console.log(`   - ${result.name}: ${result.status} ${result.statusText || result.error}`);
            });
        }
        
        console.log('\n🎯 Recommendations:');
        if (successful === total) {
            console.log('   🎉 All endpoints are healthy! Your API is ready for production.');
        } else if (successful > failed) {
            console.log('   ⚠️  Most endpoints are working. Check failed endpoints above.');
        } else {
            console.log('   🚨 Multiple endpoints are failing. Check your server configuration.');
        }
    }
}

// Run health check
if (require.main === module) {
    const baseUrl = process.argv[2] || 'http://localhost:3000';
    const checker = new HealthChecker(baseUrl);
    checker.checkAllEndpoints().catch(console.error);
}

module.exports = HealthChecker;
