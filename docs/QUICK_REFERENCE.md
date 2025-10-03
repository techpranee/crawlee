# LinkedIn Lead Generation - Quick Reference

## 🚀 Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
# Edit .env with:
# - MONGO_URL (MongoDB Atlas)
# - PROXY_URLS (residential proxies)
# - FIRECRAWL_API_KEY (optional)
```

### 2. Add LinkedIn Cookies
```bash
MONGO_URL="mongodb+srv://..." node scripts/check-linkedin-cookies.js
# Paste cookies when prompted
```

### 3. Start Server
```bash
npm run dev
```

### 4. Create Campaign
```bash
curl -X POST http://localhost:3011/api/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'tenant:key' | base64)" \
  -d @campaign.json
```

## 📊 Monitoring Commands

### Check Rate Limiter
```bash
curl "http://localhost:3011/api/admin/rate-limiter/stats?url=https://linkedin.com" \
  -H "Authorization: Basic ..."
```

### Check Proxy Health
```bash
curl http://localhost:3011/api/admin/proxies/stats \
  -H "Authorization: Basic ..."
```

### View Campaign Status
```bash
curl http://localhost:3011/api/campaigns/{id} \
  -H "Authorization: Basic ..."
```

### Export Leads
```bash
curl http://localhost:3011/api/campaigns/{id}/export \
  -H "Authorization: Basic ..." > leads.csv
```

## 🔧 Admin Operations

### Reset Rate Limiter
```bash
curl -X POST http://localhost:3011/api/admin/rate-limiter/reset \
  -H "Authorization: Basic ..." \
  -d '{"url": "https://linkedin.com"}'
```

### Reset Proxy
```bash
curl -X POST http://localhost:3011/api/admin/proxies/reset \
  -H "Authorization: Basic ..." \
  -d '{"proxyUrl": "http://proxy1:8080"}'
```

### Check Backend Logs
```bash
tail -f /tmp/crawlee-backend.log
```

## ⚡ Performance Targets

| Metric | Expected Value |
|--------|----------------|
| Requests/Hour | 6-10 |
| Leads/Day | 50-100 |
| Min Delay | 10 minutes |
| HTTP 429 Rate | <5% |

## 🛠️ Troubleshooting

### HTTP 429 Errors
1. Check rate limiter: Still enforcing delays?
2. Rotate proxies: All marked healthy?
3. Refresh cookies: Still valid?
4. Increase delays: Edit `rateLimiter.ts`

### No Content Extracted
1. Analyze with AI: `/api/strategies/analyze`
2. Check selectors: Inspect in browser
3. Check timing: Increase wait times

### Proxy Failures
1. Check stats: `/api/admin/proxies/stats`
2. Test proxy directly: `curl --proxy ...`
3. Contact proxy provider
4. Reset proxy: `/api/admin/proxies/reset`

## 📝 Important Files

```
crawlee/
├── src/
│   ├── services/crawl/
│   │   ├── rateLimiter.ts      # Rate limiting logic
│   │   ├── proxyRotator.ts     # Proxy management
│   │   └── crawlers.ts         # Main scraping engine
│   └── routes/
│       └── admin.ts            # Monitoring endpoints
├── scripts/
│   ├── check-linkedin-cookies.js  # Cookie management
│   └── test-linkedin-direct.ts    # Direct browser test
└── docs/
    └── LINKEDIN_PRODUCTION.md     # Full documentation
```

## 🎯 Campaign JSON Template

```json
{
  "name": "LinkedIn Search - {Target}",
  "platform": "linkedin",
  "seedUrls": [
    "https://www.linkedin.com/search/results/people/?keywords={query}"
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
}
```

## 💡 Pro Tips

1. **Always use residential proxies** - Datacenter IPs get blocked instantly
2. **Start with 1-2 requests** - Test before scaling
3. **Monitor rate limiter stats** - Catch issues early
4. **Refresh cookies weekly** - Prevent authentication failures
5. **Run during business hours** - Mimic human behavior

## 🆘 Support

- Full docs: `docs/LINKEDIN_PRODUCTION.md`
- Cookie tool: `node scripts/check-linkedin-cookies.js`
- Health check: `curl http://localhost:3011/health`
- Logs: `tail -f /tmp/crawlee-backend.log`
