# LinkedIn Local Runner - Comprehensive Implementation Plan

## 🎯 Goals
1. Fix post URL extraction (currently using profile URL as fallback)
2. Support seed URLs (direct LinkedIn profile/feed URLs)
3. Add plain language summary field
4. Create unified UI form with two modes: Search vs Seed URLs

---

## 🐛 Current Issues

### Issue 1: Incorrect Post URL
**Problem**: Post URLs are showing profile URLs instead of actual post URLs
```javascript
// Current (WRONG):
const postUrl = postLink?.href || authorProfile;  // Falls back to profile!

// Should be:
// https://www.linkedin.com/feed/update/urn:li:activity:7379929021188476928/
```

**Root Cause**: 
- `postLink` selector not finding the correct element
- Fallback to `authorProfile` causes wrong data

**Solution**:
Extract from `data-urn` attribute or construct from postId:
```javascript
// Priority 1: Get from data-urn attribute
const urnElement = el.querySelector('[data-urn*="activity"]');
const urn = urnElement?.getAttribute('data-urn');

// Priority 2: Construct from postId
if (postId) {
  postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`;
}

// Priority 3: Get from timestamp link
const timestampLink = el.querySelector('a[class*="timestamp"]');
postUrl = timestampLink?.href;
```

### Issue 2: No Seed URL Support
**Problem**: UI only supports search-based scraping (roles, period, location)

**Solution**: Add two modes:
1. **Search Mode**: Current behavior (search by keywords)
2. **Seed URL Mode**: Direct URLs to scrape (profile feeds, specific posts)

---

## 🎨 Frontend Form Design

### Mode Selection UI
```
┌─────────────────────────────────────────────┐
│ Create LinkedIn Campaign                    │
├─────────────────────────────────────────────┤
│                                             │
│ Campaign Name: [____________________]       │
│ Description:   [____________________]       │
│                                             │
│ Scraping Mode:                              │
│   ○ Search Mode                             │
│   ● Seed URL Mode                           │
│                                             │
│ [Seed URL Mode Fields Shown]                │
│ Seed URLs (one per line):                   │
│ ┌─────────────────────────────────────┐    │
│ │ https://www.linkedin.com/in/...     │    │
│ │ https://www.linkedin.com/in/...     │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ Summary (optional):                         │
│ [____________________]                      │
│                                             │
│ Max Leads: [25 ▼]                           │
│                                             │
│ [Cancel]  [Create Campaign]                 │
└─────────────────────────────────────────────┘
```

### Search Mode Fields
- Campaign Name
- Description
- **Roles** (required): e.g., "hiring, recruiting"
- **Period** (dropdown): past day | past week | past month
- **Location** (optional): e.g., "India", "United States"
- **Limit**: 25-200

### Seed URL Mode Fields
- Campaign Name
- Description
- **Seed URLs** (textarea, required): One URL per line
  - Support: Profile feeds, activity URLs, company pages
  - Example:
    ```
    https://www.linkedin.com/in/sundarpichai/recent-activity/all/
    https://www.linkedin.com/in/satyanadella/recent-activity/all/
    https://www.linkedin.com/feed/update/urn:li:activity:7379929021188476928/
    ```
- **Summary** (optional): Plain language description
  - Example: "Tech CEOs posting about hiring in Q4 2025"
- **Limit**: 25-200

---

## 🔧 Backend API Updates

### Updated Zod Schema (`src/routes/linkedin.ts`)
```typescript
const createLinkedInCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  mode: z.enum(['search', 'seedUrls']).default('search'),
  
  // Search mode fields (required if mode === 'search')
  roles: z.string().min(1).optional(),
  period: z.enum(['past day', 'past week', 'past month']).default('past week'),
  location: z.string().optional(),
  
  // Seed URL mode fields (required if mode === 'seedUrls')
  seedUrls: z.array(z.string().url()).optional(),
  summary: z.string().optional(),
  
  // Common fields
  limit: z.number().int().min(1).max(200).default(25),
}).refine(
  (data) => {
    if (data.mode === 'search') {
      return !!data.roles; // roles required in search mode
    }
    if (data.mode === 'seedUrls') {
      return data.seedUrls && data.seedUrls.length > 0; // seedUrls required
    }
    return true;
  },
  {
    message: "roles required for search mode, seedUrls required for seedUrls mode",
  }
);
```

### Campaign Creation
```typescript
const campaign = await CampaignModel.create({
  name: body.name,
  description: body.description,
  source: 'linkedin',
  tenantId: tenant._id.toString(),
  auth: 'linkedin',
  strategy: 'playwright',
  mode: 'crawlee',
  output: 'database',
  status: 'queued',
  maxItems: body.limit,
  seedUrls: body.seedUrls || [],
  stats: { totalLeads: 0, totalRequests: 0, errors: [] },
  query: {
    mode: body.mode,
    roles: body.roles,
    period: body.period,
    location: body.location,
    summary: body.summary,
    limit: body.limit,
  },
});
```

---

## 🤖 Local Runner Updates

### Unified Script Flow
```javascript
async function scrapeHiringPosts() {
  // Load campaign from DB
  const campaign = await CampaignModel.findById(campaignId);
  
  if (campaign.seedUrls && campaign.seedUrls.length > 0) {
    // SEED URL MODE
    await scrapeSeedUrls(campaign);
  } else {
    // SEARCH MODE
    await scrapeBySearch(campaign);
  }
}

async function scrapeSeedUrls(campaign) {
  for (const url of campaign.seedUrls) {
    if (url.includes('/recent-activity/')) {
      // Profile feed URL
      await scrapeProfileFeed(url, campaign);
    } else if (url.includes('/feed/update/')) {
      // Single post URL
      await scrapeSinglePost(url, campaign);
    } else if (url.includes('/company/')) {
      // Company page URL
      await scrapeCompanyPage(url, campaign);
    }
  }
}

async function scrapeBySearch(campaign) {
  // Current implementation
  // Build search URL from roles, period, location
}
```

### Fixed Post URL Extraction
```javascript
const postData = await post.evaluate(el => {
  // Get post ID first
  const urnElement = el.querySelector('[data-urn*="activity"]');
  const urn = urnElement?.getAttribute('data-urn');
  const postId = urn?.match(/urn:li:activity:(\d+)/)?.[1];
  
  // Construct proper post URL
  let postUrl = null;
  if (postId) {
    postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`;
  } else {
    // Fallback: try timestamp link
    const timestampLink = el.querySelector('a.update-components-actor__sub-description-link');
    postUrl = timestampLink?.href;
  }
  
  return {
    authorName,
    authorProfile,
    postUrl,  // Now always has correct format!
    postId,
    // ... other fields
  };
});
```

---

## 📊 Database Schema

### Campaign Model (Already Supports!)
```typescript
{
  name: string,
  description: string,
  seedUrls: string[],  // ✅ Already exists!
  query: {
    mode: 'search' | 'seedUrls',
    roles?: string,
    period?: string,
    location?: string,
    summary?: string,
    limit: number
  }
}
```

### LinkedIn Lead Model (No changes needed)
```typescript
{
  postUrl: string,  // Will now have correct format
  postId: string,
  authorProfile: string,
  // ... other fields
}
```

---

## 🚀 Implementation Steps

### Step 1: Fix Post URL Extraction ✅
**File**: `scripts/linkedin-hiring-runner.js` (line 320-340)
- Extract from `data-urn` attribute
- Construct proper URL format
- Remove fallback to `authorProfile`

### Step 2: Update Backend API ✅
**File**: `src/routes/linkedin.ts`
- Update Zod schema with mode and seedUrls
- Handle both search and seed URL modes
- Store seedUrls and summary in campaign

### Step 3: Update Frontend Form ✅
**File**: `src/pages/LinkedInCampaigns.tsx`
- Add mode radio buttons (Search / Seed URLs)
- Add seed URLs textarea
- Add summary input field
- Conditional validation
- Dynamic form fields based on mode

### Step 4: Enhance Local Runner ✅
**File**: `scripts/linkedin-hiring-runner.js`
- Add seed URL detection
- Implement `scrapeSeedUrls()` function
- Implement profile feed scraping
- Implement single post scraping
- Maintain backward compatibility

### Step 5: Test End-to-End ✅
- Create campaign with search mode
- Create campaign with seed URLs
- Verify post URLs are correct
- Verify data appears in table
- Test filtering and sorting

---

## 🎁 Benefits

1. **Correct Data**: Post URLs now link to actual posts, not profiles
2. **Flexibility**: Support both broad search and targeted seed URLs
3. **Context**: Summary field helps track campaign purpose
4. **Scalability**: Easy to add more seed URL types (companies, hashtags)
5. **User-Friendly**: Clear UI with mode selection

---

## 📝 Example Usage

### Search Mode
```
Name: "AI Engineers in India"
Roles: "AI engineer, machine learning, hiring"
Period: past week
Location: India
Limit: 50
```

### Seed URL Mode
```
Name: "Tech CEOs Hiring Posts"
Seed URLs:
  https://www.linkedin.com/in/sundarpichai/recent-activity/all/
  https://www.linkedin.com/in/satyanadella/recent-activity/all/
Summary: "Monitoring hiring posts from major tech company CEOs"
Limit: 100
```

---

## 🔮 Future Enhancements

- [ ] Support hashtag URLs (e.g., `#hiring`)
- [ ] Support company page URLs
- [ ] Batch import from CSV
- [ ] Schedule recurring scrapes
- [ ] Webhook notifications on new leads
- [ ] AI-powered lead scoring
