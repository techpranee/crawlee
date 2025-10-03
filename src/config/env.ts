import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

import pkg from '../../package.json';

loadEnv();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3011),
    MONGO_URL: z.string().min(1),
    AGENDA_COLLECTION: z.string().min(1).default('jobs'),
    MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
    NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
    PROXY_URL: z.preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      return trimmed;
    }, z.string().url().optional()),
    PROXY_URLS: z.preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      // Support comma-separated list of proxy URLs
      return trimmed.split(',').map(url => url.trim()).filter(url => url.length > 0);
    }, z.array(z.string().url()).optional()),
    PROXY_ROTATION: z.enum(['random', 'round-robin']).optional().default('random'),
    CRAWLEE_STORAGE_DIR: z.string().default('./storage'),
    EXPORT_DIR: z.string().default('./exports'),
    OLLAMA_URL: z
      .string()
      .url()
      .default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('llama3.1'),
    FIRECRAWL_API_URL: z
      .string()
      .url()
      .optional()
      .default('https://firecrawlapi.techpranee.com'),
    FIRECRAWL_API_KEY: z.string().optional(),
    IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    POLICY_CONFIG_PATH: z.string().optional(),
    DISABLE_AUTH: z
      .union([z.string(), z.boolean()])
      .optional()
      .transform((value) => {
        if (typeof value === 'boolean') {
          return value;
        }
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['1', 'true', 'yes', 'on'].includes(normalized)) {
            return true;
          }
        }
        return false;
      }),
  });

const parsed = envSchema.parse(process.env);

export const appConfig = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  mongoUrl: parsed.MONGO_URL,
  agendaCollection: parsed.AGENDA_COLLECTION,
  maxConcurrency: parsed.MAX_CONCURRENCY,
  navTimeoutMs: parsed.NAV_TIMEOUT_MS,
  requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  proxyUrl: parsed.PROXY_URL,
  proxyUrls: parsed.PROXY_URLS,
  proxyRotation: parsed.PROXY_ROTATION,
  crawleeStorageDir: parsed.CRAWLEE_STORAGE_DIR,
  exportDir: parsed.EXPORT_DIR,
  ollamaUrl: parsed.OLLAMA_URL,
  ollamaModel: parsed.OLLAMA_MODEL,
  firecrawlApiUrl: parsed.FIRECRAWL_API_URL,
  firecrawlApiKey: parsed.FIRECRAWL_API_KEY,
  idempotencyTtlSeconds: parsed.IDEMPOTENCY_TTL_SECONDS,
  policyConfigPath: parsed.POLICY_CONFIG_PATH,
  authDisabled: parsed.DISABLE_AUTH ?? false,
  version: pkg.version ?? '0.0.0',
} as const;

export type AppConfig = typeof appConfig;
