# LinkedIn Scraping Guide

## Why LinkedIn Scraping is Challenging

LinkedIn actively blocks automated scraping attempts by:
1. **Requiring authentication** - Most content is behind login
2. **Rate limiting** - Aggressive limits on requests
3. **Bot detection** - Advanced fingerprinting and behavior analysis
4. **Dynamic content** - Heavy use of JavaScript and dynamic loading
5. **Legal considerations** - LinkedIn's Terms of Service prohibit scraping

## Current Status

Our previous LinkedIn campaigns failed because:
- ✗ No authentication cookies provided
- ✗ Redirected to login page
- ✗ Content requires JavaScript execution
- ✗ Selectors don't match without being logged in

## Solution Options

### Option 1: Use LinkedIn Cookies (Manual Auth)

**Steps:**
1. Log into LinkedIn in your browser
2. Open DevTools (F12) → Application → Cookies
3. Copy the `li_at` cookie value
4. Add to tenant configuration

**Add LinkedIn Cookie to Tenant:**
```bash
# Update your tenant with LinkedIn cookie
curl -X PATCH http://localhost:3011/api/tenants/YOUR_TENANT_ID \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -d '{
    "linkedinCookie": "li_at=YOUR_LI_AT_COOKIE_VALUE"
  }'
```

**Note:** Cookies expire after ~1 year or when you log out.

### Option 2: Use Firecrawl API (Recommended)

Firecrawl handles authentication and anti-bot measures for you.

**Campaign Configuration:**
```json
{
  "name": "LinkedIn Posts via Firecrawl",
  "source": "linkedin",
  "mode": "firecrawl",
  "output": "database",
  "maxItems": 50,
  "seedUrls": [
    "https://www.linkedin.com/search/results/content/?keywords=hiring"
  ]
}
```

### Option 3: Use Alternative Public Sources

Instead of LinkedIn, use publicly accessible job boards:

**Working Alternatives:**
1. **HackerNews "Who is Hiring"** ✅ (Already working)
   - URL: `https://news.ycombinator.com/item?id=THREAD_ID`
   - No authentication required
   - Clean HTML structure
   
2. **GitHub Jobs API**
   - URL: `https://jobs.github.com/positions.json`
   - Free API, no auth needed
   
3. **RemoteOK API**
   - URL: `https://remoteok.com/api`
   - Public API with job listings
   
4. **Indeed RSS Feeds**
   - URL: `https://www.indeed.com/rss?q=software+engineer&l=`
   - Public RSS feeds

5. **Company Career Pages**
   - Most tech companies have scrapable career pages
   - Examples: Stripe, Shopify, Airbnb careers pages

## Working Example: Alternative Job Scraping

### RemoteOK Jobs (No Auth Required)

```bash
cat > /tmp/remoteok_jobs.json << 'EOF'
{
  "name": "RemoteOK Recent Jobs",
  "description": "Scrape recent job postings from RemoteOK",
  "source": "custom",
  "mode": "crawlee",
  "output": "database",
  "strategy": "cheerio",
  "maxItems": 50,
  "seedUrls": [
    "https://remoteok.com/"
  ],
  "selectors": {
    "jobTitle": ".job-title",
    "company": ".company",
    "location": ".location",
    "tags": ".tags",
    "salary": ".salary",
    "jobUrl": "a.job"
  },
  "query": {
    "source": "remoteok",
    "type": "remote_jobs"
  }
}
EOF

curl -X POST http://localhost:3011/api/campaigns \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -d @/tmp/remoteok_jobs.json
```

### Indeed Jobs (RSS Feed)

```bash
cat > /tmp/indeed_jobs.json << 'EOF'
{
  "name": "Indeed Software Jobs",
  "description": "Scrape recent software engineering jobs from Indeed",
  "source": "custom",
  "mode": "crawlee",
  "output": "database",
  "strategy": "cheerio",
  "maxItems": 50,
  "seedUrls": [
    "https://www.indeed.com/jobs?q=software+engineer&l=Remote"
  ],
  "selectors": {
    "jobTitle": ".jobTitle",
    "company": ".companyName",
    "location": ".companyLocation",
    "summary": ".job-snippet",
    "salary": ".salary-snippet"
  }
}
EOF

curl -X POST http://localhost:3011/api/campaigns \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -d @/tmp/indeed_jobs.json
```

## LinkedIn-Specific Configuration (If You Have Cookies)

### Required Tenant Schema Update

First, update the Tenant model to support LinkedIn cookies:

```typescript
// src/db/models/Tenant.ts
const tenantSchema = new Schema({
  // ... existing fields
  linkedinCookie: { type: String }, // Add this line
});
```

### Campaign with LinkedIn Auth

```json
{
  "name": "LinkedIn Hiring Posts with Auth",
  "source": "linkedin",
  "mode": "crawlee",
  "output": "database",
  "strategy": "playwright",
  "auth": "linkedin",
  "maxItems": 50,
  "seedUrls": [
    "https://www.linkedin.com/feed/"
  ],
  "selectors": {
    "postText": ".feed-shared-update-v2__description",
    "authorName": ".update-components-actor__name",
    "postDate": ".update-components-actor__sub-description"
  },
  "waitFor": ".feed-shared-update-v2"
}
```

## Best Practices

### 1. Respect Rate Limits
- LinkedIn: 1 request per 5-10 seconds
- HackerNews: 1 request per 1-2 seconds
- RemoteOK: 1 request per 2-3 seconds

### 2. Use Appropriate Strategies
- **Cheerio**: Fast, for static HTML (HackerNews, RemoteOK)
- **Playwright**: Slower, for JavaScript-heavy sites (LinkedIn, Indeed)
- **Firecrawl**: For sites with heavy anti-bot protection

### 3. Handle Failures Gracefully
- Set reasonable `maxItems` limits
- Monitor error rates
- Use fallback strategies

### 4. Legal Compliance
- Check Terms of Service
- Don't overload servers
- Respect robots.txt
- Store data responsibly

## Recommended Workflow

### For Testing (Use These First)
1. ✅ **HackerNews "Who is Hiring"** - Already working!
2. ✅ **RemoteOK** - Public API
3. ✅ **Company career pages** - Most are scrapable

### For Production (With Proper Setup)
1. **Firecrawl API** for LinkedIn
2. **Official APIs** when available (GitHub Jobs, etc.)
3. **RSS Feeds** for Indeed, Stack Overflow Jobs

## Next Steps

1. **Test the working alternatives above**
2. **If you need LinkedIn specifically:**
   - Set up Firecrawl API
   - Or manually provide LinkedIn cookies
3. **Consider using official APIs** when possible

## Example: Create a Working Job Board Scraper

Let's create a multi-source job scraper that works without authentication:

```bash
# 1. HackerNews (Already working)
# 2. RemoteOK
# 3. GitHub Jobs (if still available)
# 4. We Work Remotely

# All these sources are public and don't require authentication!
```

Would you like me to create a working example for any of these alternatives?
