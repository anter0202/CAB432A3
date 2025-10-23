#!/bin/bash

# PhotoFilter Pro API Health Check Script
# Usage: ./health-check.sh [base-url]

BASE_URL=${1:-"http://localhost:3000"}
echo "🔍 PhotoFilter Pro API Health Check"
echo "====================================="
echo "Base URL: $BASE_URL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local method=${2:-GET}
    local name=$3
    local data=$4
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅${NC} $name: $http_code"
    else
        echo -e "${RED}❌${NC} $name: $http_code"
    fi
}

echo "📋 Testing Public Endpoints..."
test_endpoint "/api/health" "GET" "Health Check"
test_endpoint "/api/filters" "GET" "Get Filters"
test_endpoint "/api/login" "POST" "Login" '{"username":"anter","password":"kingkong"}'
test_endpoint "/api/register" "POST" "Register" '{"username":"testuser","password":"testpass","email":"test@example.com"}'

echo ""
echo "🔐 Testing Authentication..."
login_response=$(curl -s -X POST -H "Content-Type: application/json" -d '{"username":"anter","password":"kingkong"}' "$BASE_URL/api/login")
token=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$token" ]; then
    echo -e "${GREEN}✅${NC} Login successful - Token obtained"
    
    echo ""
    echo "🔒 Testing Protected Endpoints..."
    test_endpoint "/api/profile" "GET" "Get Profile" "" "Authorization: Bearer $token"
    test_endpoint "/api/image/test-image-id" "GET" "Get Image Info (will fail - no image)" "" "Authorization: Bearer $token"
else
    echo -e "${RED}❌${NC} Login failed - Cannot test protected endpoints"
fi

echo ""
echo "🎯 Quick Test Complete!"
echo "For detailed testing, run: node health-check.js $BASE_URL"
