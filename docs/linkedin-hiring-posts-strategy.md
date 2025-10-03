# LinkedIn Hiring Posts Scraping Strategy

## Strategy ID
**Primary Strategy**: `68df8a3af57ad192f3574cd0`  
**Name**: LinkedIn Hiring Posts - Comprehensive

## Objective
Scrape LinkedIn posts within a specific timeframe about hiring opportunities, extracting:
- Post URL
- Author profile URL
- Author name and headline
- Company name (if mentioned)
- Job title/position
- Post content/description
- Engagement metrics (reactions, comments)
- Post timestamp

## Challenge: LinkedIn's Dynamic Content

LinkedIn uses heavy JavaScript rendering and anti-scraping measures. The page structure requires:
1. **Playwright** crawler (not Cheerio) - JavaScript execution needed
2. **Wait for dynamic content** - Content loads after page load
3. **Scroll behavior** - Some content loads on scroll
4. **Authentication** - LinkedIn cookies required (li_at, JSESSIONID)

## Recommended Approach

### Option 1: LinkedIn Feed Scraping (Recommended)
Instead of scraping individual post URLs, scrape the LinkedIn feed with search filters:

**Base URL Pattern**:
```
https://www.linkedin.com/search/results/content/?keywords=hiring&datePosted=past-week
```

**Query Parameters**:
- `keywords=hiring` - Search for hiring-related posts
- `datePosted=past-week|past-month` - Time filter
- `origin=FACETED_SEARCH` - Search type

**Selectors for Feed Items**:
```json
{
  "selectors": [
    {
      "selector": ".feed-shared-update-v2",
      "field": "post_container",
      "type": "html",
      "multiple": true
    },
    {
      "selector": ".update-components-actor a[href*=\"/in/\"]",
      "field": "author_profile_url",
      "type": "href"
    },
    {
      "selector": ".update-components-actor__title span",
      "field": "author_name",
      "type": "text"
    },
    {
      "selector": ".update-components-actor__description",
      "field": "author_headline",
      "type": "text"
    },
    {
      "selector": ".feed-shared-update-v2__description",
      "field": "post_text",
      "type": "text"
    },
    {
      "selector": ".feed-shared-social-action-bar__reaction-count",
      "field": "reactions",
      "type": "text"
    },
    {
      "selector": ".feed-shared-social-action-bar__comment-count",
      "field": "comments",
      "type": "text"
    },
    {
      "selector": ".feed-shared-actor__sub-description time",
      "field": "post_time",
      "type": "text"
    }
  ]
}
```

### Option 2: Custom Crawler with Wait Logic

Create a custom crawler that:
1. Navigates to LinkedIn search results
2. Waits for content to load (`waitForSelector`)
3. Scrolls to load more posts
4. Extracts data from each post card
5. Filters for hiring keywords
6. Follows links to individual posts if needed

## Implementation Steps

### Step 1: Update Strategy with Crawlee Custom Logic

Modify `/crawlee/src/services/crawl/crawlers.ts` to add LinkedIn-specific waiting:

```typescript
// For LinkedIn posts, wait for dynamic content
if (platform === 'linkedin' && url.includes('posts')) {
  await page.waitForSelector('.feed-shared-update-v2', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000); // Wait for JS rendering
}
```

### Step 2: Create Strategy via UI

1. Go to http://localhost:8080/strategies/builder
2. Fill in:
   - **Name**: LinkedIn Hiring Posts Scraper
   - **Platform**: LinkedIn
   - **URL Pattern**: `^https://www\\.linkedin\\.com/(posts|search/results/content)/.*`
   - **Auth Type**: LinkedIn
   - **Crawler Strategy**: Playwright
   
3. Add selectors (see below)
4. Add tags: `hiring`, `recruitment`, `jobs`
5. Test with sample URL
6. Save strategy

### Step 3: Recommended Selectors

Based on LinkedIn's current structure (as of October 2025):

```json
{
  "selectors": [
    {
      "selector": "a[href*=\"/posts/\"]",
      "field": "post_url",
      "type": "href",
      "required": false,
      "transform": "url.split('?')[0]"
    },
    {
      "selector": ".update-components-actor a[href*=\"/in/\"]",
      "field": "author_profile_url",
      "type": "href",
      "required": true
    },
    {
      "selector": ".update-components-actor__name span:first-child",
      "field": "author_name",
      "type": "text",
      "required": true
    },
    {
      "selector": ".update-components-actor__description",
      "field": "author_headline",
      "type": "text"
    },
    {
      "selector": ".feed-shared-update-v2__description .break-words",
      "field": "post_text",
      "type": "text",
      "required": true
    },
    {
      "selector": "a[href*=\"/company/\"]",
      "field": "company_url",
      "type": "href"
    },
    {
      "selector": "a[href*=\"/company/\"] span",
      "field": "company_name",
      "type": "text"
    },
    {
      "selector": ".feed-shared-actor__sub-description time",
      "field": "post_age",
      "type": "text"
    },
    {
      "selector": ".feed-shared-social-action-bar__reaction-count",
      "field": "reactions_count",
      "type": "text"
    },
    {
      "selector": ".feed-shared-social-action-bar__comment-count",
      "field": "comments_count",
      "type": "text"
    }
  ]
}
```

## Extracting Job Title and Company

Since job titles are often in the post text, you'll need NLP/regex post-processing:

### Validation Rules for Filtering

```json
{
  "validationRules": [
    {
      "field": "post_text",
      "type": "regex",
      "value": "(hiring|job opening|position|role|opportunity|looking for|join our team|we're hiring)",
      "message": "Must contain hiring keywords"
    },
    {
      "field": "post_text",
      "type": "length",
      "value": 20,
      "message": "Post text must be at least 20 characters"
    }
  ]
}
```

### Post-Processing for Job Extraction

Add to Campaign config or use NLP service:

```javascript
// Extract job title patterns
const jobTitlePatterns = [
  /hiring.*?(engineer|developer|manager|designer|analyst|director)/i,
  /looking for.*?(engineer|developer|manager|designer|analyst|director)/i,
  /seeking.*?(engineer|developer|manager|designer|analyst|director)/i,
  /(engineer|developer|manager|designer|analyst|director).*?position/i
];

// Extract company patterns
const companyPatterns = [
  /@([A-Z][a-zA-Z0-9]+)/g, // Mentions like @CompanyName
  /at ([A-Z][a-zA-Z0-9 ]+)/,  // "at CompanyName"
  /join ([A-Z][a-zA-Z0-9 ]+)/i  // "join CompanyName"
];
```

## Campaign Configuration Example

```json
{
  "name": "LinkedIn Hiring Posts - Tech Roles",
  "strategyId": "68df8a3af57ad192f3574cd0",
  "startUrls": [
    "https://www.linkedin.com/search/results/content/?keywords=hiring%20software%20engineer&datePosted=past-week"
  ],
  "maxPages": 50,
  "config": {
    "searchKeywords": ["hiring", "software engineer", "developer"],
    "dateFilter": "past-week",
    "scrollDepth": 10,
    "waitBetweenScrolls": 2000
  }
}
```

## Current Strategy Status

**Strategy ID**: `68df8a3af57ad192f3574cd0`

**Issue**: Selectors not extracting data because:
1. LinkedIn requires JavaScript execution time
2. Content may be in shadow DOM or dynamically loaded
3. Need to add wait logic in crawler

**Next Steps**:
1. ✅ Strategy created with comprehensive selectors
2. ⏳ Need to add wait logic in crawler (modify `crawlers.ts`)
3. ⏳ Test with updated crawler on sample post
4. ⏳ Refine selectors based on actual HTML structure
5. ⏳ Add job title/company extraction logic

## Testing Commands

### Test Current Strategy
```bash
curl -X POST http://localhost:3011/api/strategies/68df8a3af57ad192f3574cd0/test \
  -u techpranee:password \
  -H "X-Api-Key: mock-api-key" \
  -d '{"testUrl": "https://www.linkedin.com/posts/pam-legacygroup_hiring-activity-7379773519699726336-dGTQ"}' | jq .
```

### Test with Wait Logic (after crawler update)
```bash
curl -X POST http://localhost:3011/api/strategies/test-draft \
  -u techpranee:password \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "testUrl": "https://www.linkedin.com/posts/USERNAME_hiring-activity-ID",
    "strategy": {...}
  }' | jq .
```

## Alternative: Use Firecrawl API

If LinkedIn scraping proves difficult, use the Firecrawl API:

```bash
curl -X POST https://firecrawlapi.techpranee.com/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/posts/...",
    "formats": ["markdown", "html"]
  }'
```

Then parse the markdown for hiring information.

## Summary

✅ **Strategy Created**: ID `68df8a3af57ad192f3574cd0` with 11 selectors
✅ **Fields Covered**: Post URL, author info, company, content, engagement
⏳ **Needs Enhancement**: Wait logic for dynamic content loading
💡 **Recommendation**: Use LinkedIn feed search URLs instead of individual posts for bulk scraping
