#!/bin/bash

# LinkedIn Hiring Scraper - Timed Run
# Tracks start/end time to measure performance for 100 leads

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  LinkedIn Hiring Scraper - Performance Test${NC}"
echo -e "${BLUE}  Target: 200 leads from India${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Pre-flight checks
echo -e "${YELLOW}Pre-flight checks...${NC}"

# Check MongoDB Atlas connection (load from .env)
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(grep -v '^#' "$PROJECT_DIR/.env" | grep MONGO_URL | xargs)
fi

if [ -z "$MONGO_URL" ]; then
    echo -e "${RED}❌ MONGO_URL not set in .env file!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ MongoDB connection string loaded (Atlas)${NC}"

# Check Chrome
if [ ! -d "$HOME/Library/Application Support/Google/Chrome" ]; then
    echo -e "${RED}❌ Chrome user data not found!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Chrome profile found${NC}"

# Test Ollama
if ! curl -s --max-time 3 https://ollama2.havenify.ai/api/tags > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Ollama API may be unreachable${NC}"
else
    echo -e "${GREEN}✓ Ollama API accessible${NC}"
fi

echo ""
echo -e "${CYAN}Configuration:${NC}"
echo "  Max Posts: 200"
echo "  Search: hiring"
echo "  Location: India"
echo "  Time Filter: Past week"
echo "  Chrome Profile: .playwright-chrome-profile"
echo "  Estimated Duration: 90-100 minutes"
echo ""
echo -e "${YELLOW}📌 IMPORTANT:${NC}"
echo -e "${YELLOW}   If this is your first run, you'll need to log into LinkedIn${NC}"
echo -e "${YELLOW}   when Chrome opens. The timer will start after you confirm.${NC}"
echo ""

read -p "Ready to start? [Y/n]: " CONFIRM
CONFIRM=${CONFIRM:-Y}

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Set environment variables
export MAX_POSTS=200
export LOCATION="India"
export TENANT_ID="perf-test-india-$(date +%Y%m%d-%H%M%S)"

# Record start time
START_TIME=$(date +%s)
START_TIME_FORMATTED=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚀 SCRAPING STARTED${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Start Time: $START_TIME_FORMATTED${NC}"
echo -e "${CYAN}Tenant ID: $TENANT_ID${NC}"
echo ""
echo -e "${YELLOW}Watch for Chrome window to open...${NC}"
echo -e "${YELLOW}This will take approximately 45-50 minutes.${NC}"
echo ""

# Create log file
LOG_FILE="$PROJECT_DIR/logs/scraper-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$PROJECT_DIR/logs"

# Run the scraper and log output
cd "$PROJECT_DIR"
node scripts/linkedin-hiring-runner.js 2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

# Record end time
END_TIME=$(date +%s)
END_TIME_FORMATTED=$(date '+%Y-%m-%d %H:%M:%S')
DURATION=$((END_TIME - START_TIME))

# Calculate duration in human-readable format
HOURS=$((DURATION / 3600))
MINUTES=$(((DURATION % 3600) / 60))
SECONDS=$((DURATION % 60))

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 PERFORMANCE REPORT${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Timing:${NC}"
echo "  Start Time:  $START_TIME_FORMATTED"
echo "  End Time:    $END_TIME_FORMATTED"
echo ""
echo -e "${CYAN}Duration:${NC}"
if [ $HOURS -gt 0 ]; then
    echo "  Total: ${HOURS}h ${MINUTES}m ${SECONDS}s"
else
    echo "  Total: ${MINUTES}m ${SECONDS}s"
fi
echo "  Seconds: $DURATION"
echo ""

# Get results from MongoDB (already loaded from .env)
if [ -z "$MONGO_URL" ]; then
    MONGO_URL="mongodb://localhost:27017/crawlee"
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${CYAN}Results:${NC}"
    
    # Get lead count
    LEAD_COUNT=$(mongosh "$MONGO_URL" --quiet --eval "db.linkedinleads.countDocuments({tenantId: '$TENANT_ID'})" 2>/dev/null || echo "?")
    
    # Get campaign stats
    CAMPAIGN_STATS=$(mongosh "$MONGO_URL" --quiet --eval "
        var campaign = db.campaigns.findOne({tenantId: '$TENANT_ID'});
        if (campaign) {
            print('Posts:' + campaign.stats.postsProcessed);
            print('Leads:' + campaign.stats.leadsExtracted);
            print('Errors:' + campaign.stats.errors);
        }
    " 2>/dev/null)
    
    echo "  Leads Extracted: $LEAD_COUNT"
    echo ""
    
    if [ "$LEAD_COUNT" != "?" ] && [ "$LEAD_COUNT" -gt 0 ]; then
        # Calculate performance metrics
        TIME_PER_LEAD=$((DURATION / LEAD_COUNT))
        LEADS_PER_MINUTE=$(echo "scale=2; $LEAD_COUNT * 60 / $DURATION" | bc)
        
        echo -e "${CYAN}Performance Metrics:${NC}"
        echo "  Time per Lead: ${TIME_PER_LEAD}s"
        echo "  Leads per Minute: $LEADS_PER_MINUTE"
        echo ""
        
        # Show sample leads
        echo -e "${CYAN}Sample Leads (first 3):${NC}"
        mongosh "$MONGO_URL" --quiet --eval "
            db.linkedinleads.find({tenantId: '$TENANT_ID'})
                .limit(3)
                .forEach(function(lead) {
                    print('  • ' + lead.authorName + ' - ' + lead.company);
                    print('    Jobs: ' + (lead.jobTitles || []).join(', '));
                    print('    Locations: ' + (lead.locations || []).join(', '));
                    print('');
                });
        " 2>/dev/null
        
        echo -e "${GREEN}✅ Test PASSED - Successfully collected $LEAD_COUNT leads${NC}"
    else
        echo -e "${YELLOW}⚠️  Test completed but fewer leads extracted than expected${NC}"
    fi
else
    echo -e "${RED}❌ Scraping failed or was interrupted${NC}"
    echo "  Exit Code: $EXIT_CODE"
fi

echo ""
echo -e "${CYAN}Log File:${NC}"
echo "  $LOG_FILE"
echo ""

# Save timing data to file
TIMING_FILE="$PROJECT_DIR/logs/timing-report-$(date +%Y%m%d-%H%M%S).txt"
cat > "$TIMING_FILE" << EOF
LinkedIn Hiring Scraper - Performance Report
===========================================

Test Run: $(date '+%Y-%m-%d %H:%M:%S')
Tenant ID: $TENANT_ID

Timing
------
Start Time:  $START_TIME_FORMATTED
End Time:    $END_TIME_FORMATTED
Duration:    ${MINUTES}m ${SECONDS}s ($DURATION seconds)

Configuration
-------------
Max Posts: 100
Search Query: hiring
Time Filter: past-week

Results
-------
Leads Extracted: $LEAD_COUNT
Exit Code: $EXIT_CODE

Performance Metrics
------------------
EOF

if [ "$LEAD_COUNT" != "?" ] && [ "$LEAD_COUNT" -gt 0 ]; then
    cat >> "$TIMING_FILE" << EOF
Time per Lead: ${TIME_PER_LEAD}s
Leads per Minute: $LEADS_PER_MINUTE

Campaign Stats
--------------
$CAMPAIGN_STATS
EOF
fi

echo -e "${CYAN}Timing Report:${NC}"
echo "  $TIMING_FILE"
echo ""

# Show next steps
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "View detailed results:"
echo "  mongosh $MONGO_URL"
echo "  > db.linkedinleads.find({tenantId: '$TENANT_ID'})"
echo ""
echo "Export to CSV:"
echo "  mongoexport --db=crawlee --collection=linkedinleads \\"
echo "    --query='{\"tenantId\": \"$TENANT_ID\"}' \\"
echo "    --out=leads-$TENANT_ID.csv --type=csv \\"
echo "    --fields=authorName,company,jobTitles,locations,seniority,skills,salaryRange,workMode,applicationLink"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
