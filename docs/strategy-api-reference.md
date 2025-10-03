# Strategy Builder API - Quick Reference

## Base URL
```
http://localhost:3011/api/strategies
```

## Authentication
All endpoints require:
- Basic Auth: `-u techpranee:password`
- API Key Header: `-H "X-Api-Key: mock-api-key"`

## Endpoints

### List Strategies
```bash
GET /api/strategies?platform=linkedin&active=true&tag=profile
```

**Response:**
```json
{
  "strategies": [
    {
      "id": "68df...",
      "name": "LinkedIn Profile - Full",
      "platform": "linkedin",
      "selectors": [...],
      "usageCount": 23,
      "successRate": 89,
      "active": true
    }
  ],
  "total": 5
}
```

### Get Strategy
```bash
GET /api/strategies/:id
```

### Create Strategy
```bash
POST /api/strategies
Content-Type: application/json

{
  "name": "LinkedIn Profile - Basic",
  "description": "Extract basic profile info",
  "platform": "linkedin",
  "urlPattern": "^https://www\\.linkedin\\.com/in/[^/]+/?$",
  "selectors": [
    {
      "selector": "h1.text-heading-xlarge",
      "field": "name",
      "type": "text",
      "required": true,
      "multiple": false
    }
  ],
  "authType": "linkedin",
  "crawlerStrategy": "playwright",
  "tags": ["profile", "basic"],
  "exampleUrls": ["https://www.linkedin.com/in/example"]
}
```

### Update Strategy
```bash
PATCH /api/strategies/:id
Content-Type: application/json

{
  "description": "Updated description",
  "active": true
}
```

### Delete Strategy
```bash
# Soft delete (sets active=false)
DELETE /api/strategies/:id

# Hard delete (permanent)
DELETE /api/strategies/:id?permanent=true
```

### Clone Strategy
```bash
POST /api/strategies/:id/clone
Content-Type: application/json

{
  "name": "LinkedIn Profile - Custom"
}
```

### AI Selector Analysis ⭐
```bash
POST /api/strategies/analyze
Content-Type: application/json

{
  "url": "https://www.linkedin.com/in/example",
  "platform": "linkedin",
  "targetFields": ["name", "title", "email", "company", "phone"]
}
```

**Response:**
```json
{
  "url": "https://www.linkedin.com/in/example",
  "platform": "linkedin",
  "suggestedSelectors": [
    {
      "selector": "h1.text-heading-xlarge",
      "field": "name",
      "type": "text",
      "required": true,
      "multiple": false
    },
    {
      "selector": "div.text-body-medium",
      "field": "title",
      "type": "text",
      "required": false,
      "multiple": false
    }
  ],
  "pageStructure": {
    "title": "John Doe | LinkedIn",
    "bodyText": "...",
    "links": 45,
    "images": 12
  },
  "confidence": 0.75
}
```

### Test Strategy ⭐
```bash
POST /api/strategies/:id/test
Content-Type: application/json

{
  "testUrl": "https://www.linkedin.com/in/another-example"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://www.linkedin.com/in/another-example",
  "strategyName": "LinkedIn Profile - Full",
  "extractedData": {
    "name": "Jane Smith",
    "title": "Senior Engineer at Google"
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
      "value": null,
      "error": "Element not found"
    }
  ],
  "duration": 2341
}
```

## Selector Configuration Schema

```typescript
{
  selector: string;           // CSS selector (e.g., "div.profile h1")
  field: string;              // Field name in extracted data
  type: "text" | "href" | "src" | "attribute" | "html";
  attribute?: string;         // For type="attribute"
  required?: boolean;         // Validation flag
  transform?: string;         // Transform function name
  multiple?: boolean;         // Extract array of values
}
```

## Common Selector Types

### Text Content
```json
{
  "selector": "h1.profile-name",
  "field": "name",
  "type": "text"
}
```

### Link URL
```json
{
  "selector": "a[href*='linkedin.com/in/']",
  "field": "linkedin_url",
  "type": "href"
}
```

### Image Source
```json
{
  "selector": "img.profile-photo",
  "field": "photo_url",
  "type": "src"
}
```

### Custom Attribute
```json
{
  "selector": "div[data-id]",
  "field": "profile_id",
  "type": "attribute",
  "attribute": "data-id"
}
```

### Multiple Elements
```json
{
  "selector": "div.skill-item",
  "field": "skills",
  "type": "text",
  "multiple": true
}
```

## Example Workflow

### 1. Analyze Page with AI
```bash
curl -X POST http://localhost:3011/api/strategies/analyze \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "url": "https://www.linkedin.com/in/example",
    "platform": "linkedin",
    "targetFields": ["name", "title", "company"]
  }' | jq '.suggestedSelectors'
```

### 2. Create Strategy from AI Suggestions
```bash
curl -X POST http://localhost:3011/api/strategies \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "name": "LinkedIn Profile - AI Generated",
    "platform": "linkedin",
    "urlPattern": "^https://www\\.linkedin\\.com/in/[^/]+/?$",
    "selectors": [
      /* paste AI suggested selectors here */
    ],
    "authType": "linkedin",
    "crawlerStrategy": "playwright"
  }' | jq '.id'
```

### 3. Test Strategy
```bash
STRATEGY_ID="..." # from step 2

curl -X POST http://localhost:3011/api/strategies/$STRATEGY_ID/test \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "testUrl": "https://www.linkedin.com/in/test-profile"
  }' | jq '.selectorResults'
```

### 4. Use in Campaign
```bash
curl -X POST http://localhost:3011/api/campaigns \
  -u techpranee:password \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: mock-api-key" \
  -d '{
    "name": "LinkedIn Profile Campaign",
    "source": "linkedin",
    "seedUrls": ["https://www.linkedin.com/in/profile1", "..."],
    "strategy": "playwright",
    "auth": "linkedin",
    "strategyId": "'$STRATEGY_ID'",
    "maxItems": 100
  }'
```

## Error Handling

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": ["selectors", 0, "selector"],
      "message": "Required"
    }
  ]
}
```

### 404 Not Found
```json
{
  "error": "Strategy not found"
}
```

### 409 Conflict
```json
{
  "error": "Strategy with this name already exists"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to analyze page",
  "details": "Ollama service unavailable"
}
```

## Tips & Best Practices

### Selector Specificity
- Start specific, fall back to general
- Use classes over IDs when possible
- Avoid overly nested selectors
- Test on multiple sample pages

### AI Analysis
- Provide diverse target fields
- Use accurate platform parameter
- Validate AI suggestions manually
- Keep fallback selectors ready

### Testing
- Test on 3+ sample URLs
- Check edge cases (missing fields)
- Monitor selector stability over time
- Update strategies when sites change

### Performance
- Prefer `cheerio` for static content
- Use `playwright` only when needed
- Limit `maxItems` during testing
- Cache strategy lookups in campaigns
