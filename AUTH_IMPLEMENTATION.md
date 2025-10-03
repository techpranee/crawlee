# Authentication & Token Management Implementation

## ✅ Completed Features

### 1. Authentication System
- **Login required**: All routes except `/auth` are now protected
- **Credential validation**: Login validates against backend API
- **Persistent sessions**: Credentials stored in localStorage
- **Auto-redirect**: Users redirected to login if not authenticated

### 2. Backend Settings API
- **GET /api/settings**: Fetch current tenant cookie settings
- **PATCH /api/settings**: Update LinkedIn, Apollo, and Zoom cookies
- **Security**: Cookie values masked in responses (shown as `***SET***`)

### 3. Settings UI
- **Dedicated Settings Page**: `/settings` route for token management
- **Three cookie inputs**: LinkedIn (li_at), Apollo, Zoom
- **Visual feedback**: Shows which cookies are currently set
- **Instructions**: Inline help text explaining how to get cookies
- **Security notices**: Warnings about cookie safety

### 4. Navigation Updates
- **User dropdown**: Shows username with Settings and Logout options
- **Protected UI**: Navigation only shows for authenticated users
- **Quick access**: Settings available from any page

## How to Use

### 1. Login
1. Visit `http://localhost:8080`
2. You'll be redirected to `/auth` (login page)
3. Enter credentials:
   - **Username**: `techpranee`
   - **Password**: `password`
4. Click "Sign In"

### 2. Set LinkedIn Cookie
1. Once logged in, click your username in the top-right
2. Select "Settings"
3. Open LinkedIn in another tab and log in
4. Press F12 → Application → Cookies → linkedin.com
5. Find `li_at` cookie and copy the value
6. Paste into "LinkedIn Cookie" field in Settings
7. Click "Save Tokens"

### 3. Create Authenticated Campaign
Now you can create LinkedIn campaigns with authentication:

```json
{
  "name": "LinkedIn Hiring Posts - Authenticated",
  "seedUrls": ["https://www.linkedin.com/feed/?keywords=hiring"],
  "strategy": "playwright",
  "auth": "linkedin",
  "selectors": {
    "postContainer": "div.feed-shared-update-v2",
    "postText": "div.feed-shared-update-v2__description"
  }
}
```

## Technical Implementation

### Frontend Changes
- `src/contexts/AuthContext.tsx` - Authentication state management
- `src/components/ProtectedRoute.tsx` - Route protection wrapper
- `src/pages/Auth.tsx` - Real API validation on login
- `src/pages/Settings.tsx` - Token management UI
- `src/lib/api.ts` - Read credentials from localStorage
- `src/components/Navigation.tsx` - User menu with logout
- `src/App.tsx` - Protected routes and Settings route

### Backend Changes
- `src/routes/settings.ts` - New settings API endpoints
- `src/app.ts` - Wire up settings router
- `src/db/models/Tenant.ts` - Added `linkedinCookie` field
- `src/services/crawl/crawlers.ts` - LinkedIn cookie support

## Security Features
- ✅ Authentication required for all API calls
- ✅ Credentials validated against backend
- ✅ Basic Auth over HTTPS (in production)
- ✅ Cookie values never exposed in API responses
- ✅ Secure localStorage storage
- ✅ Protected routes prevent unauthorized access

## Testing

### Test Authentication
```bash
# Should redirect to /auth when not logged in
open http://localhost:8080

# Login with valid credentials
# Username: techpranee
# Password: password
```

### Test Settings API
```bash
# Get current settings (requires auth)
curl -u techpranee:password \
  -H "X-Api-Key: mock-api-key" \
  http://localhost:3011/api/settings

# Update LinkedIn cookie
curl -X PATCH http://localhost:3011/api/settings \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{"linkedinCookie": "YOUR_COOKIE_VALUE"}'
```

### Test Protected Routes
```bash
# Visit protected route without login - should redirect to /auth
open http://localhost:8080/settings

# Login first, then visit - should show settings page
open http://localhost:8080/settings
```

## Next Steps

1. **Get your LinkedIn cookie**: Follow the guide in `LINKEDIN_SETUP.md`
2. **Test authenticated scraping**: Create a LinkedIn campaign with `"auth": "linkedin"`
3. **Add more platforms**: Apollo and Zoom cookies work the same way
4. **Monitor jobs**: Check the job details page to see scraping progress

## Notes

- The `X-Api-Key` header is currently set to `mock-api-key` for development
- In production, each tenant should have a unique API key
- Cookie values are stored in MongoDB and never logged
- Session persists across browser restarts (localStorage)
- Logout clears credentials and redirects to login
