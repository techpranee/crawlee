# LinkedIn Lead Generation - System Architecture

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User / Frontend                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express REST API (Port 3011)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Campaigns   │  │  Strategies  │  │    Admin     │          │
│  │   Routes     │  │   Routes     │  │   Routes     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         │  ┌───────────────┴──────────────────┘                  │
│         │  │                                                      │
│         ▼  ▼                                                      │
│  ┌─────────────────────────────────────────────────────┐        │
│  │         Tenant Middleware (Multi-tenant Auth)        │        │
│  └─────────────────────────────────────────────────────┘        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agenda Job Queue (MongoDB)                    │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  Job Types:                                           │       │
│  │  • scrape:crawl   - Main scraping job                │       │
│  │  • enrich:contacts - Email enrichment                │       │
│  └──────────────────────────────────────────────────────┘       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Crawl Services Layer                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Rate Limiter (rateLimiter.ts)              │   │
│  │  • 10-min delays  • Exponential backoff                 │   │
│  │  • Per-domain tracking  • Extended backoff (2hr)        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Proxy Rotator (proxyRotator.ts)              │   │
│  │  • Random/RR rotation  • Health tracking                │   │
│  │  • Auto-cooldown  • Credential masking                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│              ┌─────────────┴─────────────┐                      │
│              ▼                           ▼                       │
│  ┌────────────────────┐      ┌────────────────────┐            │
│  │   Firecrawl API    │      │   Playwright       │            │
│  │   (External SaaS)  │      │   (Local Browser)  │            │
│  │  • 3 retry attempts│      │  • Cookie auth     │            │
│  │  • Exponential b/o │      │  • Stealth mode    │            │
│  │  • 60s timeout     │      │  • Network idle    │            │
│  └────────────────────┘      └────────────────────┘            │
│              │                           │                       │
│              └───────────┬───────────────┘                      │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Extractors (extractors.ts)                 │   │
│  │  • CSS selector-based extraction                        │   │
│  │  • Data normalization                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas (Data Layer)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Campaigns   │  │  Companies   │  │   Contacts   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Tenants    │  │    Tasks     │  │  Strategies  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Export / Output Layer                       │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  CSV Exporter (contactExporter.ts)                     │     │
│  │  • Streaming export  • Custom field mapping            │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow: Campaign Creation to CSV Export

### Step-by-Step Flow

```
1. User creates campaign via POST /api/campaigns
   ↓
2. Campaign document saved to MongoDB
   ↓
3. Agenda job "scrape:crawl" scheduled
   ↓
4. Job handler (scrapeCrawl.ts) picks up job
   ↓
5. Rate Limiter checks: "Can I make request now?"
   • If too soon: Wait (10+ minutes)
   • If OK: Proceed
   ↓
6. Proxy Rotator selects next healthy proxy
   ↓
7. Try Firecrawl first (LinkedIn URLs only):
   • Attempt 1 → Wait 1s → Attempt 2 → Wait 2s → Attempt 3
   • If all fail: Fall back to Playwright
   ↓
8. Playwright crawler starts:
   • Launch Chrome with stealth mode
   • Add LinkedIn cookies to browser context
   • Apply HTTP headers
   • Navigate to seed URL
   ↓
9. Wait for content:
   • Wait for network idle (no requests for 500ms)
   • Wait for specific selectors (LinkedIn feed)
   • Scroll page to trigger lazy loading
   • Additional 2-5 second delay
   ↓
10. Extract data using CSS selectors:
    • name: .entity-result__title-text
    • title: .entity-result__primary-subtitle
    • company: .entity-result__secondary-subtitle
    • etc.
   ↓
11. Normalize extracted data (normalize.ts):
    • Clean whitespace
    • Deduplicate
    • Create Company and Contact documents
   ↓
12. Save to MongoDB:
    • Campaign.status = 'completed'
    • Company documents created/updated
    • Contact documents created
   ↓
13. User exports via GET /api/campaigns/{id}/export
   ↓
14. CSV streamed back to user
```

## 🔐 Rate Limiting Logic

### Decision Tree

```
Request arrives for linkedin.com
│
├─→ Check if domain is blocked (in extended backoff)
│   • Yes → Throw error "Wait X minutes"
│   • No → Continue
│
├─→ Calculate requests in last 60 minutes
│   • If >= 10 → Wait until oldest request expires
│   • If < 10 → Continue
│
├─→ Calculate time since last request
│   • If < 10 minutes → Wait remaining time
│   • If >= 10 minutes → Continue
│
├─→ Apply exponential backoff if consecutive 429s
│   • 0 failures: 10 min delay
│   • 1 failure: 20 min delay
│   • 2 failures: 40 min delay
│   • 3+ failures: Enter 2-hour extended backoff
│
└─→ Add random jitter (±5 minutes)
    └─→ Wait calculated delay
        └─→ Make request
```

### After Request

```
Response received
│
├─→ HTTP 200-299 (Success)
│   • Record success
│   • Reset consecutive failures to 0
│   • Clear backoff period
│
├─→ HTTP 429 (Rate Limited)
│   • Increment consecutive failures
│   • If >= 3: Enter extended backoff (2 hours)
│   • Record rate limit event
│
└─→ HTTP 400-599 (Other Error)
    • Record error
    • Do NOT increment consecutive failures
    • (Not a rate limit issue)
```

## 🔄 Proxy Rotation Logic

### Selection Algorithm

```
Get next proxy request
│
├─→ Filter to healthy proxies only
│   • Healthy: consecutiveFailures < 3
│   • Unhealthy: In 30-min cooldown period
│
├─→ If no healthy proxies available
│   • Check if any in cooldown period expired
│   • If yes: Mark as healthy, use it
│   • If no: Use direct connection (no proxy)
│
├─→ Apply rotation strategy:
│   • Random: Pick random healthy proxy
│   • Round-robin: Cycle through in order
│
└─→ Return selected proxy URL
```

### Health Tracking

```
Proxy request completes
│
├─→ Success (HTTP 200-299)
│   • Increment successCount
│   • Reset consecutiveFailures = 0
│   • Mark as healthy
│
└─→ Failure (Network error, timeout, HTTP 5xx)
    • Increment failureCount
    • Increment consecutiveFailures
    │
    └─→ If consecutiveFailures >= 3
        • Mark as unhealthy
        • Start 30-minute cooldown
        • Log warning
```

## 🧩 Key Components

### Rate Limiter (`rateLimiter.ts`)

**Purpose**: Prevent HTTP 429 errors by enforcing delays

**Configuration** (hardcoded for LinkedIn):
```typescript
{
  minDelayMs: 10 * 60 * 1000,      // 10 minutes
  maxDelayMs: 60 * 60 * 1000,      // 60 minutes
  jitterMs: 5 * 60 * 1000,         // ±5 minutes
  backoffMultiplier: 2,            // Double on each 429
  maxConsecutiveRateLimits: 3,    // Threshold for extended backoff
  extendedBackoffMs: 2 * 60 * 60 * 1000, // 2 hours
  requestWindowMs: 60 * 60 * 1000, // 1 hour
  maxRequestsPerWindow: 10,        // Max 10/hour
}
```

**Methods**:
- `waitBeforeRequest(url)` - Enforces delay before making request
- `recordSuccess(url)` - Records successful request
- `recordRateLimit(url)` - Records HTTP 429 error
- `recordError(url)` - Records other errors
- `getStats(url)` - Returns current state for monitoring
- `reset(url)` - Resets state (admin operation)

### Proxy Rotator (`proxyRotator.ts`)

**Purpose**: Distribute requests across multiple residential IPs

**Configuration** (from env vars):
```bash
PROXY_URLS=http://proxy1:8080,http://proxy2:8080
PROXY_ROTATION=random  # or 'round-robin'
```

**State per proxy**:
```typescript
{
  url: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastUsed: number;
  lastFailure: number | null;
  isHealthy: boolean;
}
```

**Methods**:
- `getNextProxy()` - Returns next proxy based on strategy
- `recordSuccess(proxyUrl)` - Records successful request
- `recordFailure(proxyUrl, reason?)` - Records failure
- `getStats()` - Returns health stats for all proxies
- `reset(proxyUrl?)` - Resets one or all proxies

### Crawlers (`crawlers.ts`)

**Purpose**: Execute scraping with Playwright or Cheerio

**Integration points**:
```typescript
// Before request
await rateLimiter.waitBeforeRequest(url);
const proxyUrl = proxyRotator.getNextProxy();

// Configure crawler
new PlaywrightCrawler({
  proxyConfiguration: new ProxyConfiguration({ proxyUrls: [proxyUrl] }),
  // ... other config
});

// After successful request
rateLimiter.recordSuccess(url);
proxyRotator.recordSuccess(proxyUrl);

// On HTTP 429
rateLimiter.recordRateLimit(url);

// On error
rateLimiter.recordError(url);
proxyRotator.recordFailure(proxyUrl, reason);
```

### Admin Routes (`routes/admin.ts`)

**Purpose**: Monitor and manage scraping infrastructure

**Endpoints**:

1. **GET /api/admin/rate-limiter/stats**
   ```bash
   curl "http://localhost:3011/api/admin/rate-limiter/stats?url=https://linkedin.com"
   ```
   Returns: Current delay requirements, backoff status, request counts

2. **POST /api/admin/rate-limiter/reset**
   ```bash
   curl -X POST http://localhost:3011/api/admin/rate-limiter/reset \
     -d '{"url": "https://linkedin.com"}'
   ```
   Resets rate limiter state for domain

3. **GET /api/admin/proxies/stats**
   ```bash
   curl http://localhost:3011/api/admin/proxies/stats
   ```
   Returns: Proxy health, success/failure counts, last used times

4. **POST /api/admin/proxies/reset**
   ```bash
   curl -X POST http://localhost:3011/api/admin/proxies/reset \
     -d '{"proxyUrl": "http://proxy1:8080"}'
   ```
   Resets proxy health status

## 🎯 Production Deployment

### Infrastructure Requirements

1. **Application Server**
   - Node.js 18+
   - 2GB RAM minimum (4GB recommended)
   - 10GB disk space for storage
   - Ubuntu 20.04+ or similar

2. **MongoDB Atlas**
   - M10 cluster or higher (production)
   - Automated backups enabled
   - Connection from app server whitelisted

3. **Residential Proxies**
   - Minimum 3-5 rotating IPs
   - Residential (not datacenter)
   - Providers: BrightData, Oxylabs, Smartproxy
   - Budget: $50-150/month

4. **LinkedIn Cookies**
   - Valid authenticated session
   - Refreshed every 7-14 days
   - Stored securely in MongoDB (tenant.linkedinCookie)

### Deployment Checklist

- [ ] Server provisioned with Node.js
- [ ] MongoDB Atlas cluster created
- [ ] Proxies configured in PROXY_URLS
- [ ] LinkedIn cookies added to tenant
- [ ] Environment variables set
- [ ] Backend started with pm2 or similar
- [ ] Health check endpoint responding
- [ ] Rate limiter stats verified (600s delay)
- [ ] Proxy stats verified (all healthy)
- [ ] Test campaign created
- [ ] First lead exported to CSV

### Monitoring

**Set up alerts for**:
- HTTP 429 rate > 10%
- All proxies unhealthy
- Campaign completion failures > 25%
- MongoDB connection errors
- Disk space < 20%

**Log aggregation**:
- Send logs to CloudWatch, Datadog, or similar
- Set up dashboard with key metrics:
  - Requests per hour
  - Success rate
  - Average delay time
  - Proxy health status

## 🔒 Security Considerations

1. **API Keys**
   - Use strong random keys (32+ chars)
   - Rotate regularly (every 90 days)
   - Store in environment variables, not code

2. **LinkedIn Cookies**
   - Encrypt in MongoDB (at-rest encryption)
   - Use separate cookies per tenant
   - Rotate cookies if suspicious activity

3. **Proxy Credentials**
   - Never log full credentials
   - Mask in logs (rateLimiter.ts does this)
   - Use HTTPS proxies when possible

4. **Rate Limiting**
   - Do NOT reduce delays below 10 minutes
   - Respect LinkedIn's TOS
   - Monitor for pattern detection

## 📚 Related Documentation

- **Production Guide**: `LINKEDIN_PRODUCTION.md` - Complete setup guide
- **Quick Reference**: `QUICK_REFERENCE.md` - Common commands
- **Before/After**: `BEFORE_AFTER.md` - What changed and why
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md` - Technical details

---

**Last Updated**: October 2025
**Version**: 1.0.0
