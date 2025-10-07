# LinkedIn Scraper - Quick Start Guide

## 🚀 Quick Start (3 Steps)

### 1. Start Backend
```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
npm run dev
```
Backend runs on: http://localhost:3011

### 2. Start Frontend
```bash
cd /Users/mohanpraneeth/Desktop/Coding/insight-scrape-flow
npm run dev
```
Frontend runs on: http://localhost:8081

### 3. Create & Run Campaign

**Option A: Via UI**
1. Open http://localhost:8081
2. Go to LinkedIn Campaigns
3. Click "Create Campaign"
4. Fill form and submit
5. Copy Campaign ID
6. Run: `node scripts/linkedin-hiring-runner.js --campaignId=<ID>`

**Option B: Via API**
```bash
# Create campaign
curl -X POST http://localhost:3011/api/linkedin/campaigns \
  -H "Content-Type: application/json" \
  -H "x-api-key: 56980aeae1a9622aab1736cc0a972edf9c7a432bd7774b32df1ebd70b341fc67" \
  -d '{
    "name": "Test Campaign",
    "mode": "search",
    "roles": "hiring, recruiting",
    "period": "past week",
    "limit": 20
  }' | jq -r '.campaign._id'

# Copy the ID and run:
node scripts/linkedin-hiring-runner.js --campaignId=<ID>
```

---

## 📋 Two Modes

### Search Mode
Search LinkedIn by keywords, time period, and location.

**Example**:
```json
{
  "name": "AI Engineers in India",
  "mode": "search",
  "roles": "AI engineer, machine learning, hiring",
  "period": "past week",
  "location": "India",
  "limit": 50
}
```

### Seed URL Mode
Scrape from specific profiles or posts.

**Example**:
```json
{
  "name": "Tech CEO Posts",
  "mode": "seedUrls",
  "seedUrls": [
    "https://www.linkedin.com/in/sundarpichai/recent-activity/all/",
    "https://www.linkedin.com/feed/update/urn:li:activity:7379929021188476928/"
  ],
  "summary": "Monitoring tech leaders",
  "limit": 30
}
```

---

## 🔑 Environment Variables

```bash
# crawlee/.env
MONGO_URL=mongodb+srv://...
OLLAMA_URL=https://ollama2.havenify.ai
TENANT_ID=68de6146e586465c343a5ed9
```

---

## 🎯 Common Commands

### Check Campaign Status
```bash
curl -s -H "x-api-key: YOUR_KEY" \
  http://localhost:3011/api/linkedin/campaigns/CAMPAIGN_ID | jq
```

### List All Campaigns
```bash
curl -s -H "x-api-key: YOUR_KEY" \
  http://localhost:3011/api/linkedin/campaigns | jq
```

### Count Leads
```bash
curl -s -H "x-api-key: YOUR_KEY" \
  http://localhost:3011/api/linkedin/campaigns/CAMPAIGN_ID | \
  jq '.campaign.stats.leadsExtracted'
```

### View Leads in UI
Open: http://localhost:8081/linkedin-campaigns/CAMPAIGN_ID

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check MongoDB connection
mongo mongodb+srv://... --eval "db.adminCommand('ping')"

# Check port
lsof -ti:3011
```

### Frontend won't start
```bash
# Check port
lsof -ti:8081

# Clear cache
rm -rf node_modules .next
npm install
```

### Runner issues
```bash
# Reset Chrome profile
rm -rf .playwright-chrome-profile

# Test MongoDB connection
node -e "require('mongoose').connect('YOUR_MONGO_URL').then(() => console.log('✅ Connected'))"

# Test Ollama
curl https://ollama2.havenify.ai/api/tags
```

---

## 📊 Expected Output

### Runner Console
```
🚀 Starting LinkedIn Hiring Posts Scraper
📂 Loading campaign: 68e0146074fa090cd2633ecf
✓ Loaded campaign: AI Engineers Q4 2025
   Mode: Search
🌐 Launching Chrome...
✓ Browser ready

🔍 SEARCH MODE: Searching for "AI engineer, hiring"
📄 Found 15 posts on page

📝 Processing post 1/20
   Author: John Doe
   Text preview: We're hiring AI engineers...
   🤖 Extracting lead details with AI...
   ✅ Lead saved! (1 total)
      Jobs: AI Engineer, ML Engineer
      Locations: Bangalore, India
...
✅ Scraping completed!
📊 Summary:
   Posts processed: 20
   Leads extracted: 15
   Errors: 0
```

---

## 🎉 Success Indicators

- ✅ Backend starts without errors
- ✅ Frontend loads at http://localhost:8081
- ✅ Campaign creates successfully
- ✅ Runner opens Chrome and navigates to LinkedIn
- ✅ Leads appear in UI table
- ✅ Post URLs formatted as: `https://www.linkedin.com/feed/update/urn:li:activity:XXXXX/`

---

## 📚 Full Documentation

- [TESTING_GUIDE_COMPLETE.md](./TESTING_GUIDE_COMPLETE.md) - Comprehensive testing guide
- [LINKEDIN_IMPLEMENTATION_SUMMARY.md](./LINKEDIN_IMPLEMENTATION_SUMMARY.md) - Feature overview
- [LINKEDIN_RUNNER_IMPLEMENTATION_PLAN.md](./LINKEDIN_RUNNER_IMPLEMENTATION_PLAN.md) - Implementation details

---

**Questions? Check the full testing guide!**
