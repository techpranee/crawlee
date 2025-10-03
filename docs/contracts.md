# Services & Tools API Contracts

## Plain-Language ➜ Apollo URL

- **Endpoint:** `POST /svc/nl2apollo-url`
- **Request Body:** `{ "audience": string }`
- **Response:** `200 { "url": string, "filters": object }`

## Plain-Language ➜ LinkedIn Query

- **Endpoint:** `POST /svc/nl2linkedin-query`
- **Request Body:** `{ "audience": string }`
- **Response:** `200 { "query": string, "rationale": string }`

## Apollo Search

- **Endpoint:** `POST /svc/apollo/search`
- **Request Body:** `{ "url"?: string, "filters"?: object, "page"?: number, "size"?: number }`
- **Response:** `200 { "leads": ContactRaw[], "pagination": { "page": number, "size": number, "hasNext": boolean } }`

## ZoomInfo Search

- **Endpoint:** `POST /svc/zoom/search`
- **Request Body:** `{ "url"?: string, "filters"?: object, "page"?: number, "size"?: number }`
- **Response:** `200 { "leads": ContactRaw[], "pagination": { "page": number, "size": number, "hasNext": boolean } }`

## Lead Upsert

- **Endpoint:** `POST /svc/upsert/lead`
- **Request Body:** `{ "company": object | null, "contact": object, "tenantId": string, "campaignId"?: string }`
- **Response:** `200 { "companyId": string | null, "contactId": string, "dedupeKey": string }`

## Selector Suggestion

- **Endpoint:** `POST /svc/selector-suggest`
- **Request Body:** `{ "html"?: string, "url"?: string, "fields": string[] }`
- **Response:** `200 { "selectors": Record<string, string> }`

## HTML ➜ JSON Extraction

- **Endpoint:** `POST /svc/extract-llm`
- **Request Body:** `{ "html": string, "schema": object }`
- **Response:** `200 { "json": object, "confidence": number }`

## Email Enrichment

- **Endpoint:** `POST /svc/email/enrich`
- **Request Body:** `{ "first": string, "last": string, "domain": string }`
- **Response:** `200 { "guesses": string[], "status": "valid" | "invalid" | "unknown" }`

## Icebreaker

- **Endpoint:** `POST /svc/icebreaker`
- **Request Body:** `{ "contact": object, "company"?: object, "context"?: object }`
- **Response:** `200 { "text": string }`

## Rate Policy

- **Endpoint:** `GET /svc/policy`
- **Query Params:** `?domain=example.com`
- **Response:** `200 { "domain": string, "maxRPS": number, "delayMs": number, "jitter": number, "proxyPool": string[] }`

## Export (CSV)

- **Endpoint:** `GET /svc/export/campaign/:id.csv`
- **Query Params:** `fields=field1,field2&filter[key]=value`
- **Response:** CSV stream

## Export (Parquet)

- **Endpoint:** `GET /svc/export/campaign/:id.parquet`
- **Response:** Parquet file stream

## Job Submitters

- **Endpoints:**
  - `POST /svc/jobs/scrape` → `{ "campaignId": string }`
  - `POST /svc/jobs/enrich` → `{ "campaignId": string }`
- **Response:** `202 { "jobId": string }`

## Metrics & Health

- **Endpoint:** `GET /metrics` (Prometheus text)
- **Endpoint:** `GET /ready`
- **Endpoint:** `GET /health`
