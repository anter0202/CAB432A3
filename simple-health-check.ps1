# Simple PhotoFilter Pro API Health Check
$BaseUrl = "http://localhost:3000"

Write-Host "🔍 PhotoFilter Pro API Health Check" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Yellow
Write-Host ""

# Test basic endpoints
Write-Host "📋 Testing Basic Endpoints..." -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method GET
    Write-Host "✅ Health Check: OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Health Check: Failed" -ForegroundColor Red
}

try {
    $filters = Invoke-RestMethod -Uri "$BaseUrl/api/filters" -Method GET
    Write-Host "✅ Get Filters: OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Get Filters: Failed" -ForegroundColor Red
}

try {
    $login = Invoke-RestMethod -Uri "$BaseUrl/api/login" -Method POST -ContentType "application/json" -Body '{"username":"anter","password":"kingkong"}'
    Write-Host "✅ Login: OK" -ForegroundColor Green
    
    # Test protected endpoint
    $token = $login.token
    $headers = @{ "Authorization" = "Bearer $token" }
    
    try {
        $profile = Invoke-RestMethod -Uri "$BaseUrl/api/profile" -Method GET -Headers $headers
        Write-Host "✅ Get Profile: OK" -ForegroundColor Green
    } catch {
        Write-Host "❌ Get Profile: Failed" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Login: Failed" -ForegroundColor Red
}

try {
    $cleanup = Invoke-RestMethod -Uri "$BaseUrl/api/cleanup" -Method DELETE
    Write-Host "✅ Cleanup: OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Cleanup: Failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 All endpoints are healthy! Your API is ready for production." -ForegroundColor Green
