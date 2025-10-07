# LinkedIn Hiring Posts Scraper - Local Runner

A local script to scrape LinkedIn posts about hiring/recruiting from the last week.

## Features

✅ **Automated Hiring Post Detection** - Finds posts with hiring keywords  
✅ **AI-Powered Extraction** - Uses Ollama to extract job details  
✅ **Database Storage** - Saves leads to MongoDB with full details  
✅ **Human-Like Behavior** - Random delays, slow scrolling, realistic patterns  
✅ **Rate Limit Detection** - Gracefully stops when LinkedIn rate limits  
✅ **Duplicate Prevention** - Skips already processed posts  

## Prerequisites

1. **Chrome with LinkedIn Session**
   - You must be logged into LinkedIn in your Chrome browser
   - The script uses your existing Chrome profile/cookies

2. **MongoDB Running**
   ```bash
   # Using Docker
   docker-compose up -d mongodb
   
   # Or local MongoDB
   brew services start mongodb-community
   ```

3. **Ollama API Access**
   - Default: https://ollama2.havenify.ai
   - Model: deepseek-r1:14b

## Usage

### Basic Usage

```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
node scripts/linkedin-hiring-runner.js
```

### With Custom Configuration

```bash
# Set environment variables
export MAX_POSTS=100
export TENANT_ID=my-company
export MONGO_URL=mongodb://localhost:27017/my-db

node scripts/linkedin-hiring-runner.js
```

## Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MONGO_URL` | `mongodb://localhost:27017/crawlee` | MongoDB connection string |
| `OLLAMA_URL` | `https://ollama2.havenify.ai` | Ollama API endpoint |
| `CHROME_USER_DATA` | System Chrome profile | Path to Chrome user data |
| `TENANT_ID` | `local-test-tenant` | Tenant identifier for multi-tenancy |
| `MAX_POSTS` | `50` | Maximum number of posts to process |

## Search Query Customization

Edit the `SEARCH_QUERY` in the script to customize what you're looking for:

```javascript
const CONFIG = {
  // Default: Software engineering hiring posts
  SEARCH_QUERY: 'hiring OR "we\'re hiring" OR recruiting (software OR engineer OR developer)',
  
  // Example: Marketing roles
  // SEARCH_QUERY: 'hiring OR recruiting (marketing OR "content creator" OR "social media")',
  
  // Example: Remote jobs
  // SEARCH_QUERY: 'hiring AND remote (engineer OR developer OR designer)',
};
```

## How It Works

1. **Launch Browser** - Opens Chrome with your existing profile
2. **Search LinkedIn** - Navigates to content search with hiring keywords
3. **Filter by Date** - Only looks at posts from the past week
4. **Scroll & Collect** - Slowly scrolls through results like a human
5. **AI Extraction** - For each hiring post:
   - Extracts author name, headline, profile
   - Sends post text to Ollama AI
   - Extracts: company, job titles, locations, skills, salary, work mode
6. **Save to Database** - Stores leads with full details
7. **Rate Limit Detection** - Stops gracefully if LinkedIn blocks

## Database Schema

### Campaign Document
```javascript
{
  _id: ObjectId,
  tenantId: String,
  name: String,
  description: String,
  query: String,
  status: 'running' | 'completed' | 'failed',
  progress: Number, // 0-100
  stats: {
    postsProcessed: Number,
    leadsExtracted: Number,
    errors: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

### LinkedIn Lead Document
```javascript
{
  _id: ObjectId,
  tenantId: String,
  campaignId: ObjectId,
  linkedInId: String, // Unique post ID
  authorName: String,
  authorHeadline: String,
  authorProfile: String,
  company: String,
  jobTitles: [String],
  locations: [String],
  seniority: String, // Junior/Mid/Senior/Lead/Manager/Director
  skills: [String],
  salaryRange: String,
  workMode: String, // Remote/Hybrid/Onsite
  postText: String,
  postUrl: String,
  applicationLink: String,
  postedAt: Date,
  extractedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## Viewing Results

### Option 1: MongoDB Shell
```bash
mongosh mongodb://localhost:27017/crawlee

# View campaigns
db.campaigns.find().sort({createdAt: -1}).limit(5)

# View leads from a campaign
db.linkedinleads.find({campaignId: ObjectId("YOUR_CAMPAIGN_ID")})

# Count leads
db.linkedinleads.countDocuments()
```

### Option 2: Export to CSV
```bash
# Using the API (if backend is running)
curl -H "x-api-key: YOUR_API_KEY" \
  http://localhost:3011/api/linkedin/campaigns/CAMPAIGN_ID/export \
  -o leads.csv
```

### Option 3: Frontend UI
1. Start the frontend: `cd insight-scrape-flow && npm run dev`
2. Navigate to http://localhost:8080/linkedin
3. View campaigns and download results

## Human Behavior Patterns

The script mimics human behavior to avoid detection:

- **Slow Navigation**: 3-5 second waits after page loads
- **Random Scrolling**: 2-4 scroll actions with 0.8-1.5s delays
- **Reading Time**: 18-30 seconds between posts
- **Mouse Movements**: Random viewport movements
- **Natural Variance**: All delays have ±20% randomness

## Rate Limit Handling

The script detects rate limits by checking:
- URL patterns (`/authwall`, `/checkpoint`, `/uas/`)
- Page content ("try again later", "unusual activity")
- Verification prompts

**When detected:**
- Stops processing immediately
- Saves progress to database
- Closes browser gracefully
- Campaign marked as completed with partial results

## Troubleshooting

### "Not logged in" Error
```bash
# Solution: Log in to LinkedIn in Chrome first
open -a "Google Chrome" https://www.linkedin.com
# Then run the script again
```

### "Rate limit detected"
```bash
# Solution: Wait 30-60 minutes and try again
# Or use fewer posts: MAX_POSTS=20 node scripts/linkedin-hiring-runner.js
```

### "Ollama API error"
```bash
# Check Ollama is accessible
curl https://ollama2.havenify.ai/api/tags

# Or use local Ollama
export OLLAMA_URL=http://localhost:11434
```

### "Database connection failed"
```bash
# Check MongoDB is running
docker ps | grep mongodb
# Or
brew services list | grep mongodb
```

## Best Practices

1. **Run During Off-Peak Hours** - LinkedIn is less likely to rate limit at night
2. **Start Small** - Test with `MAX_POSTS=10` first
3. **Monitor Progress** - Watch the console output for errors
4. **Space Out Runs** - Wait 2-3 hours between runs
5. **Use VPN (Optional)** - Rotate IP addresses for longer sessions

## Example Output

```
🚀 Starting LinkedIn Hiring Posts Scraper
📊 Config: Max 50 posts, Query: "hiring OR recruiting"
✓ Connected to MongoDB
✓ Created campaign: 507f1f77bcf86cd799439011
🌐 Launching Chrome with existing profile...
✓ Browser ready
🔍 Navigating to search: https://www.linkedin.com/search/results/content/...
📄 Found 25 posts on page

📝 Processing post 1/50
   Author: John Doe
   Text preview: We're hiring! Looking for Senior Software Engineers to join our team...
   🤖 Extracting lead details with AI...
   ✅ Lead saved! (1 total)
      Jobs: Senior Software Engineer, Backend Developer
      Locations: San Francisco, Remote

... (continues) ...

✅ Scraping completed!
📊 Summary:
   Posts processed: 50
   Leads extracted: 42
   Errors: 0
   Campaign ID: 507f1f77bcf86cd799439011
```

## Integration with Main System

This script creates campaigns and leads that are compatible with the main API:

- View campaigns: `GET /api/linkedin/campaigns`
- Get campaign details: `GET /api/linkedin/campaigns/:id`
- Export CSV: `GET /api/linkedin/campaigns/:id/export`

## Security Notes

⚠️ **Important:**
- This script uses your personal LinkedIn account
- LinkedIn's ToS prohibits automated scraping
- Use responsibly and at your own risk
- Consider using a test account
- Don't share your Chrome profile path publicly

## License

Use at your own risk. Ensure compliance with LinkedIn's Terms of Service.
