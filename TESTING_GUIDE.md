# Testing Guide - Authentication & Settings

## ✅ Backend Status
- Server: **RUNNING** on http://localhost:3011
- Settings API: **WORKING** ✓
- LinkedIn cookie: **STORED** in database ✓

## ✅ Frontend Status  
- UI: **RUNNING** on http://localhost:8080
- Auth system: **READY** ✓
- Settings page: **READY** ✓

## Test Steps

### 1. Test Authentication Flow

```bash
# Open the app (should redirect to login)
open http://localhost:8080
```

**Expected behavior:**
- You'll be automatically redirected to `/auth` (login page)
- You'll see the ScrapeMaster logo and login form

**Login with:**
- Username: `techpranee`
- Password: `password`

**After successful login:**
- You'll be redirected to the home page (jobs dashboard)
- Navigation bar will show your username with a dropdown menu

### 2. Test Settings Page

**Access Settings:**
1. Click on your username (`techpranee`) in the top-right corner
2. Select "Settings" from the dropdown menu
3. You should see the Settings page with three token input fields

**Verify Current State:**
- LinkedIn Cookie: Should show "✓ Currently set" (we just saved it via API)
- Apollo Cookie: Should be empty
- Zoom Cookie: Should be empty

**Test Adding Apollo Cookie:**
1. Paste any test value in the "Apollo Cookie" field
2. Click "Save Tokens"
3. You should see a success toast: "Settings saved"
4. The Apollo field should now show "✓ Currently set"

### 3. Test Logout

1. Click your username in the top-right
2. Click "Logout"
3. You should be redirected back to `/auth` (login page)
4. Try to manually visit `http://localhost:8080/settings`
5. You should be redirected to login (route protection working)

### 4. Test API Endpoints

**Get current settings:**
```bash
curl -X GET http://localhost:3011/api/settings \
  -u techpranee:password \
  -H "X-Api-Key: mock-api-key" | jq .
```

**Expected response:**
```json
{
  "name": "Development Tenant",
  "linkedinCookie": "***SET***",
  "apolloCookie": null,
  "zoomCookie": null
}
```

**Update settings:**
```bash
curl -X PATCH http://localhost:3011/api/settings \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "apolloCookie": "test_apollo_cookie_value",
    "zoomCookie": "test_zoom_cookie_value"
  }' | jq .
```

**Expected response:**
```json
{
  "name": "Development Tenant",
  "linkedinCookie": "***SET***",
  "apolloCookie": "***SET***",
  "zoomCookie": "***SET***"
}
```

### 5. Test Protected Routes

**Without login (should redirect):**
```bash
# These should all redirect to /auth
open http://localhost:8080/
open http://localhost:8080/settings
open http://localhost:8080/job/create
```

**With login (should work):**
1. Login first at `http://localhost:8080/auth`
2. Then navigate to any protected route
3. They should all work without redirecting

### 6. Test LinkedIn Authenticated Scraping

Now that the LinkedIn cookie is set, create an authenticated campaign:

**Via UI:**
1. Click "Create New Job" 
2. Use LinkedIn strategy or custom settings
3. Make sure to include `"auth": "linkedin"` in the configuration

**Via API:**
```bash
curl -X POST http://localhost:3011/api/campaigns \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -d '{
    "name": "LinkedIn Hiring Posts - Authenticated",
    "seedUrls": ["https://www.linkedin.com/feed/?keywords=hiring"],
    "strategy": "playwright",
    "auth": "linkedin",
    "selectors": {
      "postContainer": "div.feed-shared-update-v2",
      "postText": "div.feed-shared-update-v2__description"
    },
    "maxDepth": 1,
    "maxRequests": 10
  }' | jq .
```

## ✅ Verified Working

- ✅ Backend settings API (GET /api/settings)
- ✅ Backend settings API (PATCH /api/settings)
- ✅ LinkedIn cookie stored in database
- ✅ Cookie values masked in responses (security)
- ✅ Frontend running on port 8080
- ✅ Backend running on port 3011

## Next: Use the UI!

Visit **http://localhost:8080** and test the complete authentication flow in your browser!
