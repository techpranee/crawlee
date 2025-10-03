# How to Add Proxy URLs - Step-by-Step Guide

## 📋 Quick Setup

### Option A: Single Proxy

If you have just one proxy, uncomment and update the `PROXY_URL` line in `.env`:

```bash
# Change this:
PROXY_URL=

# To this (with your actual credentials):
PROXY_URL=http://your-username:your-password@proxy-server.com:8080
```

### Option B: Multiple Proxies (Recommended for LinkedIn)

For better distribution and avoiding blocks, use multiple proxies:

```bash
# Add these lines to your .env file:
PROXY_URLS=http://user:pass@proxy1.example.com:8080,http://user:pass@proxy2.example.com:8080,http://user:pass@proxy3.example.com:8080
PROXY_ROTATION=random
```

**Note**: Proxies are comma-separated, no spaces between them!

---

## 🎯 Real Examples by Provider

### BrightData Example

```bash
# After signing up at brightdata.com, you'll get:
# - Username: brd-customer-xxxxx-zone-residential
# - Password: your_password
# - Host: brd.superproxy.io
# - Port: 22225

PROXY_URLS=http://brd-customer-xxxxx-zone-residential:your_password@brd.superproxy.io:22225
PROXY_ROTATION=random
```

**For multiple BrightData IPs** (rotating automatically):
```bash
# BrightData rotates IPs automatically, so you can use the same URL
# But if you have multiple zones:
PROXY_URLS=http://user-zone-residential1:pass@brd.superproxy.io:22225,http://user-zone-residential2:pass@brd.superproxy.io:22225
PROXY_ROTATION=random
```

### Smartproxy Example

```bash
# After signing up at smartproxy.com:
# - Username: your-username
# - Password: your-password  
# - Host: gate.smartproxy.com
# - Port: 7000 (or 10000 for sticky sessions)

PROXY_URLS=http://your-username:your-password@gate.smartproxy.com:7000
PROXY_ROTATION=random
```

**For session control** (sticky IPs):
```bash
# Add session ID to username for sticky sessions (30 min)
PROXY_URLS=http://your-username-session-abc123:your-password@gate.smartproxy.com:10000,http://your-username-session-xyz789:your-password@gate.smartproxy.com:10000
PROXY_ROTATION=round-robin
```

### Oxylabs Example

```bash
# After signing up at oxylabs.io:
# - Username: customer-your_username
# - Password: your_password
# - Host: pr.oxylabs.io (residential) or dc.oxylabs.io (datacenter)
# - Port: 7777

PROXY_URLS=http://customer-your_username:your_password@pr.oxylabs.io:7777
PROXY_ROTATION=random
```

**For geo-targeting**:
```bash
# Add country code to username
PROXY_URLS=http://customer-your_username-cc-us:your_password@pr.oxylabs.io:7777,http://customer-your_username-cc-gb:your_password@pr.oxylabs.io:7777
PROXY_ROTATION=random
```

### Generic HTTP Proxy Example

```bash
# If you have your own proxy server or a different provider:
PROXY_URLS=http://username:password@proxy-server-1.com:8080,http://username:password@proxy-server-2.com:3128
PROXY_ROTATION=random
```

---

## 🔐 Security Notes

### If Your Password Has Special Characters

Proxy passwords with special characters need URL encoding:

```bash
# If password is: myP@ss#123
# You need to encode it as: myP%40ss%23123

# Common encodings:
# @ → %40
# # → %23
# $ → %24
# & → %26
# + → %2B
# / → %2F
# : → %3A
# = → %3D
# ? → %3F

# Example:
PROXY_URL=http://user:myP%40ss%23123@proxy.com:8080
```

### Testing Your Proxy

Before adding to `.env`, test your proxy works:

```bash
# Test with curl:
curl --proxy http://username:password@proxy-server.com:8080 https://api.ipify.org?format=json

# Should return a different IP than your real one
```

---

## 📝 Complete .env Example

Here's what your `.env` should look like after adding proxies:

```bash
NODE_ENV=production
PORT=3011
MONGO_URL=mongodb+srv://...

# LinkedIn scraping requires MULTIPLE residential proxies
PROXY_URLS=http://user1:pass1@proxy1.brightdata.com:22225,http://user2:pass2@proxy2.smartproxy.com:7000,http://user3:pass3@proxy3.oxylabs.io:7777
PROXY_ROTATION=random

# Alternative: Single proxy (not recommended for LinkedIn)
# PROXY_URL=http://user:pass@proxy.com:8080

# Other config...
OLLAMA_URL=https://ollama2.havenify.ai/
FIRECRAWL_API_URL=https://firecrawlapi.techpranee.com
```

---

## ✅ Verification Steps

### Step 1: Add proxies to .env

```bash
# Edit your .env file
nano /Users/mohanpraneeth/Desktop/Coding/crawlee/.env

# Add your PROXY_URLS line
```

### Step 2: Restart the backend

```bash
cd /Users/mohanpraneeth/Desktop/Coding/crawlee
pkill -f "npm run dev"
sleep 2
npm run dev > /tmp/crawlee-backend.log 2>&1 &
```

### Step 3: Check proxy stats

```bash
# Wait 5 seconds for startup
sleep 5

# Check if proxies are loaded
curl -s "http://localhost:3011/api/admin/proxies/stats" \
  -H "Authorization: Basic $(echo -n 'test-tenant:test-key' | base64)" | jq .
```

**Expected output:**
```json
{
  "success": true,
  "stats": {
    "totalProxies": 3,
    "healthyProxies": 3,
    "rotation": "random",
    "proxies": [
      {
        "url": "***:***@proxy1.brightdata.com",
        "isHealthy": true,
        "successCount": 0,
        "failureCount": 0
      },
      ...
    ]
  }
}
```

### Step 4: Test with a campaign

```bash
# Create test campaign
curl -X POST http://localhost:3011/api/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'test-tenant:test-key' | base64)" \
  -d '{
    "name": "Proxy Test",
    "platform": "linkedin",
    "seedUrls": ["https://www.linkedin.com/feed/"],
    "auth": "linkedin",
    "maxItems": 1
  }'
```

### Step 5: Monitor logs

```bash
# Watch for proxy usage
tail -f /tmp/crawlee-backend.log | grep -i proxy
```

You should see logs like:
```
[INFO] Using proxy configuration for LinkedIn scraping
  proxyCount: 3
  rotation: "random"
[INFO] Selected proxy for request
  proxyUrl: "***:***@proxy1.brightdata.com"
  strategy: "random"
```

---

## 🚨 Troubleshooting

### Problem: "totalProxies: 0" in stats

**Cause**: Proxies not configured or wrong format

**Solution**:
1. Check `.env` has `PROXY_URLS=...` (not commented out)
2. Ensure no spaces between URLs in comma-separated list
3. Restart backend after editing `.env`

### Problem: "All proxies unhealthy"

**Cause**: Proxy authentication failed or IPs blocked

**Solution**:
```bash
# Test each proxy manually:
curl --proxy http://user:pass@proxy1.com:8080 https://api.ipify.org

# If fails, check:
# 1. Username/password correct?
# 2. Special characters URL-encoded?
# 3. Account has credit/bandwidth?
# 4. IP whitelist configured (some providers require this)?
```

### Problem: Proxies work but still getting HTTP 429

**Cause**: LinkedIn detected pattern even with proxies

**Solution**:
1. Ensure rate limiter is working (check delays)
2. Use MORE proxies (5-10 instead of 2-3)
3. Ensure proxies are RESIDENTIAL not datacenter
4. Increase delays (already at 10 min minimum)

---

## 💰 Cost Breakdown

### Recommended Setup for LinkedIn (50-100 leads/day)

| Provider | Monthly Cost | Bandwidth | IPs | Best For |
|----------|-------------|-----------|-----|----------|
| **BrightData** | $50-100 | 5-10GB | Rotating | Best quality |
| **Smartproxy** | $75 | 5GB | Rotating | Best value |
| **Oxylabs** | $300 | 20GB | Rotating | Enterprise |

**My Recommendation**: Start with **Smartproxy** ($75/month, 5GB)
- Good balance of cost and quality
- Easy to set up
- Sufficient for 1,500-2,000 leads/month

---

## 📞 Need Help?

If you get stuck:

1. **Check provider docs**:
   - BrightData: https://docs.brightdata.com/
   - Smartproxy: https://help.smartproxy.com/
   - Oxylabs: https://developers.oxylabs.io/

2. **Test proxy works**:
   ```bash
   curl --proxy http://user:pass@proxy.com:8080 https://api.ipify.org
   ```

3. **Check backend logs**:
   ```bash
   tail -50 /tmp/crawlee-backend.log
   ```

4. **Verify in admin stats**:
   ```bash
   curl "http://localhost:3011/api/admin/proxies/stats" -H "Authorization: Basic ..."
   ```

---

**Next**: Once proxies are configured, add LinkedIn cookies with:
```bash
node scripts/check-linkedin-cookies.js
```
