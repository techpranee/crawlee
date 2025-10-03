import { Router } from 'express';
import { Types } from 'mongoose';

import { runCrawl } from '../services/crawl/crawlers';
import { normalizeExtraction } from '../services/crawl/normalize';
import { createScrapeSchema } from '../types/api';
import { logger } from '../utils/logger';
import type { CampaignDocument } from '../db/models/Campaign';
import type { TenantDocument } from '../db/models/Tenant';

function buildStubCampaign(
  payload: ReturnType<typeof createScrapeSchema.parse>,
): CampaignDocument & { _id: Types.ObjectId } {
  return {
    _id: new Types.ObjectId(),
    name: payload.name,
    description: payload.description,
    source: payload.source,
    query: payload.query,
    seedUrls: payload.seedUrls ?? [],
    strategy: payload.strategy,
    selectors: payload.selectors ?? {},
    waitFor: payload.waitFor,
    headers: payload.headers ?? {},
    auth: payload.auth ?? null,
    status: 'queued',
    maxItems: payload.maxItems,
    stats: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CampaignDocument & { _id: Types.ObjectId };
}

export function createScrapeRouter() {
  const router = Router();

  router.post('/playwright', async (req, res, next) => {
    const parsed = createScrapeSchema.safeParse({ ...req.body, strategy: 'playwright' });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const stubCampaign = buildStubCampaign(parsed.data);
      const tenant = (req as typeof req & { tenant?: TenantDocument }).tenant;
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const result = await runCrawl({
        campaign: stubCampaign,
        strategy: 'playwright',
        tenant,
      });

      const normalized = result.items
        .map((raw) => normalizeExtraction(stubCampaign, raw))
        .filter((item): item is NonNullable<ReturnType<typeof normalizeExtraction>> => Boolean(item));

      res.json({
        contacts: normalized.map((entry) => ({
          ...entry.contact,
          company: entry.company?.name ?? entry.contact.company,
        })),
        companies: normalized
          .filter((entry) => entry.company)
          .map((entry) => ({
            ...entry.company,
          })),
        errors: result.errors,
      });
    } catch (error) {
      logger.error({ err: error }, 'Playwright scrape failed');
      next(error);
    }
  });

  router.post('/cheerio', async (req, res, next) => {
    const parsed = createScrapeSchema.safeParse({ ...req.body, strategy: 'cheerio' });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const stubCampaign = buildStubCampaign(parsed.data);
      const tenant = (req as typeof req & { tenant?: TenantDocument }).tenant;
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const result = await runCrawl({
        campaign: stubCampaign,
        strategy: 'cheerio',
        tenant,
      });

      const normalized = result.items
        .map((raw) => normalizeExtraction(stubCampaign, raw))
        .filter((item): item is NonNullable<ReturnType<typeof normalizeExtraction>> => Boolean(item));

      res.json({
        contacts: normalized.map((entry) => ({
          ...entry.contact,
          company: entry.company?.name ?? entry.contact.company,
        })),
        companies: normalized
          .filter((entry) => entry.company)
          .map((entry) => ({
            ...entry.company,
          })),
        errors: result.errors,
      });
    } catch (error) {
      logger.error({ err: error }, 'Cheerio scrape failed');
      next(error);
    }
  });

  return router;
}
