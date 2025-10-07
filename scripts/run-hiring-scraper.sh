#!/bin/bash

# LinkedIn Hiring Scraper - Easy Launcher
# Usage: ./scripts/run-hiring-scraper.sh [preset]
# Presets: quick, standard, deep, custom

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  LinkedIn Hiring Posts Scraper${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js found ($(node --version))${NC}"
    
    # Check MongoDB
    if ! (docker ps | grep -q mongodb || brew services list | grep -q "mongodb-community.*started"); then
        echo -e "${RED}❌ MongoDB is not running!${NC}"
        echo "   Start with: docker-compose up -d mongodb"
        echo "   Or: brew services start mongodb-community"
        exit 1
    fi
    echo -e "${GREEN}✓ MongoDB is running${NC}"
    
    # Check Chrome profile
    if [ ! -d "$HOME/Library/Application Support/Google/Chrome" ]; then
        echo -e "${RED}❌ Chrome user data not found!${NC}"
        echo "   Make sure Chrome is installed"
        exit 1
    fi
    echo -e "${GREEN}✓ Chrome profile found${NC}"
    
    # Test Ollama (warning only)
    if ! curl -s --max-time 3 https://ollama2.havenify.ai/api/tags > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Ollama API unreachable (will retry during execution)${NC}"
    else
        echo -e "${GREEN}✓ Ollama API accessible${NC}"
    fi
    
    echo ""
}

# Show preset options
show_presets() {
    echo -e "${BLUE}Available Presets:${NC}"
    echo ""
    echo -e "  ${GREEN}quick${NC}     - Fast test (10 posts, ~5 minutes)"
    echo -e "  ${GREEN}standard${NC}  - Default collection (50 posts, ~25 minutes)"
    echo -e "  ${GREEN}deep${NC}      - Comprehensive scan (200 posts, ~100 minutes)"
    echo -e "  ${GREEN}custom${NC}    - Enter your own parameters"
    echo ""
}

# Get user choice
get_preset() {
    if [ -n "$1" ]; then
        PRESET="$1"
    else
        show_presets
        read -p "Choose preset [standard]: " PRESET
        PRESET=${PRESET:-standard}
    fi
    
    case "$PRESET" in
        quick)
            export MAX_POSTS=10
            export SEARCH_QUERY="hiring (software OR engineer OR developer)"
            DESCRIPTION="Quick test with 10 posts"
            ;;
        standard)
            export MAX_POSTS=50
            export SEARCH_QUERY="hiring OR \"we're hiring\" OR recruiting (software OR engineer OR developer)"
            DESCRIPTION="Standard collection with 50 posts"
            ;;
        deep)
            export MAX_POSTS=200
            export SEARCH_QUERY="hiring OR recruiting OR \"join our team\" OR \"looking for\" (software OR engineer OR developer OR frontend OR backend OR fullstack)"
            DESCRIPTION="Deep scan with 200 posts"
            ;;
        custom)
            echo ""
            echo -e "${YELLOW}Custom Configuration:${NC}"
            read -p "Number of posts [50]: " MAX_POSTS
            export MAX_POSTS=${MAX_POSTS:-50}
            
            echo ""
            echo "Search query examples:"
            echo "  - hiring software engineer"
            echo "  - hiring remote developer"
            echo "  - recruiting backend python"
            read -p "Search query: " SEARCH_QUERY
            export SEARCH_QUERY=${SEARCH_QUERY:-"hiring software engineer"}
            
            DESCRIPTION="Custom: $MAX_POSTS posts with query '$SEARCH_QUERY'"
            ;;
        *)
            echo -e "${RED}Invalid preset: $PRESET${NC}"
            echo "Use: quick, standard, deep, or custom"
            exit 1
            ;;
    esac
}

# Confirm and run
run_scraper() {
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Preset:       $PRESET"
    echo "  Description:  $DESCRIPTION"
    echo "  Max Posts:    $MAX_POSTS"
    echo "  Search Query: $SEARCH_QUERY"
    echo ""
    
    # Calculate estimated time
    ESTIMATED_MIN=$((MAX_POSTS / 2))
    echo -e "${YELLOW}Estimated time: ~${ESTIMATED_MIN} minutes${NC}"
    echo ""
    
    read -p "Start scraping? [Y/n]: " CONFIRM
    CONFIRM=${CONFIRM:-Y}
    
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    
    echo ""
    echo -e "${GREEN}🚀 Starting scraper...${NC}"
    echo -e "${YELLOW}Watch for Chrome window to open${NC}"
    echo ""
    
    # Set tenant ID with timestamp
    export TENANT_ID="hiring-$(date +%Y%m%d-%H%M%S)"
    
    cd "$PROJECT_DIR"
    node scripts/linkedin-hiring-runner.js
    
    EXIT_CODE=$?
    
    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Scraping completed successfully!${NC}"
        echo ""
        echo -e "${BLUE}View results:${NC}"
        echo "  1. MongoDB shell:"
        echo "     mongosh mongodb://localhost:27017/crawlee"
        echo "     > db.linkedinleads.find({tenantId: '$TENANT_ID'})"
        echo ""
        echo "  2. Frontend UI:"
        echo "     cd insight-scrape-flow && npm run dev"
        echo "     Navigate to: http://localhost:8080/linkedin"
        echo ""
        echo "  3. Export to JSON:"
        echo "     mongoexport --db=crawlee --collection=linkedinleads \\"
        echo "       --query='{\"tenantId\": \"$TENANT_ID\"}' \\"
        echo "       --out=leads.json --pretty"
    else
        echo -e "${RED}❌ Scraping failed or was interrupted${NC}"
        echo "Check the output above for errors"
    fi
}

# Main execution
check_prerequisites
get_preset "$1"
run_scraper
