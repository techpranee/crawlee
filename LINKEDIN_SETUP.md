# LinkedIn Cookie Authentication Setup

The code is now ready to support LinkedIn cookie authentication! Follow these steps to enable LinkedIn scraping.

## Step 1: Get Your LinkedIn Cookie

1. **Open LinkedIn in your browser** and make sure you're logged in
2. **Open DevTools** (F12 or Right-click → Inspect)
3. **Go to the Application/Storage tab**
4. **Navigate to Cookies** → `https://www.linkedin.com`
5. **Find the `li_at` cookie** in the list
6. **Copy the Value** (it will be a long string like `AQEDATXNs9YEL7VwAAABjKm...`)

## Step 2: Store the Cookie in MongoDB

Run this command in your terminal to add the LinkedIn cookie to your tenant:

```bash
mongosh crawlee --eval 'db.tenants.updateOne(
  {basicAuthUser: "techpranee"}, 
  {$set: {linkedinCookie: "YOUR_COOKIE_VALUE_HERE"}}
)'
```

**Replace `YOUR_COOKIE_VALUE_HERE` with the actual `li_at` cookie value you copied.**

## Step 3: Create a LinkedIn Campaign

Now create a campaign JSON file to scrape LinkedIn posts about hiring:

```json
{
  "name": "LinkedIn Hiring Posts - Authenticated",
  "description": "Scrape recent hiring posts from LinkedIn feed with authentication",
  "seedUrls": [
    "https://www.linkedin.com/feed/?keywords=hiring"
  ],
  "strategy": "playwright",
  "auth": "linkedin",
  "selectors": {
    "postContainer": "div.feed-shared-update-v2",
    "authorName": "span.feed-shared-actor__name",
    "postText": "div.feed-shared-update-v2__description",
    "postLink": "a.app-aware-link",
    "timestamp": "span.feed-shared-actor__sub-description"
  },
  "maxDepth": 1,
  "maxRequests": 20,
  "waitFor": "div.feed-shared-update-v2"
}
```

Save as `linkedin-hiring-auth.json` and create the campaign:

```bash
curl -X POST http://localhost:3011/api/campaigns \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -d @linkedin-hiring-auth.json
```

## Step 4: Monitor the Job

Get the campaign ID from the response and check it in the UI:
```
http://localhost:8080/job/YOUR_CAMPAIGN_ID
```

## Alternative: Use LinkedIn Search URLs

For more targeted results, you can use LinkedIn's search URLs:

```json
{
  "seedUrls": [
    "https://www.linkedin.com/search/results/content/?keywords=hiring&datePosted=%22past-week%22&sortBy=%22date_posted%22"
  ]
}
```

## Troubleshooting

### Cookie Expired
If scraping fails with login redirects:
1. Get a fresh `li_at` cookie from your browser
2. Update MongoDB with the new value
3. Retry the campaign

### Rate Limiting
LinkedIn has rate limits. If you hit them:
- Reduce `maxRequests` to 10-15
- Add delays: `"waitFor": "div.feed-shared-update-v2"`
- Spread out campaigns over time

### Better Selectors
LinkedIn's HTML structure changes frequently. To find current selectors:
1. Visit LinkedIn in your browser
2. Right-click a post → Inspect
3. Find stable class names (avoid auto-generated IDs)
4. Update the `selectors` in your campaign JSON

## How It Works

1. **Authentication**: The `"auth": "linkedin"` field tells the crawler to use your stored LinkedIn cookie
2. **Cookie Injection**: The crawler adds `Cookie: li_at=YOUR_VALUE` to all requests
3. **Session Maintained**: LinkedIn sees the requests as coming from your logged-in session
4. **Data Extraction**: Playwright renders the page and extracts data using your selectors

## Security Notes

⚠️ **Important**:
- Your `li_at` cookie grants access to your LinkedIn account
- Store it securely in MongoDB (not in code or logs)
- Rotate it regularly for security
- Don't share campaigns with `"auth": "linkedin"` publicly (they won't work for others anyway)

## Next Steps

Once LinkedIn scraping works, you can:
1. Create campaigns for specific LinkedIn searches
2. Scrape company pages: `https://www.linkedin.com/company/COMPANY_NAME/posts/`
3. Monitor hashtags: `https://www.linkedin.com/feed/hashtag/hiring/`
4. Extract job postings: `https://www.linkedin.com/jobs/search/?keywords=software%20engineer`

---

**Your LinkedIn cookie authentication is now set up!** The code changes are complete - you just need to add your cookie to the database and start scraping.
