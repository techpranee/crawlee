# Production LinkedIn Lead Generation Setup

This guide outlines the production-ready setup for automated LinkedIn lead generation, including strategies to avoid rate limiting and detection.

## Overview

LinkedIn actively blocks automated scraping with HTTP 429 (Rate Limiting) errors. This system implements multiple strategies to work within LinkedIn's constraints while still enabling lead generation at scale.

## Anti-Detection Features

### 1. **Aggressive Rate Limiting** ✅ Implemented

The system automatically enforces strict rate limits for LinkedIn:

- **Minimum Delay**: 10 minutes between requests
- **Random Jitter**: ±5 minutes to appear more human
- **Exponential Backoff**: Doubles delay after each HTTP 429 (2x, 4x, 8x...)
- **Extended Backoff**: 2-hour cooldown after 3 consecutive rate limits
- **Request Window**: Maximum 10 requests per hour

**Configuration:**
- Automatically applies to all LinkedIn requests
- No configuration needed - built into the crawler
- Monitor via: `GET /api/admin/rate-limiter/stats?url=https://linkedin.com`

### 2. **Residential Proxy Rotation** ✅ Implemented

Use residential IPs to avoid datacenter IP blocks:

**Single Proxy:**
```bash
PROXY_URL=http://username:password@proxy.provider.com:8080
```

**Multiple Proxies (Recommended):**
```bash
PROXY_URLS=http://proxy1.example.com:8080,http://proxy2.example.com:8080,http://proxy3.example.com:8080
PROXY_ROTATION=random  # or 'round-robin'
```

**Features:**
- Automatic proxy health tracking
- Marks proxies unhealthy after 3 consecutive failures
- 30-minute cooldown before retrying failed proxies
- Monitor via: `GET /api/admin/proxies/stats`

**Recommended Providers:**
- [BrightData](https://brightdata.com/) - Residential proxies
- [Oxylabs](https://oxylabs.io/) - Premium residential IPs
- [Smartproxy](https://smartproxy.com/) - Rotating residential proxies

### 3. **Browser Stealth Mode** ✅ Implemented

Playwright configured with anti-detection measures:

- Chrome browser (not Chromium)
- Disabled automation flags (`--disable-blink-features=AutomationControlled`)
- Real user agent strings
- Cookie-based authentication
- Human-like delays and scrolling

### 4. **Firecrawl Integration with Retries** ✅ Implemented

Falls back to Firecrawl API for difficult pages:

- Tries Firecrawl first for LinkedIn URLs
- Automatic retry with exponential backoff (3 attempts)
- 60-second timeout per attempt
- Falls back to Playwright if Firecrawl fails

**Configuration:**
```bash
FIRECRAWL_API_URL=https://firecrawlapi.techpranee.com
FIRECRAWL_API_KEY=your_api_key  # Optional
```

## Production Deployment Checklist

### Prerequisites

1. **MongoDB Atlas** - Production database
   ```bash
   MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/crawlee
   ```

2. **LinkedIn Cookies** - Authenticated session
   ```bash
   # Use scripts/check-linkedin-cookies.js to manage
   node scripts/check-linkedin-cookies.js
   ```

3. **Residential Proxies** - At least 3-5 rotating IPs
   ```bash
   PROXY_URLS=proxy1,proxy2,proxy3
   ```

4. **Ollama/Vision API** - For AI selector discovery
   ```bash
   OLLAMA_URL=https://ollama2.havenify.ai
   ```

### Environment Configuration

Create a `.env` file with:

```bash
# Core Config
NODE_ENV=production
PORT=3011
MAX_CONCURRENCY=1  # Keep low for LinkedIn

# MongoDB
MONGO_URL=mongodb+srv://...

# Proxies (CRITICAL for LinkedIn)
PROXY_URLS=http://user:pass@proxy1:8080,http://user:pass@proxy2:8080
PROXY_ROTATION=random

# Firecrawl (optional but recommended)
FIRECRAWL_API_URL=https://firecrawlapi.techpranee.com
FIRECRAWL_API_KEY=your_key

# AI Analysis
OLLAMA_URL=https://ollama2.havenify.ai
OLLAMA_MODEL=llama3.2-vision:latest

# Storage
CRAWLEE_STORAGE_DIR=./storage
EXPORT_DIR=./exports
```

### Rate Limiting Configuration

The rate limiter is pre-configured for LinkedIn with conservative defaults:

| Setting | Value | Description |
|---------|-------|-------------|
| Min Delay | 10 minutes | Minimum time between requests |
| Max Delay | 60 minutes | Maximum delay after backoff |
| Jitter | ±5 minutes | Random variation |
| Window Size | 1 hour | Request tracking window |
| Max Requests/Window | 10 | Maximum requests per hour |
| Extended Backoff | 2 hours | After 3x 429 errors |

**These cannot be changed** - they're hardcoded to prevent LinkedIn blocks.

## Creating a LinkedIn Campaign

### Step 1: Prepare LinkedIn Cookie

1. Log into LinkedIn in your browser
2. Install cookie export extension (EditThisCookie, Cookie Editor)
3. Export all LinkedIn cookies as a single string:
   ```
   li_at=VALUE; JSESSIONID=VALUE; bcookie=VALUE; ...
   ```

4. Add to tenant via MongoDB or script:
   ```bash
   MONGO_URL="..." node scripts/check-linkedin-cookies.js
   ```

### Step 2: Create Campaign

```bash
curl -X POST http://localhost:3011/api/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'tenant-id:api-key' | base64)" \
  -d '{
    "name": "LinkedIn People Search - Hiring Managers",
    "platform": "linkedin",
    "seedUrls": [
      "https://www.linkedin.com/search/results/people/?keywords=hiring%20manager%20AI"
    ],
    "selectors": {
      "name": ".entity-result__title-text",
      "title": ".entity-result__primary-subtitle",
      "company": ".entity-result__secondary-subtitle",
      "location": ".entity-result__location",
      "profile_url": "a.app-aware-link"
    },
    "auth": "linkedin",
    "maxItems": 50,
    "query": {
      "enrichContacts": true
    }
  }'
```

### Step 3: Monitor Progress

```bash
# Check campaign status
curl http://localhost:3011/api/campaigns/{campaignId} \
  -H "Authorization: Basic ..."

# Check rate limiter
curl "http://localhost:3011/api/admin/rate-limiter/stats?url=https://linkedin.com" \
  -H "Authorization: Basic ..."

# Check proxy health
curl http://localhost:3011/api/admin/proxies/stats \
  -H "Authorization: Basic ..."
```

### Step 4: Export Leads

```bash
# Export to CSV
curl http://localhost:3011/api/campaigns/{campaignId}/export \
  -H "Authorization: Basic ..." \
  > leads.csv
```

## Expected Performance

### Realistic LinkedIn Scraping Rates

With proper configuration:

| Metric | Value | Notes |
|--------|-------|-------|
| **Requests/Hour** | 6-10 | With 10-minute delays |
| **Requests/Day** | 50-100 | Assuming 8-12 hour operation |
| **Leads/Day** | 50-100 | 1 page per request |
| **Time/Lead** | ~10-15 minutes | Including delays |

### Cost Considerations

**Residential Proxy Costs:**
- BrightData: ~$10-15/GB (~$50-100/month for 5-10GB)
- Oxylabs: ~$300/month for 20GB
- Smartproxy: ~$75/month for 5GB

**ROI Calculation:**
- 50 leads/day × 30 days = 1,500 leads/month
- Cost: ~$100-150/month (proxies + hosting)
- **Cost per lead: ~$0.07-0.10**

## Monitoring & Debugging

### Health Check Endpoints

```bash
# Application health
curl http://localhost:3011/health

# Dependencies ready
curl http://localhost:3011/ready

# Prometheus metrics
curl http://localhost:3011/metrics
```

### Rate Limiter Stats

```bash
# Check LinkedIn rate limit status
curl "http://localhost:3011/api/admin/rate-limiter/stats?url=https://linkedin.com" \
  -H "Authorization: Basic ..."

# Response:
{
  "stats": {
    "domain": "linkedin.com",
    "requestsInWindow": 5,
    "maxRequestsPerWindow": 10,
    "consecutiveRateLimits": 0,
    "isBlocked": false,
    "minDelaySeconds": 600,  # 10 minutes
    "timeSinceLastRequestSeconds": 450  # 7.5 minutes ago
  }
}
```

### Proxy Health Monitoring

```bash
curl http://localhost:3011/api/admin/proxies/stats \
  -H "Authorization: Basic ..."

# Response:
{
  "stats": {
    "totalProxies": 3,
    "healthyProxies": 2,
    "proxies": [
      {
        "url": "***:***@proxy1.example.com",
        "isHealthy": true,
        "successCount": 45,
        "failureCount": 2,
        "consecutiveFailures": 0
      },
      ...
    ]
  }
}
```

### Backend Logs

```bash
# Live tail
tail -f /tmp/crawlee-backend.log

# Search for rate limits
grep "rate limit" /tmp/crawlee-backend.log

# Search for HTTP 429
grep "429" /tmp/crawlee-backend.log
```

## Troubleshooting

### Still Getting HTTP 429 Errors

**Causes:**
- Delay too aggressive (though 10 minutes should work)
- LinkedIn detected automation patterns
- IP/proxy is burned
- Cookie expired

**Solutions:**
1. Check rate limiter stats - ensure delays are being enforced
2. Rotate to fresh proxy IPs
3. Refresh LinkedIn cookies
4. Increase delays even further (manual override in `rateLimiter.ts`)

### Proxies Marked Unhealthy

**Check proxy health:**
```bash
curl http://localhost:3011/api/admin/proxies/stats ...
```

**Reset proxy manually:**
```bash
curl -X POST http://localhost:3011/api/admin/proxies/reset \
  -H "Authorization: Basic ..." \
  -d '{"proxyUrl": "http://proxy1.example.com:8080"}'
```

### No Content Extracted

**Causes:**
- Incorrect selectors
- Page structure changed
- Content not loaded (timing issue)

**Solutions:**
1. Use AI analyzer to discover new selectors:
   ```bash
   curl -X POST http://localhost:3011/api/strategies/analyze \
     -d '{"url": "https://linkedin.com/...", "platform": "linkedin"}'
   ```

2. Manually capture and analyze:
   - Visit page in browser
   - Save HTML (Ctrl+S)
   - Inspect element to find working selectors
   - Update campaign selectors

### Cookie Authentication Failed

**Check cookies:**
```bash
node scripts/check-linkedin-cookies.js
```

**Update cookies:**
1. Log into LinkedIn manually
2. Export cookies
3. Update tenant via script or MongoDB

## Best Practices

### 1. Start Small, Scale Gradually

- Begin with 1-2 requests to test
- Monitor for rate limits
- Gradually increase volume

### 2. Use Multiple Cookie Sessions

- Rotate between 2-3 LinkedIn accounts
- Distribute load across sessions
- Implement session rotation (TODO: not yet implemented)

### 3. Time Your Campaigns

- Run during business hours (9 AM - 5 PM local)
- Pause overnight
- Mimic human behavior patterns

### 4. Monitor Continuously

- Set up alerts for HTTP 429 errors
- Track proxy health
- Watch extraction success rates

### 5. Have Fallback Plans

- Manual data entry UI (TODO: planned)
- CSV upload capability
- LinkedIn official API for critical data

## Legal & Ethical Considerations

⚠️ **Important Disclaimers:**

1. **LinkedIn Terms of Service**
   - Automated scraping violates LinkedIn's TOS
   - Use at your own risk
   - Consider LinkedIn official APIs for production use

2. **Data Privacy**
   - Comply with GDPR, CCPA, and local privacy laws
   - Only collect publicly available information
   - Provide opt-out mechanisms
   - Secure storage of personal data

3. **Rate Limiting**
   - Respect LinkedIn's infrastructure
   - Aggressive scraping hurts everyone
   - 10-minute delays are a minimum, not maximum

4. **Intended Use**
   - B2B lead generation
   - Market research
   - Recruitment (with consent)
   - **Not for spam or harassment**

## Future Improvements

### Planned Features

1. **Session Rotation** - Multiple LinkedIn cookies, auto-rotate
2. **Manual Fallback UI** - User can manually enter leads when automation fails
3. **Smart Scheduling** - Automatically adjust timing based on success rates
4. **LinkedIn API Integration** - Official API for critical operations
5. **Machine Learning** - Predict best times to scrape, detect pattern changes

### Research Topics

- Headless browser fingerprinting evasion
- More sophisticated human behavior simulation
- Residential proxy vs. mobile proxy comparison
- LinkedIn detection algorithm reverse engineering

## Support & Resources

- **Documentation**: `/docs/contracts.md`
- **Cookie Manager**: `scripts/check-linkedin-cookies.js`
- **Direct Browser Test**: `scripts/test-linkedin-direct.ts`
- **Vision Model Test**: `scripts/test-vision-models.ts`
- **GitHub Issues**: [Your repo URL]

---

**Last Updated**: October 2025
**Version**: 1.0.0
**Status**: Production-Ready ✅
