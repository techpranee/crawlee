# LinkedIn Browser Authentication - User Guide

## 🎉 New Feature: Automatic Cookie Capture!

Instead of manually copying cookies from DevTools, you can now **log in to LinkedIn directly in our browser** and we'll capture the authentication automatically!

## How It Works

1. **Click "Login with Browser" button** in Settings
2. **Chrome/Chromium window opens** automatically
3. **Log in to LinkedIn** normally (email + password)
4. **Cookies captured automatically** once you reach your feed
5. **Browser closes** automatically - done! ✅

## Step-by-Step Guide

### Method 1: Browser Login (Recommended) ⭐

1. **Open Settings**
   - Visit: `http://localhost:8080/settings`
   - Or click your username → Settings

2. **Click "Login with Browser"**
   - Find the LinkedIn Cookie section
   - Click the blue "Login with Browser (Recommended)" button
   - A Chrome window will open

3. **Log In to LinkedIn**
   - Enter your LinkedIn email and password
   - Complete any 2FA/verification if prompted
   - Wait for the feed to load

4. **Automatic Capture**
   - Once you see your LinkedIn feed, cookies are captured
   - Success message appears in the browser
   - Browser closes automatically after 3 seconds

5. **Verify**
   - Back in Settings, you should see "✓ Currently set" next to LinkedIn Cookie
   - You're ready to scrape!

### Method 2: Manual Cookie Entry (Alternative)

If the browser method doesn't work:

1. Open LinkedIn in your regular browser
2. Log in normally
3. Press F12 → Application tab → Cookies → linkedin.com
4. Find `li_at` cookie and copy its value
5. Paste into the text area in Settings
6. Click "Save Tokens"

## Testing Your Authentication

Once you've captured your LinkedIn credentials, test with a simple campaign:

```bash
curl -X POST http://localhost:3011/api/campaigns \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "name": "LinkedIn Auth Test",
    "source": "linkedin",
    "seedUrls": ["https://www.linkedin.com/feed/"],
    "strategy": "playwright",
    "auth": "linkedin",
    "selectors": {
      "pageTitle": "title"
    },
    "maxItems": 1
  }' | jq '{id, status}'
```

Then check the result - if authenticated correctly, you should see data from your LinkedIn feed instead of a login page.

## Troubleshooting

### Browser doesn't open
- **Check:** Is Chromium/Chrome installed?
- **Fix:** Install Chrome from https://www.google.com/chrome/

### Browser opens but nothing happens
- **Wait:** The endpoint waits up to 5 minutes for you to log in
- **Manual close:** If you close the browser early, cookies won't be captured

### Cookies not captured after login
- **Check:** Make sure you actually reach the LinkedIn feed (URL contains `/feed/`)
- **Try again:** Close the browser and click "Login with Browser" again

### "Currently set" but scraping fails
- **Cookie expired:** Cookies can expire - just re-authenticate
- **Try fresh login:** Use the browser method to get new cookies

## Technical Details

### Backend Endpoint
- **POST `/api/auth/linkedin/capture`** - Launches browser for login
- **GET `/api/auth/linkedin/status`** - Check if auth is configured

### What Gets Captured
- Primary cookie: `li_at` (LinkedIn authentication token)
- Stored securely in MongoDB
- Never logged or exposed in API responses

### Browser Session
- Launches non-headless Chrome (visible window)
- Uses real Chrome user agent
- Waits for URL pattern `**/feed/**` to confirm login
- Automatically closes after capture or 5-minute timeout

### Security
- Browser runs locally on your machine
- You log in directly to LinkedIn (not through our app)
- Credentials never pass through our servers
- Only the authentication cookie is captured and stored

## Next Steps

1. **Authenticate** using the browser method
2. **Create a test campaign** (see example above)
3. **Monitor progress** at `http://localhost:8080/job/{campaign_id}`
4. **View scraped data** in the job details page

## API Usage (For Developers)

### Trigger Browser Capture
```bash
curl -X POST http://localhost:3011/api/auth/linkedin/capture \
  -u techpranee:password \
  -H "X-Api-Key: mock-api-key"
```

### Check Auth Status
```bash
curl -u techpranee:password \
  -H "X-Api-Key: mock-api-key" \
  http://localhost:3011/api/auth/linkedin/status
```

Response:
```json
{
  "configured": true,
  "hasToken": true
}
```

## Benefits of Browser Method

✅ **No DevTools needed** - No copying/pasting cookies
✅ **Always fresh** - Gets current valid authentication  
✅ **Handles 2FA** - Works with two-factor authentication
✅ **More reliable** - Gets exactly what LinkedIn expects
✅ **User-friendly** - Just log in normally

---

**Ready to scrape LinkedIn!** 🚀 Click "Login with Browser" in Settings to get started.
