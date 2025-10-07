# 🎯 LinkedIn Hiring Posts Scraper

> **Scrape LinkedIn posts about hiring from the last week using AI-powered extraction**

## ⚡ Quick Start (30 seconds)

```bash
# 1. Make sure you're logged into LinkedIn in Chrome
open -a "Google Chrome" https://www.linkedin.com

# 2. Run the scraper (interactive menu)
./scripts/run-hiring-scraper.sh

# 3. Choose preset: quick (10 posts) | standard (50) | deep (200)
```

That's it! Results are saved to MongoDB automatically.

---

## 📁 What You Get

This creates 3 ways to scrape LinkedIn hiring posts:

### 1. 🚀 Interactive Launcher (Easiest)
```bash
./scripts/run-hiring-scraper.sh
```
Choose from presets:
- **Quick** - 10 posts (~5 min)
- **Standard** - 50 posts (~25 min)  
- **Deep** - 200 posts (~100 min)
- **Custom** - Your own settings

### 2. 🔧 Direct Script (Flexible)
```bash
# Default (50 posts)
node scripts/linkedin-hiring-runner.js

# With environment variables
MAX_POSTS=100 node scripts/linkedin-hiring-runner.js
```

### 3. 🧪 Test Script (Validation)
```bash
# Test with 5 posts
./scripts/test-hiring-runner.sh
```

---

## 💡 What It Does

1. ✅ Opens Chrome with your existing LinkedIn session
2. ✅ Searches for posts with "hiring" keywords from **last week**
3. ✅ Scrolls slowly like a human (18-30 second delays)
4. ✅ Uses **Ollama AI** to extract:
   - Company name
   - Job titles
   - Locations
   - Seniority level
   - Required skills
   - Salary range (if mentioned)
   - Work mode (Remote/Hybrid/Onsite)
   - Application links
5. ✅ Saves structured data to MongoDB
6. ✅ Detects rate limits and stops gracefully
7. ✅ Prevents duplicates automatically

---

## 📊 Example Output

```bash
🚀 Starting LinkedIn Hiring Posts Scraper
📊 Config: Max 50 posts
✓ Connected to MongoDB
✓ Created campaign: 507f1f77bcf86cd799439011
🌐 Launching Chrome...
✓ Browser ready

📝 Processing post 1/50
   Author: Jane Smith
   🤖 Extracting with AI...
   ✅ Lead saved!
      Jobs: Senior Backend Engineer
      Locations: Remote, San Francisco
      Skills: Python, AWS, Docker

... (continues) ...

✅ Scraping completed!
📊 Summary:
   Posts processed: 50
   Leads extracted: 42
   Campaign ID: 507f1f77bcf86cd799439011
```

---

## 🗄️ View Results

### MongoDB Shell
```bash
mongosh mongodb://localhost:27017/crawlee

# View all leads
db.linkedinleads.find().pretty()

# Count by company
db.linkedinleads.aggregate([
  { $group: { _id: "$company", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])

# Export to JSON
mongoexport --db=crawlee --collection=linkedinleads --out=leads.json
```

### Frontend UI
```bash
cd insight-scrape-flow
npm run dev
# Navigate to: http://localhost:8080/linkedin
```

### Direct Export
```bash
# To CSV (requires backend running)
curl http://localhost:3011/api/linkedin/campaigns/CAMPAIGN_ID/export -o leads.csv
```

---

## ⚙️ Customization

### Change Search Query

Edit `scripts/linkedin-hiring-runner.js`:
```javascript
const CONFIG = {
  // Focus on remote jobs
  SEARCH_QUERY: 'hiring remote (software OR developer)',
  
  // Marketing roles
  // SEARCH_QUERY: 'hiring (marketing OR "content creator")',
  
  // Specific location
  // SEARCH_QUERY: 'hiring software engineer "New York"',
  
  MAX_POSTS: 100,
};
```

### Use Environment Variables
```bash
# Collect 200 posts
MAX_POSTS=200 ./scripts/run-hiring-scraper.sh quick

# Different database
MONGO_URL=mongodb://remote:27017/db node scripts/linkedin-hiring-runner.js

# Different tenant
TENANT_ID=my-company node scripts/linkedin-hiring-runner.js
```

---

## 📋 Data Schema

Each lead includes:
```javascript
{
  _id: ObjectId,
  campaignId: ObjectId,
  linkedInId: "unique_post_id",
  authorName: "Jane Smith",
  authorHeadline: "Senior Recruiter at TechCorp",
  authorProfile: "https://linkedin.com/in/janesmith",
  company: "TechCorp",
  jobTitles: ["Senior Backend Engineer", "Python Developer"],
  locations: ["Remote", "San Francisco"],
  seniority: "Senior",
  skills: ["Python", "AWS", "Docker", "Kubernetes"],
  salaryRange: "$150k-$200k",
  workMode: "Remote",
  postText: "Full post text...",
  postUrl: "https://linkedin.com/feed/update/...",
  applicationLink: "https://jobs.techcorp.com/apply",
  postedAt: Date,
  extractedAt: Date,
  createdAt: Date
}
```

---

## 🛡️ Rate Limit Protection

The script automatically detects when LinkedIn rate limits:
- URL changes to `/authwall` or `/checkpoint`
- Page shows "try again later"
- Verification prompts appear

**When detected:**
- Stops immediately
- Saves all progress
- You can resume later (duplicates are skipped)

**Best practices:**
- Run during off-peak hours (late night)
- Start with 10-20 posts for testing
- Wait 2-3 hours between runs
- Use VPN to rotate IP (optional)

---

## 🔧 Troubleshooting

### "Not logged in" Error
```bash
# Solution: Log into LinkedIn in Chrome first
open -a "Google Chrome" https://www.linkedin.com
# Then run the script again
```

### Chrome doesn't open
```bash
# Check Chrome installation
ls "$HOME/Library/Application Support/Google/Chrome"

# Try with custom path
export CHROME_USER_DATA="/custom/path"
node scripts/linkedin-hiring-runner.js
```

### MongoDB not running
```bash
# Docker
docker-compose up -d mongodb

# Homebrew
brew services start mongodb-community
```

### Ollama API error
```bash
# Test connection
curl https://ollama2.havenify.ai/api/tags

# Or use local Ollama
export OLLAMA_URL=http://localhost:11434
```

### No hiring posts found
Try a broader query:
```javascript
SEARCH_QUERY: 'hiring' // Very broad
SEARCH_QUERY: 'hiring software' // Still broad but better
```

---

## 📚 Documentation

- **`SETUP_LINKEDIN_HIRING.md`** - Complete setup guide
- **`LINKEDIN_HIRING_RUNNER.md`** - Full documentation with examples
- **`LINKEDIN_QUICK_REFERENCE.md`** - Comparison with API approach
- **`LINKEDIN_HIRING_DIAGRAM.txt`** - Visual architecture

---

## 🆚 Local Runner vs API Job Queue

| Feature | Local Runner | API Queue |
|---------|-------------|-----------|
| Setup time | 1 minute | 10 minutes |
| Best for | Quick testing | Production |
| Scheduling | Manual | Automated |
| UI | Console | Web interface |
| Multi-tenant | No | Yes |

**Use local runner when:**
- Testing search queries
- One-off data collection
- Immediate results needed

**Use API queue when:**
- Building a product
- Need scheduling
- Want remote access
- Multiple users

---

## 🎨 Advanced Usage

### Cron Job (Automated Daily Runs)
```bash
# Add to crontab (run at 2 AM daily)
0 2 * * * cd /Users/mohanpraneeth/Desktop/Coding/crawlee && MAX_POSTS=50 node scripts/linkedin-hiring-runner.js >> /var/log/linkedin-scraper.log 2>&1
```

⚠️ **Warning**: Be careful with automation. LinkedIn may rate limit more aggressively.

### Multiple Queries
```bash
# Create a wrapper script
for query in "hiring frontend" "hiring backend" "hiring devops"; do
  SEARCH_QUERY="$query" MAX_POSTS=20 node scripts/linkedin-hiring-runner.js
  sleep 7200  # Wait 2 hours between runs
done
```

### Export Pipeline
```bash
# Scrape → Export → Process
node scripts/linkedin-hiring-runner.js
mongoexport --db=crawlee --collection=linkedinleads --out=leads.json
python analyze_leads.py leads.json
```

---

## 🔒 Security & Legal

⚠️ **Important Notes:**
- Uses your personal LinkedIn account
- LinkedIn's ToS prohibits automated scraping
- Use responsibly and at your own risk
- Consider using a test account
- Don't share credentials or cookies

**We recommend:**
- Only scraping publicly available posts
- Respecting rate limits
- Using for personal research/learning
- Not commercializing scraped data

---

## 🚀 Quick Commands

```bash
# Test (5 posts)
./scripts/test-hiring-scraper.sh

# Quick (10 posts)
./scripts/run-hiring-scraper.sh quick

# Standard (50 posts)
./scripts/run-hiring-scraper.sh standard

# Deep (200 posts)
./scripts/run-hiring-scraper.sh deep

# Custom
./scripts/run-hiring-scraper.sh custom

# Direct with env vars
MAX_POSTS=100 node scripts/linkedin-hiring-runner.js

# View results
mongosh mongodb://localhost:27017/crawlee
> db.linkedinleads.find().pretty()
```

---

## 📦 Files Created

```
crawlee/
├── scripts/
│   ├── linkedin-hiring-runner.js      # Main scraper (420 lines)
│   ├── run-hiring-scraper.sh          # Interactive launcher
│   └── test-hiring-runner.sh          # Test script
├── LINKEDIN_HIRING_RUNNER.md          # Full documentation
├── LINKEDIN_QUICK_REFERENCE.md        # Comparison guide
├── LINKEDIN_HIRING_DIAGRAM.txt        # Visual architecture
├── SETUP_LINKEDIN_HIRING.md           # Setup guide
└── README_HIRING_SCRAPER.md           # This file
```

---

## 🤝 Contributing

Found a bug? Have a feature request? PRs welcome!

---

## 📄 License

Use at your own risk. Ensure compliance with LinkedIn's Terms of Service.

---

## 🎉 Ready to Start?

```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
./scripts/run-hiring-scraper.sh
```

Good luck with your lead generation! 🚀
