#!/bin/bash

# Test LinkedIn Hiring Runner
# This script tests the local runner with a small number of posts

echo "🧪 Testing LinkedIn Hiring Posts Scraper"
echo "========================================"
echo ""

# Check if MongoDB is running
echo "📊 Checking MongoDB..."
if ! docker ps | grep -q mongodb; then
  if ! brew services list | grep -q "mongodb-community.*started"; then
    echo "❌ MongoDB is not running!"
    echo "   Start it with: docker-compose up -d mongodb"
    echo "   Or: brew services start mongodb-community"
    exit 1
  fi
fi
echo "✅ MongoDB is running"
echo ""

# Check if Chrome is available
echo "🌐 Checking Chrome..."
if [ ! -d "$HOME/Library/Application Support/Google/Chrome" ]; then
  echo "❌ Chrome user data not found!"
  echo "   Make sure Chrome is installed and you've logged into LinkedIn"
  exit 1
fi
echo "✅ Chrome profile found"
echo ""

# Test Ollama connection
echo "🤖 Testing Ollama API..."
if curl -s --max-time 5 https://ollama2.havenify.ai/api/tags > /dev/null 2>&1; then
  echo "✅ Ollama API is accessible"
else
  echo "⚠️  Ollama API unreachable (will retry during execution)"
fi
echo ""

# Set test configuration
export MAX_POSTS=5
export TENANT_ID="test-hiring-$(date +%s)"

echo "🚀 Starting test run with 5 posts..."
echo "   Tenant ID: $TENANT_ID"
echo "   Watch for Chrome window to open..."
echo ""

# Run the script
cd "$(dirname "$0")/.."
node scripts/linkedin-hiring-runner.js

# Check results
echo ""
echo "📋 Test Results"
echo "==============="

# Count leads in database
MONGO_URL="${MONGO_URL:-mongodb://localhost:27017/crawlee}"
LEAD_COUNT=$(mongosh "$MONGO_URL" --quiet --eval "db.linkedinleads.countDocuments({tenantId: '$TENANT_ID'})" 2>/dev/null || echo "?")

echo "Leads extracted: $LEAD_COUNT"

if [ "$LEAD_COUNT" != "?" ] && [ "$LEAD_COUNT" -gt 0 ]; then
  echo "✅ Test PASSED - Leads were saved to database"
  
  # Show sample lead
  echo ""
  echo "Sample lead:"
  mongosh "$MONGO_URL" --quiet --eval "db.linkedinleads.findOne({tenantId: '$TENANT_ID'}, {authorName: 1, company: 1, jobTitles: 1, _id: 0})" 2>/dev/null
else
  echo "⚠️  Test completed but no leads were extracted"
  echo "   This might be normal if no hiring posts were found"
fi

echo ""
echo "🎉 Test completed!"
echo ""
echo "To view results:"
echo "  mongosh $MONGO_URL"
echo "  > db.linkedinleads.find({tenantId: '$TENANT_ID'})"
