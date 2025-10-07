# LinkedIn Scraping - Quick Reference Guide

## Two Ways to Scrape LinkedIn Hiring Posts

### 1. Local Runner (New) 🆕
**File:** `scripts/linkedin-hiring-runner.js`

**Use when:**
- You want to test quickly on your local machine
- You're already logged into LinkedIn in Chrome
- You want immediate results without setting up the full system
- You're doing one-off data collection

**Run:**
```bash
node scripts/linkedin-hiring-runner.js
```

**Pros:**
- ✅ Quick setup (no API keys needed)
- ✅ Uses your existing Chrome login
- ✅ Immediate execution
- ✅ Full control over timing
- ✅ Easy to customize search query

**Cons:**
- ❌ Manual execution (no scheduling)
- ❌ Ties up your browser
- ❌ No remote management
- ❌ Limited to your machine

---

### 2. API-Based Job Queue (Production)
**Files:** `src/jobs/handlers/linkedInScraping.ts`, `src/routes/linkedin.ts`

**Use when:**
- You need scheduled/recurring scraping
- You want to manage multiple campaigns
- You need remote access via API
- You're building a product/service

**Run:**
```bash
# Start backend
npm run dev

# Create campaign via API
curl -X POST http://localhost:3011/api/linkedin/campaigns \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hiring Posts Campaign",
    "description": "Software engineering roles",
    "query": "hiring software engineer"
  }'
```

**Pros:**
- ✅ REST API access
- ✅ Job queue with retries
- ✅ Frontend UI included
- ✅ Multi-tenant support
- ✅ Campaign management
- ✅ Scheduled execution
- ✅ Progress tracking

**Cons:**
- ❌ More complex setup
- ❌ Requires API keys
- ❌ Need LinkedIn cookies in storage

---

## Feature Comparison

| Feature | Local Runner | API Job Queue |
|---------|-------------|---------------|
| **Setup Time** | < 1 minute | ~10 minutes |
| **Authentication** | Chrome session | Cookie export |
| **Execution** | Manual | Scheduled/Manual |
| **Management** | Command line | REST API + UI |
| **Multi-tenant** | No | Yes |
| **Retry Logic** | No | Yes (3 attempts) |
| **Progress Tracking** | Console | Database + UI |
| **CSV Export** | Manual query | API endpoint |
| **Background Jobs** | No | Yes (Agenda) |
| **Remote Access** | No | Yes |

---

## Use Cases

### Local Runner Scenarios

**Quick Lead Research**
```bash
# Find 20 hiring posts for immediate outreach
MAX_POSTS=20 node scripts/linkedin-hiring-runner.js
```

**Testing Search Queries**
```bash
# Edit SEARCH_QUERY in the script, then:
node scripts/linkedin-hiring-runner.js
```

**Weekend Batch Collection**
```bash
# Let it run while you're away
MAX_POSTS=200 node scripts/linkedin-hiring-runner.js
```

---

### API Job Queue Scenarios

**Daily Automated Scraping**
```javascript
// Schedule via cron or frontend
POST /api/linkedin/campaigns
{
  "name": "Daily Tech Hiring",
  "query": "hiring software engineer",
  "schedule": "0 9 * * *" // 9 AM daily
}
```

**Multi-Team Usage**
```javascript
// Different teams, different tenants
Tenant A: queries="hiring frontend react"
Tenant B: queries="hiring backend python"
```

**Client Portal**
```javascript
// Clients create campaigns via your UI
// Results available at /linkedin/campaigns/:id
```

---

## Data Flow Comparison

### Local Runner
```
You → Run Script → Chrome Opens → LinkedIn → Scrape Posts → AI Extract → MongoDB
                                                                           ↓
                                                                    View with mongosh
```

### API Job Queue
```
You → API Request → Agenda Queue → Job Handler → Playwright → LinkedIn → AI Extract → MongoDB
                                                                                         ↓
                                                                                   REST API
                                                                                         ↓
                                                                                   Frontend UI
```

---

## Quick Start Guide

### For Immediate Testing (Local Runner)

1. **Make sure you're logged into LinkedIn in Chrome**
   ```bash
   open -a "Google Chrome" https://www.linkedin.com
   ```

2. **Run the test script**
   ```bash
   cd /Users/mohanpraneeth/Desktop/Coding/crawlee
   ./scripts/test-hiring-runner.sh
   ```

3. **View results**
   ```bash
   mongosh mongodb://localhost:27017/crawlee
   > db.linkedinleads.find().pretty()
   ```

### For Production Setup (API Job Queue)

1. **Start the backend**
   ```bash
   cd /Users/mohanpraneeth/Desktop/Coding/crawlee
   npm run dev
   ```

2. **Create a campaign**
   ```bash
   curl -X POST http://localhost:3011/api/linkedin/campaigns \
     -H "x-api-key: test_key_123" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Tech Hiring Posts",
       "description": "Software engineering roles",
       "query": "hiring software engineer remote"
     }'
   ```

3. **View in UI**
   ```bash
   cd /Users/mohanpraneeth/Desktop/Coding/insight-scrape-flow
   npm run dev
   # Navigate to http://localhost:8080/linkedin
   ```

---

## Search Query Tips

### Good Queries (High Quality)
```javascript
// Specific role + hiring intent
"hiring software engineer"
"recruiting backend developer"
"looking for frontend developer"

// With location
"hiring software engineer San Francisco"
"remote engineering positions"

// With seniority
"hiring senior engineer"
"recruiting junior developer"
```

### Avoid (Low Quality)
```javascript
// Too broad
"hiring"
"jobs"

// Too narrow
"hiring rockstar ninja guru developer" // Unlikely to match
```

### Advanced Queries
```javascript
// Boolean operators
'hiring AND (software OR engineer) AND remote'

// Multiple roles
'hiring (frontend OR backend OR fullstack) developer'

// Exclude terms
'hiring engineer NOT intern'
```

---

## Customization Examples

### Local Runner: Change Search Query
```javascript
// Edit scripts/linkedin-hiring-runner.js
const CONFIG = {
  // Focus on remote engineering roles
  SEARCH_QUERY: 'hiring remote (software engineer OR backend developer)',
  
  // More posts
  MAX_POSTS: 100,
};
```

### API Job Queue: Add Custom Fields
```typescript
// Edit src/db/models/LinkedInLead.ts
const linkedInLeadSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Add your custom fields
  industry: String,
  companySize: String,
  benefits: [String],
});
```

---

## Troubleshooting

### Local Runner Issues

**Chrome doesn't open**
```bash
# Check Chrome installation
ls "$HOME/Library/Application Support/Google/Chrome"

# Try with explicit path
export CHROME_USER_DATA="/path/to/chrome/profile"
node scripts/linkedin-hiring-runner.js
```

**No posts found**
```javascript
// Try broader query
SEARCH_QUERY: 'hiring software'

// Or check if you're logged in
// Open Chrome manually: https://www.linkedin.com
```

### API Job Queue Issues

**Job not starting**
```bash
# Check Agenda status
mongosh mongodb://localhost:27017/crawlee
> db.agendaJobs.find({name: "linkedin:scrape"}).pretty()

# Check task status
> db.tasks.find().sort({createdAt: -1}).limit(1).pretty()
```

**Rate limits**
```javascript
// Reduce concurrency in src/jobs/agenda.ts
agenda.define('linkedin:scrape', { concurrency: 1 }, handler);

// Increase delays in handler
await humanDelay(30000, 45000); // 30-45 seconds
```

---

## Best Practices

1. **Start Small**: Test with 5-10 posts first
2. **Monitor Console**: Watch for rate limit warnings
3. **Space Out Runs**: Wait 2-3 hours between sessions
4. **Use Specific Queries**: Better results than broad searches
5. **Verify Data**: Check extracted leads for accuracy
6. **Respect LinkedIn**: Don't overuse automation

---

## Need Help?

- **Local Runner**: See `LINKEDIN_HIRING_RUNNER.md`
- **API Job Queue**: See `LINKEDIN_INTEGRATION_GUIDE.md`
- **Architecture**: See `docs/ARCHITECTURE.md`
