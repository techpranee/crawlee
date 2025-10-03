# Strategy Builder System - AI-Powered Selector Discovery

## Overview

The Strategy Builder system enables users to create, manage, and reuse scraping configurations (strategies) with AI-assisted selector discovery. This eliminates the need to manually configure selectors for each campaign.

## Architecture

### Phase 1: Interactive Strategy Creation (Implemented)
```
User → Browser with Auth → Target Page
  ↓
AI Analysis (Ollama) → Suggested Selectors
  ↓
User Validation/Refinement → Test on Sample URL
  ↓
Save as Strategy → Reusable Template
```

### Phase 2: Automated Campaigns (Partially Implemented)
```
User Selects Strategy → Provides Seed URLs
  ↓
Automated Scraping (Playwright/Cheerio)
  ↓
Data Extraction → Normalized Models
  ↓
Export as CSV/Database
```

## Backend Components

### 1. Strategy Model (`src/db/models/Strategy.ts`)

**Purpose**: Store reusable scraping configurations with selectors, validation rules, and metadata.

**Key Fields**:
- `name`: Human-readable strategy name (e.g., "LinkedIn Profile - Full")
- `platform`: Target platform (linkedin, apollo, zoom, generic)
- `urlPattern`: Regex pattern to match applicable URLs
- `selectors`: Array of selector configurations (CSS/XPath + extraction type)
- `authType`: Required authentication (if any)
- `usageCount`: Track strategy popularity
- `successRate`: Quality metric (0-100)
- `tags`: Categorization (profile, company, contacts, etc.)

**Selector Config Schema**:
```typescript
{
  selector: "div.profile-name h1",     // CSS selector
  field: "name",                        // Field name in extracted data
  type: "text",                         // text | href | src | attribute | html
  required: true,                       // Validation flag
  multiple: false,                      // Single vs multiple matches
  attribute: "data-id"                  // For type=attribute
}
```

**Indexes**:
- `{ tenantId: 1, platform: 1, active: 1 }` - Fast filtering by platform
- `{ tenantId: 1, name: 1 }` - Unique strategy names per tenant
- `{ tenantId: 1, tags: 1 }` - Tag-based categorization

### 2. Strategy API Routes (`src/routes/strategies.ts`)

#### Core CRUD Operations

**GET /api/strategies**
- List all strategies for tenant
- Query params: `platform`, `active`, `tag`
- Returns sorted by `usageCount` (popularity)

**GET /api/strategies/:id**
- Get single strategy with full configuration

**POST /api/strategies**
- Create new strategy
- Validates uniqueness by name
- Auto-sets tenant isolation

**PATCH /api/strategies/:id**
- Update existing strategy
- Incremental updates (partial schema)

**DELETE /api/strategies/:id**
- Soft delete by default (sets `active=false`)
- Hard delete with `?permanent=true`

**POST /api/strategies/:id/clone**
- Duplicate existing strategy with new name
- Preserves all configuration

#### AI-Powered Features

**POST /api/strategies/analyze** ⭐
**Purpose**: AI-powered selector discovery from live page

**Request**:
```json
{
  "url": "https://www.linkedin.com/in/example",
  "platform": "linkedin",
  "targetFields": ["name", "title", "email", "company"]
}
```

**Process**:
1. Launch Playwright browser with authentication
2. Inject tenant cookies (LinkedIn/Apollo/Zoom)
3. Navigate to target URL
4. Extract HTML structure
5. Send to Ollama AI for analysis
6. AI suggests optimal CSS selectors
7. Return structured selector configs

**Response**:
```json
{
  "url": "https://www.linkedin.com/in/example",
  "platform": "linkedin",
  "suggestedSelectors": [
    {
      "selector": "h1.text-heading-xlarge",
      "field": "name",
      "type": "text",
      "required": true
    },
    {
      "selector": "div.text-body-medium",
      "field": "title",
      "type": "text",
      "required": false
    }
  ],
  "pageStructure": {
    "title": "John Doe | LinkedIn",
    "bodyText": "...",
    "formFields": [],
    "links": 45,
    "images": 12
  },
  "confidence": 0.75
}
```

**POST /api/strategies/:id/test** ⭐
**Purpose**: Validate strategy on sample URL before deploying to campaign

**Request**:
```json
{
  "testUrl": "https://www.linkedin.com/in/another-example"
}
```

**Process**:
1. Load strategy from database
2. Launch Playwright with authentication
3. Navigate to test URL
4. Execute all selectors
5. Report found/missing fields with actual values

**Response**:
```json
{
  "success": true,
  "url": "https://www.linkedin.com/in/another-example",
  "strategyName": "LinkedIn Profile - Full",
  "extractedData": {
    "name": "Jane Smith",
    "title": "Senior Engineer at Google",
    "linkedin_url": "https://www.linkedin.com/in/another-example"
  },
  "selectorResults": [
    {
      "field": "name",
      "selector": "h1.text-heading-xlarge",
      "found": true,
      "value": "Jane Smith"
    },
    {
      "field": "email",
      "selector": "a[href^='mailto:']",
      "found": false,
      "value": null
    }
  ],
  "duration": 2341
}
```

### 3. AI Analyzer Service (`src/services/extraction/aiAnalyzer.ts`)

**Purpose**: Use Ollama to analyze page structure and suggest selectors.

**Key Functions**:

- `analyzePage(options)`: Main entry point
  - Launches browser with authentication
  - Extracts page structure (title, forms, links, etc.)
  - Sends to Ollama for AI analysis
  - Parses JSON response with suggested selectors
  - Falls back to platform-specific defaults if AI fails

- `analyzeWithAI(html, platform, fields)`: Ollama integration
  - Simplifies HTML (removes scripts/styles)
  - Generates structured prompt with target fields
  - Uses `temperature=0.2` for deterministic output
  - Extracts JSON from AI response

- `getFallbackSelectors(platform, fields)`: Safety net
  - Hardcoded selector patterns for linkedin/apollo/generic
  - Used when AI analysis fails or times out

**AI Prompt Template**:
```
You are an expert at web scraping and CSS selector generation.
Analyze the following HTML from a [platform] page and suggest
optimal CSS selectors for extracting these fields: [fields].

For each field, provide:
1. A CSS selector that uniquely identifies the element
2. The extraction type (text, href, src, attribute)
3. Whether the field is likely to have multiple matches

Respond with ONLY valid JSON in this exact format:
{
  "selectors": [
    {
      "selector": "div.profile-name h1",
      "field": "name",
      "type": "text",
      "required": true,
      "multiple": false
    }
  ]
}
```

### 4. Strategy Tester Service (`src/services/extraction/strategyTester.ts`)

**Purpose**: Validate strategy selectors on real URLs before campaign deployment.

**Key Functions**:

- `testStrategy(options)`: Main testing function
  - Loads strategy from database
  - Launches authenticated browser
  - Tests each selector individually
  - Reports found/missing with actual values
  - Measures execution time

- `testSelectors(page, selectors)`: Selector validation
  - Handles single vs multiple elements
  - Supports all extraction types (text, href, src, attribute, html)
  - Catches selector errors gracefully
  - Returns detailed success/failure per field

**Use Cases**:
- Validate strategy before creating campaign
- Debug failing selectors
- Monitor selector health over time
- A/B test selector variations

## Frontend Integration (TODO)

### Strategy Builder UI Page

**Location**: `/strategies/builder`

**Features**:
1. **Live Browser Preview**
   - Embedded Playwright view with authentication
   - Navigate to target page manually
   - Visual element inspection

2. **AI Selector Suggestions**
   - Click "Analyze Page" button
   - AI suggests selectors for common fields
   - Shows confidence scores per selector

3. **Manual Selector Editor**
   - Code editor for custom selectors
   - Real-time validation
   - Highlight elements on page preview

4. **Test & Validate**
   - Test selectors on current page
   - Show extracted values inline
   - Error highlighting for broken selectors

5. **Save Strategy**
   - Name and describe strategy
   - Set platform and URL pattern
   - Tag for organization
   - Save to library

### Campaign Creation Integration

**Current State**: Manual selector input in campaign form

**Future State**:
1. Dropdown to select from strategy library
2. Filter by platform (linkedin, apollo, etc.)
3. Preview strategy details (fields, selectors)
4. Auto-populate selectors from chosen strategy
5. Override individual selectors if needed
6. Link campaign to strategy for success rate tracking

## Workflow Example

### Creating a LinkedIn Profile Strategy

1. **User navigates to Strategy Builder page**
   - Clicks "Create New Strategy"

2. **Browser Authentication**
   - System uses stored LinkedIn cookie
   - Opens browser to https://www.linkedin.com/in/example

3. **AI Analysis**
   - User clicks "Analyze Page"
   - System sends HTML to Ollama
   - AI suggests selectors for: name, title, company, email, phone

4. **Manual Refinement**
   - User reviews AI suggestions
   - Edits selector for "title" (AI missed correct class)
   - Adds custom selector for "skills"

5. **Testing**
   - User provides 3 test URLs
   - System validates selectors on each URL
   - Shows success rate: 2/3 passed (66%)
   - User fixes failing selector

6. **Save Strategy**
   - Name: "LinkedIn Profile - Full"
   - Platform: linkedin
   - URL Pattern: `^https://www\\.linkedin\\.com/in/[^/]+/?$`
   - Tags: ["profile", "contact-info", "professional"]
   - Save to library

### Using Strategy in Campaign

1. **Create New Campaign**
   - User clicks "New Campaign"
   
2. **Select Strategy**
   - Dropdown shows: "LinkedIn Profile - Full" (used 23 times, 89% success)
   - User selects it
   - Selectors auto-populate

3. **Provide Seed URLs**
   - Upload CSV of 500 LinkedIn profile URLs
   - System validates URLs match strategy pattern

4. **Run Campaign**
   - System uses proven selectors from strategy
   - No manual selector configuration needed
   - Data extracted reliably

5. **Track Strategy Performance**
   - Campaign completes: 482/500 profiles extracted (96.4%)
   - Strategy success rate updated: 89% → 91%
   - Strategy usage count: 23 → 24

## API Testing

### Test Strategy Listing
```bash
curl -u techpranee:password \
  -H "X-Api-Key: mock-api-key" \
  http://localhost:3011/api/strategies
```

### Test AI Selector Analysis
```bash
curl -X POST http://localhost:3011/api/strategies/analyze \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "url": "https://www.linkedin.com/feed/",
    "platform": "linkedin",
    "targetFields": ["name", "title", "company"]
  }'
```

### Create Strategy
```bash
curl -X POST http://localhost:3011/api/strategies \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "name": "LinkedIn Profile - Basic",
    "description": "Extract name, title, and LinkedIn URL from profiles",
    "platform": "linkedin",
    "urlPattern": "^https://www\\\\.linkedin\\\\.com/in/[^/]+/?$",
    "selectors": [
      {
        "selector": "h1.text-heading-xlarge",
        "field": "name",
        "type": "text",
        "required": true
      },
      {
        "selector": "div.text-body-medium",
        "field": "title",
        "type": "text",
        "required": false
      }
    ],
    "authType": "linkedin",
    "crawlerStrategy": "playwright",
    "tags": ["profile", "basic"]
  }'
```

### Test Strategy on URL
```bash
curl -X POST http://localhost:3011/api/strategies/STRATEGY_ID/test \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "testUrl": "https://www.linkedin.com/in/example"
  }'
```

## Benefits

### For Users
- **No Selector Expertise Required**: AI suggests selectors automatically
- **Reusable Configurations**: Create once, use many times
- **Validated Selectors**: Test before deploying to campaigns
- **Community Library**: Share proven strategies across team

### For System
- **Quality Metrics**: Track strategy success rates
- **Auto-Healing**: Identify broken selectors via success rate drops
- **Performance Optimization**: Prioritize popular strategies
- **A/B Testing**: Compare selector variations

## Next Steps

1. **Build Frontend UI** (Phase 1 Priority)
   - Strategy builder page with live preview
   - AI analysis integration
   - Test/validate workflow
   - Save to library

2. **Campaign Integration** (Phase 1 Priority)
   - Strategy selector in campaign form
   - Auto-populate selectors
   - Link campaigns to strategies

3. **Advanced Features** (Phase 2)
   - Strategy marketplace (public templates)
   - Auto-healing (detect broken selectors, suggest fixes)
   - Selector versioning (track changes over time)
   - A/B testing framework

4. **Monitoring & Analytics**
   - Strategy success rate dashboard
   - Popular strategies leaderboard
   - Selector health metrics
   - Campaign → Strategy attribution

## Implementation Status

✅ **Completed**:
- Strategy model with full schema
- CRUD API endpoints
- AI-powered selector analysis
- Strategy testing on sample URLs
- Authentication integration
- Tenant isolation

🔄 **In Progress**:
- Frontend strategy builder UI
- Campaign → Strategy integration

❌ **TODO**:
- Public strategy marketplace
- Auto-healing broken selectors
- Selector versioning
- A/B testing framework
- Advanced analytics dashboard
