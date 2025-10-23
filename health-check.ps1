# PhotoFilter Pro API Health Check Script (PowerShell)
# Usage: .\health-check.ps1 [base-url]

param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "🔍 PhotoFilter Pro API Health Check" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Yellow
Write-Host ""

# Function to test endpoint
function Test-Endpoint {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [string]$Name,
        [string]$Data = $null,
        [hashtable]$Headers = @{}
    )
    
    try {
        $uri = "$BaseUrl$Endpoint"
        $params = @{
            Uri = $uri
            Method = $Method
            Headers = $Headers
        }
        
        if ($Data) {
            $params.Body = $Data
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-WebRequest @params -UseBasicParsing
        
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
            Write-Host "✅ $Name`: $($response.StatusCode)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ $Name`: $($response.StatusCode)" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "❌ $Name`: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host "📋 Testing Public Endpoints..." -ForegroundColor Yellow
$results = @()

$results += Test-Endpoint -Endpoint "/api/health" -Method "GET" -Name "Health Check"
$results += Test-Endpoint -Endpoint "/api/filters" -Method "GET" -Name "Get Filters"
$results += Test-Endpoint -Endpoint "/api/login" -Method "POST" -Name "Login" -Data '{"username":"anter","password":"kingkong"}'
$results += Test-Endpoint -Endpoint "/api/register" -Method "POST" -Name "Register" -Data '{"username":"testuser","password":"testpass","email":"test@example.com"}'

Write-Host ""
Write-Host "🔐 Testing Authentication..." -ForegroundColor Yellow

try {
    $loginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/login" -Method POST -ContentType "application/json" -Body '{"username":"anter","password":"kingkong"}'
    $token = $loginResponse.token
    
    if ($token) {
        Write-Host "✅ Login successful - Token obtained" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "🔒 Testing Protected Endpoints..." -ForegroundColor Yellow
        $authHeaders = @{ "Authorization" = "Bearer $token" }
        
        $results += Test-Endpoint -Endpoint "/api/profile" -Method "GET" -Name "Get Profile" -Headers $authHeaders
        $results += Test-Endpoint -Endpoint "/api/image/test-image-id" -Method "GET" -Name "Get Image Info (will fail - no image)" -Headers $authHeaders
    } else {
        Write-Host "❌ Login failed - Cannot test protected endpoints" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Login failed - Cannot test protected endpoints" -ForegroundColor Red
}

Write-Host ""
Write-Host "📊 Health Check Summary" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan

$total = $results.Count
$successful = ($results | Where-Object { $_ -eq $true }).Count
$failed = $total - $successful
$successRate = [math]::Round(($successful / $total) * 100, 1)

Write-Host "Total Endpoints: $total"
Write-Host "✅ Successful: $successful" -ForegroundColor Green
Write-Host "❌ Failed: $failed" -ForegroundColor Red
Write-Host "📈 Success Rate: $successRate%"

Write-Host ""
Write-Host "🎯 Recommendations:" -ForegroundColor Yellow
if ($successful -eq $total) {
    Write-Host "   🎉 All endpoints are healthy! Your API is ready for production." -ForegroundColor Green
} elseif ($successful -gt $failed) {
    Write-Host "   ⚠️  Most endpoints are working. Check failed endpoints above." -ForegroundColor Yellow
} else {
    Write-Host "   🚨 Multiple endpoints are failing. Check your server configuration." -ForegroundColor Red
}

Write-Host ""
Write-Host "💡 Additional Testing:" -ForegroundColor Cyan
Write-Host "   - Test with actual image upload: Upload a photo and check all filters"
Write-Host "   - Test download functionality: Try downloading a processed image"
Write-Host "   - Test error handling: Try invalid credentials or malformed requests"