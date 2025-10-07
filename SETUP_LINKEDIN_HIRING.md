# ✅ LinkedIn Hiring Posts Scraper - Complete

## What Was Created

### 🎯 Main Script
**`scripts/linkedin-hiring-runner.js`** (420 lines)
- Scrapes LinkedIn posts about hiring from the last week
- Uses Ollama AI to extract job details (titles, locations, skills, salary, etc.)
- Saves to MongoDB with full campaign tracking
- Human-like behavior with rate limit detection
- Works with your existing Chrome login

### 📚 Documentation
1. **`LINKEDIN_HIRING_RUNNER.md`** - Complete guide with examples
2. **`LINKEDIN_QUICK_REFERENCE.md`** - Comparison of local vs API approach
3. **`scripts/test-hiring-runner.sh`** - Test script for quick validation

## Quick Start

### Step 1: Make Sure LinkedIn is Logged In
```bash
# Open Chrome and log into LinkedIn
open -a "Google Chrome" https://www.linkedin.com
```

### Step 2: Run the Test (5 posts)
```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
./scripts/test-hiring-runner.sh
```

### Step 3: Run Full Collection (50 posts)
```bash
node scripts/linkedin-hiring-runner.js
```

## What It Does

1. ✅ Opens Chrome with your existing session
2. ✅ Searches: `hiring OR "we're hiring" OR recruiting (software OR engineer OR developer)`
3. ✅ Filters: Posts from **last week only**
4. ✅ Scrolls slowly like a human (18-30 seconds between posts)
5. ✅ Extracts with AI:
   - Company name
   - Job titles
   - Locations
   - Seniority level
   - Required skills
   - Salary range (if mentioned)
   - Work mode (Remote/Hybrid/Onsite)
   - Application link
6. ✅ Saves to MongoDB
7. ✅ Creates campaign for tracking
8. ✅ Detects rate limits and stops gracefully

## Example Output

```
🚀 Starting LinkedIn Hiring Posts Scraper
📊 Config: Max 50 posts, Query: "hiring OR recruiting (software OR engineer)"
✓ Connected to MongoDB
✓ Created campaign: 507f1f77bcf86cd799439011
🌐 Launching Chrome with existing profile...
✓ Browser ready
🔍 Navigating to search...

📝 Processing post 1/50
   Author: Jane Smith
   Text preview: We're hiring! Looking for Senior Backend Engineers...
   🤖 Extracting lead details with AI...
   ✅ Lead saved! (1 total)
      Jobs: Senior Backend Engineer, Python Developer
      Locations: Remote, San Francisco

📝 Processing post 2/50
   Author: Tech Recruiter
   Text preview: Join our team! Multiple engineering positions open...
   🤖 Extracting lead details with AI...
   ✅ Lead saved! (2 total)
      Jobs: Full Stack Engineer, DevOps Engineer
      Locations: New York, Remote

... continues ...

✅ Scraping completed!
📊 Summary:
   Posts processed: 50
   Leads extracted: 42
   Errors: 0
   Campaign ID: 507f1f77bcf86cd799439011
```

## View Results

### Option 1: MongoDB Shell
```bash
mongosh mongodb://localhost:27017/crawlee

# View all campaigns
db.campaigns.find().pretty()

# View leads from latest campaign
db.linkedinleads.find().sort({createdAt: -1}).limit(10).pretty()

# Export to JSON
mongoexport --db=crawlee --collection=linkedinleads --out=leads.json --pretty
```

### Option 2: Frontend UI
```bash
# Start frontend
cd /Users/mohanpraneeth/Desktop/Coding/insight-scrape-flow
npm run dev

# Navigate to: http://localhost:8080/linkedin
# View campaigns and download CSV
```

### Option 3: Direct Database Query
```javascript
// In MongoDB Compass or mongosh
db.linkedinleads.aggregate([
  {
    $group: {
      _id: "$company",
      jobs: { $addToSet: "$jobTitles" },
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } }
])
// Shows which companies are hiring most
```

## Customization

### Change Search Query
Edit `scripts/linkedin-hiring-runner.js`:
```javascript
const CONFIG = {
  // Focus on remote jobs
  SEARCH_QUERY: 'hiring remote (software OR developer OR engineer)',
  
  // Or marketing roles
  // SEARCH_QUERY: 'hiring (marketing OR "content creator" OR "social media manager")',
  
  // Or specific location
  // SEARCH_QUERY: 'hiring software engineer "San Francisco"',
  
  MAX_POSTS: 100, // Collect more posts
};
```

### Run with Environment Variables
```bash
# Collect 200 posts
MAX_POSTS=200 node scripts/linkedin-hiring-runner.js

# Use different tenant
TENANT_ID=my-company node scripts/linkedin-hiring-runner.js

# Custom MongoDB
MONGO_URL=mongodb://remote:27017/db node scripts/linkedin-hiring-runner.js
```

## Database Schema

### Campaign
```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  tenantId: "local-test-tenant",
  name: "Hiring Posts - 2025-10-03",
  description: "Scraping LinkedIn hiring posts from the last week",
  query: "hiring OR recruiting...",
  status: "completed",
  progress: 100,
  stats: {
    postsProcessed: 50,
    leadsExtracted: 42,
    errors: 0
  },
  createdAt: ISODate("2025-10-03T17:00:00Z"),
  updatedAt: ISODate("2025-10-03T17:45:00Z")
}
```

### LinkedIn Lead
```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439012"),
  tenantId: "local-test-tenant",
  campaignId: ObjectId("507f1f77bcf86cd799439011"),
  linkedInId: "7123456789012345678",
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
  postText: "We're hiring! Looking for experienced...",
  postUrl: "https://linkedin.com/feed/update/urn:li:activity:7123...",
  applicationLink: "https://jobs.techcorp.com/apply/12345",
  postedAt: ISODate("2025-09-30T10:30:00Z"),
  extractedAt: ISODate("2025-10-03T17:15:00Z"),
  createdAt: ISODate("2025-10-03T17:15:00Z"),
  updatedAt: ISODate("2025-10-03T17:15:00Z")
}
```

## Rate Limiting

The script automatically detects when LinkedIn rate limits and stops:

**Detection signals:**
- URL changes to `/authwall` or `/checkpoint`
- Page shows "try again later" or "unusual activity"
- Verification prompts

**What happens:**
- Script stops immediately
- Progress saved to database
- Campaign marked as completed
- You can resume later (script skips duplicates)

**Best practices:**
- Run during off-peak hours (late night)
- Start with small numbers (MAX_POSTS=10)
- Wait 2-3 hours between runs
- Use a VPN to rotate IP (optional)

## Comparison with API Job Queue

| Feature | Local Runner | API Job Queue |
|---------|-------------|---------------|
| **Setup** | 1 minute | 10 minutes |
| **Authentication** | Chrome session | Cookie export |
| **Scheduling** | Manual | Automated |
| **UI** | Console | Web interface |
| **Remote access** | No | Yes |
| **Multi-tenant** | No | Yes |
| **Best for** | Quick testing | Production use |

## Troubleshooting

### "Not logged in" Error
```bash
# Solution: Log into LinkedIn in Chrome first
open -a "Google Chrome" https://www.linkedin.com
# Wait for login, then run script
```

### Chrome Doesn't Open
```bash
# Check Chrome profile path
ls "$HOME/Library/Application Support/Google/Chrome"

# Try with custom path
export CHROME_USER_DATA="/path/to/profile"
node scripts/linkedin-hiring-runner.js
```

### Ollama Error
```bash
# Test connection
curl https://ollama2.havenify.ai/api/tags

# Or use local Ollama
export OLLAMA_URL=http://localhost:11434
```

### No Hiring Posts Found
```javascript
// Use broader query
SEARCH_QUERY: 'hiring'

// Or check date filter (try 'past-month')
TIME_FILTER: 'past-month'
```

### MongoDB Connection Failed
```bash
# Check MongoDB is running
docker ps | grep mongodb

# Or start it
docker-compose up -d mongodb
```

## Next Steps

1. **Test it**: Run `./scripts/test-hiring-runner.sh`
2. **Customize**: Edit search query for your needs
3. **Scale up**: Increase MAX_POSTS once comfortable
4. **Export**: Use mongosh or frontend to get results
5. **Automate**: Add to cron for daily runs (carefully!)

## Files Created

```
crawlee/
├── scripts/
│   ├── linkedin-hiring-runner.js      # Main script (420 lines)
│   └── test-hiring-runner.sh          # Test script
├── LINKEDIN_HIRING_RUNNER.md          # Full documentation
├── LINKEDIN_QUICK_REFERENCE.md        # Comparison guide
└── SETUP_LINKEDIN_HIRING.md           # This file
```

## Support

- **Full guide**: See `LINKEDIN_HIRING_RUNNER.md`
- **API version**: See `LINKEDIN_INTEGRATION_GUIDE.md`
- **Architecture**: See `docs/ARCHITECTURE.md`

---

Ready to start! Run the test script first:
```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
./scripts/test-hiring-runner.sh
```

Good luck! 🚀
