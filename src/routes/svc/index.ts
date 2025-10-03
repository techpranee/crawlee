// @ts-nocheck
import { Router } from 'express';
import type Agenda from 'agenda';
import { Types } from 'mongoose';

import { audienceToApollo, audienceToLinkedin } from '../../services/nlp/audience';
import { searchContacts } from '../../services/lead/search';
import { normalizeLead, type NormalizedLead } from '../../services/lead/normalizer';
import { upsertLead } from '../../services/lead/upsert';
import { suggestSelectors } from '../../services/extraction/selectorSuggest';
import { extractHtmlToJson } from '../../services/extraction/htmlToJson';
import { enrichEmail } from '../../services/email/enrich';
import { generateIcebreaker } from '../../services/nlp/icebreaker';
import { getPolicy } from '../../services/policy';
import {
  DEFAULT_FIELDS,
  streamContactsAsCsv,
  streamContactsAsParquet,
} from '../../services/exporter/contactExporter';
import { CampaignModel } from '../../db/models/Campaign';
import { TaskModel } from '../../db/models/Task';

interface SvcRouterDeps {
  agenda: Agenda;
}

function parseFiltersFromUrl(url: string): Record<string, unknown> | undefined {
  try {
    const parsed = new URL(url);
    const filters = parsed.searchParams.get('filters');
    if (filters) {
      return JSON.parse(filters);
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
}

function parseFilterQuery(query: Record<string, unknown>): Record<string, string> {
  const filter: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('filter[') && key.endsWith(']') && typeof value === 'string') {
      const field = key.slice(7, -1);
      filter[field] = value;
    }
  }
  return filter;
}

export function createSvcRouter({ agenda }: SvcRouterDeps) {
  const router = Router();

  router.post('/nl2apollo-url', async (req, res, next) => {
    try {
      const { audience } = req.body ?? {};
      if (!audience || typeof audience !== 'string') {
        return res.status(400).json({ error: 'audience is required' });
      }
      const result = await audienceToApollo(audience);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/nl2linkedin-query', async (req, res, next) => {
    try {
      const { audience } = req.body ?? {};
      if (!audience || typeof audience !== 'string') {
        return res.status(400).json({ error: 'audience is required' });
      }
      const result = await audienceToLinkedin(audience);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/apollo/search', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { url, filters, page, size } = req.body ?? {};
      const parsedFilters = filters ?? (typeof url === 'string' ? parseFiltersFromUrl(url) : undefined);
      const result = await searchContacts({
        tenantId: req.tenantId,
        filters: parsedFilters as Record<string, unknown>,
        page,
        size,
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/zoom/search', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { url, filters, page, size } = req.body ?? {};
      const parsedFilters = filters ?? (typeof url === 'string' ? parseFiltersFromUrl(url) : undefined);
      const mergedFilters = {
        ...(parsedFilters || {}),
        source: ['zoom'],
      };
      const result = await searchContacts({
        tenantId: req.tenantId,
        filters: mergedFilters as Record<string, unknown>,
        page,
        size,
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/upsert/lead', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { company, contact, campaignId } = req.body ?? {};
      if (!contact) {
        return res.status(400).json({ error: 'contact payload is required' });
      }

      let campaignObjectId: Types.ObjectId | undefined;
      if (campaignId) {
        if (typeof campaignId !== 'string' || campaignId.length !== 24) {
          return res.status(400).json({ error: 'Invalid campaignId' });
        }
        const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId: req.tenantId })
          .select('_id tenantId')
          .lean();
        if (!campaign) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        campaignObjectId = campaign._id as Types.ObjectId;
      }

      let normalized: NormalizedLead | null;
      if (contact && typeof contact === 'object' && 'source' in (contact as Record<string, unknown>)) {
        normalized = {
          company: (company as NormalizedLead['company']) ?? null,
          contact: contact as NormalizedLead['contact'],
        };
      } else {
        normalized = normalizeLead('manual', { ...(company ?? {}), ...(contact ?? {}) });
      }
      if (!normalized) {
        return res.status(400).json({ error: 'Unable to normalize lead payload' });
      }

      if (!normalized.contact.source) {
        normalized.contact.source = 'manual';
      }

      const result = await upsertLead({
        tenantId: req.tenantId,
        campaignId: campaignObjectId,
        company: normalized.company,
        contact: normalized.contact,
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/selector-suggest', async (req, res, next) => {
    try {
      const { html, url, fields } = req.body ?? {};
      if ((!html && !url) || !Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({ error: 'html or url and fields[] required' });
      }
      const result = await suggestSelectors({ html, url, fields });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/extract-llm', async (req, res, next) => {
    try {
      const { html, schema } = req.body ?? {};
      if (!html || !schema) {
        return res.status(400).json({ error: 'html and schema required' });
      }
      const result = await extractHtmlToJson({ html, schema });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/email/enrich', async (req, res, next) => {
    try {
      const { first, last, domain } = req.body ?? {};
      if (!first || !last || !domain) {
        return res.status(400).json({ error: 'first, last, domain required' });
      }
      const result = await enrichEmail({ first, last, domain });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/icebreaker', async (req, res, next) => {
    try {
      const { contact, company, context } = req.body ?? {};
      if (!contact) {
        return res.status(400).json({ error: 'contact is required' });
      }
      const result = await generateIcebreaker({ contact, company, context });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/policy', async (req, res, next) => {
    try {
      const { domain } = req.query;
      const policy = await getPolicy(typeof domain === 'string' ? domain : '');
      return res.json(policy);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/export/campaign/:id.csv', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid campaign id' });
      }

      const campaign = await CampaignModel.findOne({ _id: id, tenantId: req.tenantId })
        .select('_id')
        .lean();
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const fieldsParam = typeof req.query.fields === 'string' ? req.query.fields : undefined;
      const fields = fieldsParam ? fieldsParam.split(',').map((field) => field.trim()) : DEFAULT_FIELDS;
      const filter = parseFilterQuery(req.query as Record<string, unknown>);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.csv"`);
      await streamContactsAsCsv(res, {
        tenantId: req.tenantId,
        campaignId: campaign._id as Types.ObjectId,
        fields,
        filter,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/export/campaign/:id.parquet', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid campaign id' });
      }

      const campaign = await CampaignModel.findOne({ _id: id, tenantId: req.tenantId })
        .select('_id')
        .lean();
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const fieldsParam = typeof req.query.fields === 'string' ? req.query.fields : undefined;
      const fields = fieldsParam ? fieldsParam.split(',').map((field) => field.trim()) : DEFAULT_FIELDS;
      const filter = parseFilterQuery(req.query as Record<string, unknown>);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.parquet"`);
      await streamContactsAsParquet(res, {
        tenantId: req.tenantId,
        campaignId: campaign._id as Types.ObjectId,
        fields,
        filter,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/jobs/scrape', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { campaignId } = req.body ?? {};
      if (!campaignId || typeof campaignId !== 'string' || campaignId.length !== 24) {
        return res.status(400).json({ error: 'campaignId is required' });
      }

      const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId: req.tenantId });
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const task = await TaskModel.create({
        campaignId: campaign._id,
        tenantId: req.tenantId,
        type: 'scrape',
      });

      await agenda.now('scrape:crawl', {
        campaignId: campaign._id.toString(),
        taskId: task._id.toString(),
        tenantId: req.tenantId,
      });

      return res.status(202).json({ jobId: task._id.toString() });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/jobs/enrich', async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const { campaignId } = req.body ?? {};
      if (!campaignId || typeof campaignId !== 'string' || campaignId.length !== 24) {
        return res.status(400).json({ error: 'campaignId is required' });
      }

      const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId: req.tenantId });
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const task = await TaskModel.create({
        campaignId: campaign._id,
        tenantId: req.tenantId,
        type: 'enrich',
      });

      await agenda.now('enrich:contacts', {
        campaignId: campaign._id.toString(),
        taskId: task._id.toString(),
        tenantId: req.tenantId,
      });

      return res.status(202).json({ jobId: task._id.toString() });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
