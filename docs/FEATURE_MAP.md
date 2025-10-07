# 🎯 LinkedIn Scraper - Visual Feature Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LINKEDIN SCRAPER SYSTEM                          │
│                          ✅ 100% COMPLETE                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  WEB UI (React) - http://localhost:8081                          │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  ┌─────────────────────────────────────────────────────────┐     │  │
│  │  │  Campaign Creation Form                                  │     │  │
│  │  │  ────────────────────────                               │     │  │
│  │  │  Campaign Name: [________________]                       │     │  │
│  │  │  Description:   [________________]                       │     │  │
│  │  │                                                          │     │  │
│  │  │  Mode:  ● Search Mode    ○ Seed URL Mode               │     │  │
│  │  │                                                          │     │  │
│  │  │  ┌─────────────────┐    ┌──────────────────┐           │     │  │
│  │  │  │ SEARCH MODE     │    │ SEED URL MODE    │           │     │  │
│  │  │  ├─────────────────┤    ├──────────────────┤           │     │  │
│  │  │  │ Roles: *        │    │ Seed URLs: *     │           │     │  │
│  │  │  │ Period: ▼       │    │ ┌──────────────┐ │           │     │  │
│  │  │  │ Location:       │    │ │ url1         │ │           │     │  │
│  │  │  │ Max Leads: 50   │    │ │ url2         │ │           │     │  │
│  │  │  │                 │    │ │ url3         │ │           │     │  │
│  │  │  │ [Create]        │    │ └──────────────┘ │           │     │  │
│  │  │  └─────────────────┘    │ Summary:         │           │     │  │
│  │  │                         │ Max Leads: 30    │           │     │  │
│  │  │                         │ [Create]         │           │     │  │
│  │  │                         └──────────────────┘           │     │  │
│  │  └─────────────────────────────────────────────────────────┘     │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────┐     │  │
│  │  │  Leads Table (Advanced)                                  │     │  │
│  │  │  ────────────────────                                   │     │  │
│  │  │  🔍 Search: [_______] 📊 Company ▼  📍 Location ▼       │     │  │
│  │  │                                                          │     │  │
│  │  │  Author ▲ | Company ▼ | Location | Created ▼           │     │  │
│  │  │  ──────────────────────────────────────────────────     │     │  │
│  │  │  John Doe | TechCo    | SF       | 2025-10-04          │     │  │
│  │  │  Jane Doe | AI Corp   | NYC      | 2025-10-03          │     │  │
│  │  │  ...                                                     │     │  │
│  │  │                                                          │     │  │
│  │  │  Showing 1-10 of 42 results    [◀ 1 2 3 ▶]             │     │  │
│  │  └─────────────────────────────────────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  REST API - http://localhost:3011/api                            │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  POST   /linkedin/campaigns     Create campaign                  │  │
│  │  GET    /linkedin/campaigns     List campaigns                   │  │
│  │  GET    /linkedin/campaigns/:id Campaign details                 │  │
│  │  GET    /linkedin/campaigns/:id/leads  List leads                │  │
│  │  GET    /linkedin/campaigns/:id/export Export CSV                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  CLI (Node.js)                                                    │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  $ node scripts/linkedin-hiring-runner.js --campaignId=<ID>      │  │
│  │                                                                    │  │
│  │  🚀 Starting LinkedIn Hiring Posts Scraper                        │  │
│  │  📂 Loading campaign: 68e0146074fa090cd2633ecf                    │  │
│  │  ✓ Loaded campaign: AI Engineers Q4 2025                         │  │
│  │     Mode: Search                                                  │  │
│  │  🌐 Launching Chrome...                                           │  │
│  │  ✓ Browser ready                                                  │  │
│  │  📝 Processing post 1/50                                          │  │
│  │     ✅ Lead saved! (1 total)                                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            SCRAPING MODES                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐    │
│  │  🔍 SEARCH MODE              │  │  🌱 SEED URL MODE            │    │
│  ├──────────────────────────────┤  ├──────────────────────────────┤    │
│  │                              │  │                              │    │
│  │  Input:                      │  │  Input:                      │    │
│  │  • Keywords/Roles            │  │  • Profile URLs              │    │
│  │  • Time Period               │  │  • Activity Feed URLs        │    │
│  │  • Location                  │  │  • Single Post URLs          │    │
│  │  • Max Leads                 │  │  • Plain Language Summary    │    │
│  │                              │  │  • Max Leads                 │    │
│  │  Process:                    │  │                              │    │
│  │  1. Build search URL         │  │  Process:                    │    │
│  │  2. Navigate to search       │  │  1. Detect URL type          │    │
│  │  3. Scroll & load posts      │  │  2. Navigate to each URL     │    │
│  │  4. Filter hiring content    │  │  3. Scrape feed/post         │    │
│  │  5. Extract with AI          │  │  4. Extract with AI          │    │
│  │  6. Save to database         │  │  5. Save to database         │    │
│  │                              │  │                              │    │
│  │  Example:                    │  │  Example:                    │    │
│  │  "AI engineer, hiring"       │  │  /in/user/recent-activity/   │    │
│  │  + "past week"               │  │  /feed/update/urn:li:...     │    │
│  │  + "India"                   │  │  + "Track tech CEOs"         │    │
│  │  → 50 leads                  │  │  → 30 leads                  │    │
│  └──────────────────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW & STORAGE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Campaign Creation (UI/API)                                             │
│         ↓                                                                │
│  MongoDB - Campaigns Collection                                         │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │ {                                                           │         │
│  │   _id: "68e0146074fa090cd2633ecf",                         │         │
│  │   name: "AI Engineers Q4 2025",                            │         │
│  │   source: "linkedin",                                      │         │
│  │   seedUrls: [],  // or ["url1", "url2"]                   │         │
│  │   query: {                                                 │         │
│  │     mode: "search",     // or "seedUrls"                  │         │
│  │     roles: "AI engineer, hiring",                         │         │
│  │     period: "past week",                                  │         │
│  │     location: "India",                                    │         │
│  │     summary: "...",                                       │         │
│  │     limit: 50                                             │         │
│  │   },                                                       │         │
│  │   status: "running",                                      │         │
│  │   stats: {                                                │         │
│  │     postsProcessed: 20,                                   │         │
│  │     leadsExtracted: 15,                                   │         │
│  │     errors: 0                                             │         │
│  │   }                                                       │         │
│  │ }                                                          │         │
│  └────────────────────────────────────────────────────────────┘         │
│         ↓                                                                │
│  Local Runner (Playwright + Chrome)                                     │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  1. Load campaign from MongoDB                             │         │
│  │  2. Detect mode (search vs seedUrls)                       │         │
│  │  3. Launch Chrome with persistent profile                  │         │
│  │  4. Execute scraping strategy:                             │         │
│  │     • Search: Navigate search → Scroll → Extract           │         │
│  │     • Seed URL: Iterate URLs → Scrape each                 │         │
│  │  5. Extract post data (3-method fallback)                  │         │
│  │  6. Call Ollama AI for lead extraction                     │         │
│  │  7. Save leads to MongoDB                                  │         │
│  │  8. Update campaign stats                                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│         ↓                                                                │
│  MongoDB - LinkedInLeads Collection                                     │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │ {                                                           │         │
│  │   campaignId: "68e0146074fa090cd2633ecf",                  │         │
│  │   linkedInId: "7379929021188476928",                       │         │
│  │   authorName: "John Doe",                                  │         │
│  │   authorProfile: "https://linkedin.com/in/johndoe",        │         │
│  │   postUrl: "https://...feed/update/urn:li:activity:...",  │         │
│  │   company: "TechCo",                                       │         │
│  │   jobTitles: ["AI Engineer", "ML Engineer"],              │         │
│  │   locations: ["San Francisco, CA"],                       │         │
│  │   skills: ["Python", "TensorFlow"],                       │         │
│  │   postText: "We're hiring! Looking for...",               │         │
│  │   extractedAt: "2025-10-04T12:00:00Z"                     │         │
│  │ }                                                          │         │
│  └────────────────────────────────────────────────────────────┘         │
│         ↓                                                                │
│  Display in UI / Export to CSV                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      KEY TECHNICAL FEATURES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ✅ Post URL Extraction (3-Method Fallback)                             │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  Method 1: data-urn attribute                              │         │
│  │    const urn = el.querySelector('[data-urn*="activity"]')  │         │
│  │    postId = urn.match(/urn:li:activity:(\d+)/)?.[1]        │         │
│  │                                                             │         │
│  │  Method 2: Timestamp link parsing                          │         │
│  │    const timestamp = el.querySelector('a[data-control-     │         │
│  │      name="timestamp"]')                                   │         │
│  │    postId = timestamp.href.match(/activity:(\d+)/)?.[1]    │         │
│  │                                                             │         │
│  │  Method 3: View post link parsing                          │         │
│  │    const postLink = el.querySelector('a[data-control-      │         │
│  │      name="view_post"]')                                   │         │
│  │    postId = postLink.href.match(/activity:(\d+)/)?.[1]     │         │
│  │                                                             │         │
│  │  Result:                                                    │         │
│  │    postUrl = `https://www.linkedin.com/feed/update/        │         │
│  │               urn:li:activity:${postId}/`                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ✅ AI-Powered Lead Extraction                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  Ollama (deepseek-r1:14b) @ ollama2.havenify.ai            │         │
│  │  ───────────────────────────────────────────────           │         │
│  │  Input:  Post text + Author info + Context                 │         │
│  │  Output: Structured JSON                                   │         │
│  │    {                                                        │         │
│  │      company: "TechCo",                                    │         │
│  │      jobTitles: ["AI Engineer"],                           │         │
│  │      locations: ["SF"],                                    │         │
│  │      seniority: "Mid",                                     │         │
│  │      skills: ["Python"],                                   │         │
│  │      workMode: "Remote"                                    │         │
│  │    }                                                        │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ✅ Human-Like Scraping                                                 │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  • Random delays (18-30 seconds between posts)             │         │
│  │  • Smooth scrolling (2-4 scrolls, 800-1500ms each)         │         │
│  │  • Scroll to element before processing                     │         │
│  │  • Rate limit detection & graceful stop                    │         │
│  │  • Persistent Chrome profile (stay logged in)              │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ✅ Advanced Table Features                                             │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  • Global search across 6 fields                           │         │
│  │  • Company dropdown filter (unique values)                 │         │
│  │  • Location dropdown filter (unique values)                │         │
│  │  • 4 sortable columns (asc/desc toggle)                    │         │
│  │  • Pagination (10 items per page)                          │         │
│  │  • Results summary ("Showing 1-10 of 42")                  │         │
│  │  • UseMemo optimization for performance                    │         │
│  └────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENTATION TREE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  docs/                                                                   │
│  ├── QUICK_START.md                    ← Start here! (3 steps)          │
│  ├── TESTING_GUIDE_COMPLETE.md         ← Comprehensive testing          │
│  ├── IMPLEMENTATION_COMPLETE.md        ← Full feature overview          │
│  ├── COMPLETION_SUMMARY.md             ← This summary                   │
│  ├── LINKEDIN_IMPLEMENTATION_SUMMARY.md ← Before/after comparison       │
│  └── LINKEDIN_RUNNER_IMPLEMENTATION_PLAN.md ← Original plan             │
│                                                                          │
│  README.md                              ← Updated with LinkedIn section │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          STATUS: 100% COMPLETE ✅                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ✅ Backend API       - Dual-mode support, validation, storage          │
│  ✅ Frontend UI       - Mode selection, conditional fields, table        │
│  ✅ Local Runner      - Seed URLs, profile feeds, single posts          │
│  ✅ Bug Fixes         - Post URLs, json2csv import                      │
│  ✅ Documentation     - 6 comprehensive guides                          │
│  ✅ Testing Ready     - Clear scenarios, expected outputs               │
│                                                                          │
│  🚀 Ready to Deploy! Start with docs/QUICK_START.md                     │
└─────────────────────────────────────────────────────────────────────────┘
```
