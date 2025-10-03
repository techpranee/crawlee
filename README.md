# Crawlee Server

Production-ready Crawlee scraping server with asynchronous campaign management, MongoDB storage, Agenda-powered job orchestration, and CSV export utilities. Deploy locally or through Docker Compose / Portainer.

```
+---------------+     +-------------------+     +---------------------+
| REST API      | --> | Agenda Job Queue  | --> | Crawlee Crawlers    |
| (Express)     |     | (scrape/enrich)   |     | (Playwright/Cheerio)|
+-------+-------+     +---------+---------+     +----------+----------+
        |                       |                         |
        v                       v                         v
+-------+--------+     +-----------------+     +-----------------------+
| MongoDB (data) |     | Storage volumes |     | CSV Export (json2csv) |
+----------------+     +-----------------+     +-----------------------+
```

## Features

- Campaign lifecycle API with validation, basic auth (optional), rate limiting, and rollup stats.
- Background scraping and enrichment tasks using Agenda with Mongo-backed persistence.
- Playwright and Cheerio Crawlee pipelines with proxy, cookie, timeout, and selector support.
- Normalized company/contact persistence, enrichment heuristics, and CSV streaming export.
- Docker Compose stack (MongoDB + server) ready for Portainer deployments.
- Services layer for NL → filters, search adapters, selector assistance, email heuristics, and exporter utilities.
- Multi-tenant API-key enforcement, idempotency keys, and Prometheus metrics (`/metrics`, `/ready`).

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 6+ (local or remote)
- npm 9+

### Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

The dev server listens on `http://localhost:3011`. Agenda jobs run in-process once MongoDB is reachable.

### Production Build

```bash
npm run build
npm start
```

### Docker Compose

```bash
docker compose up -d --build
```

Volumes `crawlee_storage` and `exports` persist crawler artifacts and CSV downloads.

### Frontend Dashboard

```bash
cd client
npm install
npm run dev
```

The Vite dev server proxies `/api/*` and `/svc/*` to `http://localhost:3011`. Configure your base URL, API key, and optional Basic Auth from the **Connection Settings** button in the UI.

### Portainer Deployment

1. Open Portainer → *Stacks* → *Add stack*.
2. Name the stack (e.g., `crawlee-server`).
3. Paste the contents of `docker-compose.yml`.
4. Adjust environment variables / secrets as needed.
5. Deploy the stack and monitor health via `/health`.

## Configuration

All configuration is driven by environment variables.

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` | `development` |
| `PORT` | HTTP port for the API server | `3011` |
| `MONGO_URL` | Mongo connection string (MongoDB replica or standalone) | `mongodb://mongo:27017/crawlee` |
| `AGENDA_COLLECTION` | Mongo collection used by Agenda | `jobs` |
| `MAX_CONCURRENCY` | Crawlee concurrency per crawler | `2` |
| `NAV_TIMEOUT_MS` | Navigation timeout for Crawlee | `45000` |
| `REQUEST_TIMEOUT_MS` | Request timeout for Crawlee | `45000` |
| `PROXY_URL` | Optional HTTP proxy for crawlers | — |
| `CRAWLEE_STORAGE_DIR` | Directory for Crawlee storage (datasets, queues) | `./storage` |
| `EXPORT_DIR` | Directory for CSV exports | `./exports` |
| `OLLAMA_URL` | Base URL for local Ollama API | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name for NL/LLM helpers | `llama3.1` |
| `IDEMPOTENCY_TTL_SECONDS` | Expiration for stored idempotency responses | `86400` |
| `POLICY_CONFIG_PATH` | Path to rate-limit policy JSON | `./config/policies.json` |

Notes:

- Provide `PROXY_URL` (e.g., `http://user:pass@proxy:8000`) to route all scraper traffic.
- Respect third-party ToS and applicable scraping laws when configuring campaigns.

### Tenant configuration

Authentication credentials and partner cookies are stored per-tenant in MongoDB. Seed the `tenants` collection with entries like:

```js
db.tenants.insertOne({
  name: 'Acme Inc.',
  apiKey: 'tenant-acme-key',
  basicAuthUser: 'acme-user',
  basicAuthPass: 'super-secret-pass',
  apolloCookie: 'APOLLO_SESSION=...',
  zoomCookie: 'ZOOM_SESSION=...',
  createdAt: new Date(),
  updatedAt: new Date()
});
```

Every request must include the tenant's `X-Api-Key` header and matching HTTP Basic credentials. The frontend `/auth` view stores these values locally and forwards them with each API call.

## API Overview

### Healthcheck

```bash
curl http://localhost:3011/health
```

### Create Campaign

```bash
curl -u acme-user:super-secret-pass -X POST http://localhost:3011/api/campaigns \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: tenant-acme-key' \
  -d '{
    "name": "VPs in SF",
    "source": "linkedin",
    "query": { "titles": ["VP"] },
    "seedUrls": ["https://example.com"],
    "maxItems": 50,
    "strategy": "auto"
  }'
```

### Check Campaign Status

```bash
curl -u acme-user:super-secret-pass -H 'X-Api-Key: tenant-acme-key' \
  http://localhost:3011/api/campaigns/<campaignId>
```

### List Contacts (paginated)

```bash
curl -u acme-user:super-secret-pass \
  -H 'X-Api-Key: tenant-acme-key' \
  'http://localhost:3011/api/campaigns/<campaignId>/contacts?limit=50&enriched=true'
```

### Trigger Enrichment

```bash
curl -u acme-user:super-secret-pass \
  -H 'X-Api-Key: tenant-acme-key' \
  -X POST http://localhost:3011/api/campaigns/<campaignId>/run-enrichment
```

### Download CSV Export

```bash
curl -u acme-user:super-secret-pass \
  -H 'X-Api-Key: tenant-acme-key' \
  -L -o campaign.csv \
  http://localhost:3011/api/campaigns/<campaignId>/export.csv
```

### Ad-hoc Scrape (Cheerio)

```bash
curl -u acme-user:super-secret-pass -H 'X-Api-Key: tenant-acme-key' \
  -X POST http://localhost:3011/api/scrape/cheerio \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "test-run",
    "source": "custom",
    "seedUrls": ["https://example.com"],
    "strategy": "cheerio"
  }'
```

### Services & Tools Layer

- `POST /svc/nl2apollo-url` – Convert plain language audiences into Apollo filter URLs.
- `POST /svc/nl2linkedin-query` – Produce boolean LinkedIn / Google search strings.
- `POST /svc/apollo/search` & `/svc/zoom/search` – Query normalized leads for a tenant with pagination.
- `POST /svc/upsert/lead` – Tenant-aware dedupe + upsert for contact/company pairs.
- `POST /svc/selector-suggest` / `/svc/extract-llm` – Selector recommendations and HTML → JSON fallback.
- `POST /svc/email/enrich` & `/svc/icebreaker` – Email heuristics (with MX lookups) and Ollama-backed messaging.
- `GET /svc/policy` – Retrieve crawl policy (`maxRPS`, delay, proxy pools).
- `GET /svc/export/campaign/:id.{csv|parquet}` – High-volume streaming exporters with field selection and filters.
- `POST /svc/jobs/{scrape|enrich}` – Thin Agenda submitters with DLQ-friendly payloads.

## Enrichment & Email Verification

The enrichment job runs heuristics for contacts lacking `email_status` or `icebreaker`:

- Generates email guesses using `first.last@domain` when company domain is known.
- Marks `email_status` as `unknown` by default (extend with MX/SMTP checks as desired).
- Adds a templated icebreaker string for use in outreach tooling.

## Storage & Artifacts

- Crawlee uses `CRAWLEE_STORAGE_DIR` for datasets, request queues, and logs. Mount/persist this dir for portability.
- CSV exports stream directly from Mongo via `json2csv` and do not load entire datasets into memory.
- `GET /api/campaigns/:id/artifacts` returns dataset IDs stored in Crawlee storage for external inspection.

## Legal & Operational Considerations

- Ensure you have rights to scrape target domains. Respect robots.txt, rate limits, captcha policies, and data privacy regulations.
- Configure `PROXY_URL` and concurrency/timeouts responsibly to avoid IP blocking.
- Store tenant credentials (Basic Auth secrets, Apollo/Zoom cookies) securely and rotate them regularly.

## Scripts

- `npm run dev` – Start the TypeScript server with `ts-node`.
- `npm run build` – Compile the project with `tsup`.
- `npm start` – Run the compiled server (`dist/server.js`).
- `npm run lint` – Lint the codebase with ESLint.
- `npm run format` – Format source files with Prettier.

Happy crawling!
