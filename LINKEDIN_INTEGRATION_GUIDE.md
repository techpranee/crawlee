# LinkedIn Lead Scraper - API & Frontend Integration Guide

## Overview

The LinkedIn lead scraper has been fully integrated into the Crawlee server architecture with database persistence, job queue management, rate limit detection, and frontend-ready APIs.

## Architecture Changes

### 1. Database Models

#### LinkedInLead Model (`src/db/models/LinkedInLead.ts`)
Stores extracted LinkedIn hiring leads with full job details:

```typescript
{
  campaignId: ObjectId,
  tenantId: string,
  linkedInId: string,        // Unique LinkedIn post ID
  authorName: string,
  authorHeadline: string,
  authorProfile: string,
  company: string,
  jobTitles: string[],
  locations: string[],
  seniority: string,
  skills: string[],
  salaryRange: string,
  applicationLink: string,
  postText: string,
  postUrl: string,
  notes: string,
  status: 'new' | 'contacted' | 'qualified' | 'archived',
  tags: string[],
  collectedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ tenantId: 1, campaignId: 1, createdAt: -1 }` - Efficient campaign queries
- `{ tenantId: 1, company: 1 }` - Company-based filtering
- `{ tenantId: 1, status: 1 }` - Status filtering
- `{ linkedInId: 1 }` - Duplicate prevention (unique, sparse)

### 2. Job Handler

#### LinkedIn Scraping Job (`src/jobs/handlers/linkedInScraping.ts`)

**Features:**
- ✅ **Persistent browser session** - Uses Chrome profile for login persistence
- ✅ **AI-powered planning** - Generates search queries using Ollama
- ✅ **AI extraction** - Parses post text into structured JSON
- ✅ **Real-time database storage** - Saves leads immediately as they're found
- ✅ **Rate limit detection** - Monitors multiple indicators
- ✅ **Human behavior mimicking** - Random delays, mouse movements, reading pauses
- ✅ **Graceful shutdown** - Saves progress on rate limit detection
- ✅ **Progress tracking** - Updates campaign stats in real-time

**Rate Limit Detection:**
```typescript
- URL patterns: /authwall, /checkpoint
- Page text: "You've been viewing", "Too many requests", "Unusual activity"
- Stops immediately when detected
- Keeps browser open for manual intervention
```

**Human Behavior:**
```typescript
- Scroll delays: 2-3.5s normal, 30-50s every 5 scrolls
- Random mouse movements during scrolling
- Query intervals: 18-30s between searches
- Scroll amounts: 500-1300px randomized
- Multiple fallback selectors for robust extraction
```

### 3. API Endpoints

All endpoints are under `/api/linkedin` with tenant authentication.

#### POST `/api/linkedin/campaigns`
Create a new LinkedIn scraping campaign.

**Request:**
```json
{
  "name": "Frontend Developers - October 2025",
  "description": "Looking for React/Node developers",
  "roles": "frontend developer, react developer, node.js engineer",
  "period": "past week",  // "past day" | "past week" | "past month"
  "limit": 25             // Max leads to collect (1-100)
}
```

**Response:**
```json
{
  "campaign": {
    "id": "65f4a8b2c3d4e5f6a7b8c9d0",
    "name": "Frontend Developers - October 2025",
    "description": "Looking for React/Node developers",
    "source": "linkedin",
    "status": "queued",
    "createdAt": "2025-10-03T12:00:00.000Z"
  },
  "task": {
    "id": "65f4a8b2c3d4e5f6a7b8c9d1",
    "status": "queued"
  }
}
```

#### GET `/api/linkedin/campaigns`
List all LinkedIn campaigns with pagination.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)

**Response:**
```json
{
  "campaigns": [
    {
      "id": "65f4a8b2c3d4e5f6a7b8c9d0",
      "name": "Frontend Developers - October 2025",
      "description": "Looking for React/Node developers",
      "status": "running",  // queued | running | paused | done | failed
      "progress": 45,
      "stats": {
        "totalLeads": 12,
        "startedAt": "2025-10-03T12:05:00.000Z",
        "finishedAt": null,
        "rateLimited": false
      },
      "query": {
        "roles": "frontend developer, react developer",
        "period": "past week",
        "limit": 25
      },
      "createdAt": "2025-10-03T12:00:00.000Z",
      "updatedAt": "2025-10-03T12:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

#### GET `/api/linkedin/campaigns/:id`
Get campaign details with tasks and lead count.

**Response:**
```json
{
  "campaign": {
    "id": "65f4a8b2c3d4e5f6a7b8c9d0",
    "name": "Frontend Developers - October 2025",
    "status": "done",
    "progress": 100,
    "stats": {
      "totalLeads": 23,
      "startedAt": "2025-10-03T12:05:00.000Z",
      "finishedAt": "2025-10-03T12:35:00.000Z",
      "rateLimited": false
    },
    "query": { ... },
    "createdAt": "2025-10-03T12:00:00.000Z"
  },
  "tasks": [
    {
      "id": "65f4a8b2c3d4e5f6a7b8c9d1",
      "type": "scrape",
      "status": "done",
      "startedAt": "2025-10-03T12:05:00.000Z",
      "finishedAt": "2025-10-03T12:35:00.000Z",
      "stats": { "totalLeads": 23 }
    }
  ],
  "leadCount": 23
}
```

#### GET `/api/linkedin/campaigns/:id/leads`
Get leads for a campaign with pagination.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)

**Response:**
```json
{
  "leads": [
    {
      "id": "65f4a8b2c3d4e5f6a7b8c9d2",
      "linkedInId": "urn:li:activity:7379756855826460672",
      "authorName": "Anshika Mathur",
      "authorHeadline": "Hiring Specialist | Leadership, IT Talent",
      "authorProfile": "https://www.linkedin.com/in/anshika-mathur-xxx",
      "company": "Cloudkeeper",
      "jobTitles": ["JavaScript Frontend Developer"],
      "locations": ["Noida"],
      "seniority": "mid",
      "skills": ["ReactJS", "JavaScript", "HTML5", "CSS3", "OAuth2", "JWT"],
      "salaryRange": "",
      "applicationLink": "https://lnkd.in/gNctuyPC",
      "notes": "Frontend developer with 3-6 years of experience",
      "postUrl": "https://www.linkedin.com/posts/...",
      "status": "new",
      "tags": [],
      "collectedAt": "2025-10-03T16:34:05.838Z",
      "createdAt": "2025-10-03T16:34:06.123Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 23,
    "pages": 2
  }
}
```

#### GET `/api/linkedin/campaigns/:id/export?format=csv|json`
Export campaign leads as CSV or JSON file.

**Query Parameters:**
- `format`: `csv` (default) or `json`

**Response:**
- Content-Type: `text/csv` or `application/json`
- Content-Disposition: `attachment; filename="linkedin-leads-{id}-{timestamp}.{format}"`

**CSV Columns:**
```
author_name, author_headline, author_profile, company, job_titles, 
locations, seniority, skills, salary_range, application_link, 
notes, post_url, status, collected_at
```

#### PATCH `/api/linkedin/campaigns/:id`
Update campaign status (pause/stop).

**Request:**
```json
{
  "status": "paused"  // or "stopped"
}
```

#### DELETE `/api/linkedin/campaigns/:id`
Delete campaign and all its leads.

**Response:** `204 No Content`

## Frontend Integration

### Required Components

#### 1. LinkedIn Campaigns List Page

**Location:** `src/pages/LinkedInCampaigns.tsx`

**Features:**
- List all campaigns with status badges
- Show progress bars for running campaigns
- Create new campaign button
- Quick actions: View details, Export, Delete

**Example UI:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Frontend Developers - October 2025</CardTitle>
    <Badge status="running">Running</Badge>
  </CardHeader>
  <CardContent>
    <Progress value={45} />
    <p>12 leads collected | Started 15 minutes ago</p>
  </CardContent>
  <CardFooter>
    <Button onClick={() => viewDetails(campaign.id)}>View Details</Button>
    <Button onClick={() => exportLeads(campaign.id)}>Export CSV</Button>
  </CardFooter>
</Card>
```

#### 2. Create Campaign Dialog

**Component:** `CreateLinkedInCampaignDialog.tsx`

```tsx
<Dialog>
  <DialogContent>
    <Form>
      <Input label="Campaign Name" name="name" required />
      <Textarea label="Description" name="description" />
      <Input label="Job Roles" name="roles" 
             placeholder="e.g., frontend developer, react, node.js"
             required />
      <Select label="Time Period" name="period">
        <option value="past day">Past 24 Hours</option>
        <option value="past week">Past Week</option>
        <option value="past month">Past Month</option>
      </Select>
      <Input type="number" label="Max Leads" name="limit" 
             min="1" max="100" default="25" />
      <Button type="submit">Start Campaign</Button>
    </Form>
  </DialogContent>
</Dialog>
```

#### 3. Campaign Details Page

**Location:** `src/pages/LinkedInCampaignDetails.tsx`

**Sections:**
- Campaign overview (name, status, stats)
- Tasks timeline
- Leads table with filtering
- Export options

**Leads Table Columns:**
- Author Name (with LinkedIn profile link)
- Company
- Job Titles (chips/tags)
- Locations
- Skills (expandable)
- Application Link (button)
- Actions (Mark contacted, Archive)

#### 4. Export Functionality

```typescript
const exportLeads = async (campaignId: string, format: 'csv' | 'json') => {
  const response = await fetch(
    `/api/linkedin/campaigns/${campaignId}/export?format=${format}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkedin-leads-${campaignId}-${Date.now()}.${format}`;
  a.click();
};
```

### API Client Integration

Add to `src/lib/api.ts`:

```typescript
export const linkedInAPI = {
  // Create campaign
  createCampaign: async (data: CreateLinkedInCampaignRequest) => {
    return api.post('/linkedin/campaigns', data);
  },

  // List campaigns
  listCampaigns: async (page = 1, limit = 20) => {
    return api.get(`/linkedin/campaigns?page=${page}&limit=${limit}`);
  },

  // Get campaign details
  getCampaign: async (id: string) => {
    return api.get(`/linkedin/campaigns/${id}`);
  },

  // Get leads
  getLeads: async (campaignId: string, page = 1, limit = 20) => {
    return api.get(`/linkedin/campaigns/${campaignId}/leads?page=${page}&limit=${limit}`);
  },

  // Export leads
  exportLeads: async (campaignId: string, format: 'csv' | 'json' = 'csv') => {
    return api.get(`/linkedin/campaigns/${campaignId}/export?format=${format}`, {
      responseType: 'blob',
    });
  },

  // Pause campaign
  pauseCampaign: async (id: string) => {
    return api.patch(`/linkedin/campaigns/${id}`, { status: 'paused' });
  },

  // Delete campaign
  deleteCampaign: async (id: string) => {
    return api.delete(`/linkedin/campaigns/${id}`);
  },
};
```

## Testing

### 1. Start the Server

```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
npm run dev
```

### 2. Create a Campaign via API

```bash
curl -X POST http://localhost:3011/api/linkedin/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "roles": "frontend developer",
    "period": "past week",
    "limit": 5
  }'
```

### 3. Monitor Progress

```bash
# Get campaign details
curl http://localhost:3011/api/linkedin/campaigns/{campaignId}

# Get leads
curl http://localhost:3011/api/linkedin/campaigns/{campaignId}/leads
```

### 4. Export Results

```bash
# CSV
curl http://localhost:3011/api/linkedin/campaigns/{campaignId}/export?format=csv -O

# JSON
curl http://localhost:3011/api/linkedin/campaigns/{campaignId}/export?format=json -O
```

## Implementation Checklist

### Backend ✅
- [x] LinkedInLead model created
- [x] LinkedIn scraping job handler implemented
- [x] Rate limit detection added
- [x] Human behavior mimicking enhanced
- [x] API endpoints created
- [x] Routes registered in app.ts
- [x] Job registered in agenda.ts

### Frontend 🚧
- [ ] Create LinkedInCampaigns list page
- [ ] Create campaign creation dialog
- [ ] Create campaign details page
- [ ] Implement export functionality
- [ ] Add navigation menu item
- [ ] Add API client methods
- [ ] Test full workflow

## Environment Variables Required

Add to `.env`:
```bash
OLLAMA_URL=https://ollama2.havenify.ai/
OLLAMA_MODEL=deepseek-r1:14b
```

## Known Limitations

1. **Manual Login Required** - First run needs human to log into LinkedIn in Chrome
2. **Rate Limits** - LinkedIn may throttle after 50-100 requests
3. **UI Changes** - LinkedIn's DOM selectors may change over time
4. **Concurrency** - Only 1 LinkedIn job at a time to avoid detection

## Next Steps

1. Test backend endpoints with Postman/curl
2. Implement frontend components in insight-scrape-flow
3. Add real-time progress updates via WebSocket (optional)
4. Add email notifications for completed campaigns
5. Implement lead status workflow (contacted, qualified, etc.)

## Support

For issues or questions:
- Check logs: `npm run dev` output
- MongoDB: Inspect `LinkedInLead` collection
- Agenda UI: Check job status in `jobs` collection
