# Crawlee Server - AI Agent Instructions

## Architecture Overview

This is a **production-ready multi-tenant scraping service** that orchestrates Crawlee crawlers via Agenda job queues, with MongoDB persistence and CSV export capabilities. The system integrates with:
- **Firecrawl API** (https://firecrawlapi.techpranee.com) - External scraping service
- **Hosted Ollama** (https://ollama2.havenify.ai) - AI inference for content processing
- **MongoDB** - Data persistence and job queue storage

### Core Components

```
REST API (Express) → Agenda Job Queue → Crawlee Crawlers (Playwright/Cheerio)
       ↓                    ↓                       ↓
   MongoDB (data)    Storage volumes        CSV Export (json2csv)
```

## Key Architectural Patterns

### Multi-Tenant Design
- Every request requires `tenantId` via middleware (`src/middleware/tenant.ts`)
- Auth supports both API keys and Basic Auth (fallback for dev)
- Models use compound indexes: `{ tenantId: 1, ... }`
- Use `getTenant(req)` helper in routes for tenant context

### Job Orchestration
- **Agenda** handles async tasks with MongoDB persistence (`src/jobs/agenda.ts`)
- Two main job types: `scrape:crawl` and `enrich:contacts`
- Jobs create `Task` documents for tracking and UI monitoring
- Concurrency controlled by `MAX_CONCURRENCY` env var

### Campaign Lifecycle
1. **Create** via `/api/campaigns` (validates with Zod schemas)
2. **Queue** scraping job automatically
3. **Process** via Crawlee with strategy auto-detection
4. **Normalize** extracted data into Company/Contact models
5. **Export** as streaming CSV via `/api/campaigns/:id/export`

## Development Conventions

### Model Patterns
- All models use `tenantId` for isolation
- MongoDB ObjectIds converted to strings in API responses via `serializeCampaign()`
- Timestamps handled by Mongoose `{ timestamps: true }`
- Use `Types.ObjectId.isValid()` for validation

### Route Structure
- `/api/*` - Authenticated tenant routes with rate limiting
- `/svc/*` - Service endpoints (also authenticated)
- `/health`, `/ready`, `/metrics` - Infrastructure endpoints
- Middleware order: `apiLimiter` → `tenantMiddleware` → `idempotencyMiddleware`

### Error Handling
- Structured logging with `logger` from `src/utils/logger.ts`
- Prometheus metrics in `src/utils/metrics.ts`
- Global error handler in `src/middleware/errors.ts`
- Idempotency keys prevent duplicate operations

### Crawling Strategy
- **Auto-detection**: Tries Playwright first, falls back to Cheerio
- **Playwright**: Full browser with cookies, auth, JS execution
- **Cheerio**: Fast server-side DOM parsing
- Selectors defined in campaign config for targeted extraction
- Cookie authentication for Apollo/Zoom integrations

## Environment Configuration

Critical environment variables (see `src/config/env.ts`):
```bash
MONGO_URL=mongodb://localhost:27017/crawlee
OLLAMA_URL=https://ollama2.havenify.ai
FIRECRAWL_API_URL=https://firecrawlapi.techpranee.com
MAX_CONCURRENCY=2
PROXY_URL=optional_proxy
```

## Development Workflow

### Local Development
```bash
npm run dev  # Starts with hot reload
# Jobs run in-process once MongoDB connects
# API available at http://localhost:3011
```

### Adding New Job Types
1. Create handler in `src/jobs/handlers/`
2. Define job in `src/jobs/agenda.ts`
3. Add route to trigger job
4. Update Task model if needed

### Adding New Routes
1. Create router in `src/routes/`
2. Add Zod schemas in `src/types/api.ts`
3. Wire up in `src/app.ts`
4. Apply tenant middleware for authenticated routes

## Integration Points

### External Services
- **Firecrawl**: Use for complex JS-heavy sites
- **Ollama**: Content processing and AI inference
- **MongoDB**: Single source of truth for all data

### Data Flow
1. Campaign creation → Task scheduling
2. Agenda picks up jobs → Crawlee execution
3. Raw extractions → Normalization service
4. Persist to Company/Contact models
5. Export via streaming CSV

## Testing & Monitoring

- Health checks: `/health` (basic), `/ready` (dependencies)
- Metrics: `/metrics` (Prometheus format)
- Job monitoring via Task documents and Agenda UI
- Structured logging for debugging crawl issues