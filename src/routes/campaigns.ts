import { Router, type Request } from 'express';
import type Agenda from 'agenda';
import { Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

import { CampaignModel, type CampaignDocument } from '../db/models/Campaign';
import { ContactModel, type ContactDocument } from '../db/models/Contact';
import { TaskModel, type TaskDocument } from '../db/models/Task';
import type { TenantDocument } from '../db/models/Tenant';
import {
  campaignIdParamSchema,
  createCampaignSchema,
  getContactsQuerySchema,
  type CreateCampaignInput,
} from '../types/api';
import { logger } from '../utils/logger';

interface CampaignRouterDeps {
  agenda: Agenda;
}

type TenantAwareRequest = Request & { tenantId?: string; tenant?: TenantDocument };

function getTenant(req: Request): TenantDocument | undefined {
  return (req as TenantAwareRequest).tenant;
}

function toObjectId(id: string) {
  return new Types.ObjectId(id);
}

function serializeCampaign(campaign: CampaignDocument | Record<string, unknown> | null) {
  if (!campaign) {
    return null;
  }
  const source = campaign as Record<string, unknown>;
  const { _id, __v, ...rest } = source;
  return { id: _id instanceof Types.ObjectId ? _id.toString() : String(_id), ...rest };
}

export function createCampaignRouter({ agenda }: CampaignRouterDeps) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const tenant = getTenant(req);
    if (!tenant) {
      return res.status(401).json({ error: 'Tenant context missing' });
    }
    const tenantId = tenant._id.toString();

    const payload: CreateCampaignInput = parsed.data;

    try {
      const campaign = await CampaignModel.create({
        ...payload,
        status: 'queued',
        tenantId,
      });

      const task = await TaskModel.create({
        campaignId: campaign._id,
        tenantId,
        type: 'scrape',
      });

      await agenda.now('scrape:crawl', {
        campaignId: campaign._id.toString(),
        taskId: task._id.toString(),
        tenantId,
      });

      res.status(201).json({ id: campaign._id.toString(), status: campaign.status });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create campaign');
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    const tenant = getTenant(req);
    if (!tenant) {
      return res.status(401).json({ error: 'Tenant context missing' });
    }
    const tenantId = tenant._id.toString();

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length === 24 ? req.query.cursor : undefined;

    try {
      const filter: Record<string, unknown> = { tenantId };
      if (cursor) {
        filter._id = { $lt: toObjectId(cursor) };
      }

      const docs = ((await CampaignModel.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean()
        .exec()) ?? []) as unknown as CampaignDocument[];

      const hasMore = docs.length > limit;
      const items = hasMore ? docs.slice(0, limit) : docs;
      const nextCursor = hasMore ? items[items.length - 1]?._id?.toString() : undefined;

      res.json({
        campaigns: items.map((campaign) => ({
          id: campaign._id.toString(),
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          source: campaign.source,
          maxItems: campaign.maxItems,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
          stats: campaign.stats,
        })),
        nextCursor,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    const params = campaignIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }
    const tenant = getTenant(req);
    if (!tenant) {
      return res.status(401).json({ error: 'Tenant context missing' });
    }
    const tenantId = tenant._id.toString();

    try {
      const campaign = (await CampaignModel.findOne({ _id: params.data.id, tenantId })
        .lean()
        .exec()) as CampaignDocument | null;
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const tasks = ((await TaskModel.find({ campaignId: params.data.id, tenantId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()) ?? []) as unknown as TaskDocument[];

      const summary = tasks.reduce(
        (acc, task) => {
          acc.total += 1;
          acc.byType[task.type] = (acc.byType[task.type] ?? 0) + 1;
          acc.byStatus[task.status] = (acc.byStatus[task.status] ?? 0) + 1;
          return acc;
        },
        {
          total: 0,
          byType: {} as Record<string, number>,
          byStatus: {} as Record<string, number>,
        },
      );

      const serialized = serializeCampaign(campaign);

      res.json({
        ...serialized,
        tasks: {
          summary,
          items: tasks.map((task) => ({
            id: task._id.toString(),
            type: task.type,
            status: task.status,
            startedAt: task.startedAt,
            finishedAt: task.finishedAt,
            stats: task.stats,
            error: task.error,
            createdAt: task.createdAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/contacts', async (req, res, next) => {
    const params = campaignIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }
    const query = getContactsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: query.error.flatten() });
    }

    try {
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const tenantId = tenant._id.toString();
      const campaignId = toObjectId(params.data.id);
      const campaignExists = await CampaignModel.exists({ _id: campaignId, tenantId });
      if (!campaignExists) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const filter: Record<string, unknown> = { campaignId, tenantId };
      if (query.data.enriched !== undefined) {
        filter.enriched = query.data.enriched;
      }

      if (query.data.q) {
        const regex = new RegExp(query.data.q, 'i');
        filter.$or = [
          { full_name: regex },
          { email: regex },
          { title: regex },
          { company: regex },
        ];
      }

      if (query.data.cursor) {
        filter._id = { $gt: toObjectId(query.data.cursor) };
      }

      const docs = ((await ContactModel.find(filter)
        .sort({ _id: 1 })
        .limit(query.data.limit + 1)
        .lean()
        .exec()) ?? []) as unknown as ContactDocument[];

      const hasNext = docs.length > query.data.limit;
      const items = hasNext ? docs.slice(0, query.data.limit) : docs;
      const nextCursor = hasNext ? items[items.length - 1]?._id?.toString() : undefined;

      res.json({
        contacts: items.map((doc) => ({
          id: doc._id.toString(),
          full_name: doc.full_name,
          first_name: doc.first_name,
          last_name: doc.last_name,
          title: doc.title,
          company: doc.company,
          email: doc.email,
          email_status: doc.email_status,
          phone: doc.phone,
          linkedin_url: doc.linkedin_url,
          source: doc.source,
          enriched: doc.enriched,
          icebreaker: doc.icebreaker,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })),
        nextCursor,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/artifacts', async (req, res, next) => {
    const params = campaignIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }

    try {
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const tenantId = tenant._id.toString();
      const campaign = (await CampaignModel.findOne({ _id: params.data.id, tenantId })
        .lean()
        .exec()) as CampaignDocument | null;
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const stats = campaign.stats as Record<string, unknown> | undefined;
      const datasetIds = Array.isArray(stats?.datasetIds) ? (stats?.datasetIds as string[]) : [];

      res.json({ datasetIds });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/dataset', async (req, res, next) => {
    const params = campaignIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }

    try {
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const tenantId = tenant._id.toString();
      const campaign = (await CampaignModel.findOne({ _id: params.data.id, tenantId })
        .lean()
        .exec()) as CampaignDocument | null;
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Get the dataset data from Crawlee's storage
      const stats = campaign.stats as Record<string, unknown> | undefined;
      const datasetIds = Array.isArray(stats?.datasetIds) ? (stats?.datasetIds as string[]) : [];
      
      if (datasetIds.length === 0) {
        return res.json({ items: [] });
      }

      // Read dataset files directly from storage
      const storageDir = path.join(process.cwd(), 'storage', 'datasets');
      
      // Check if storage directory exists
      if (!fs.existsSync(storageDir)) {
        logger.warn({ storageDir }, 'Storage directory does not exist');
        return res.json({ items: [] });
      }
      
      // Find dataset directory for this campaign
      const campaignIdStr = campaign._id.toString();
      const files = fs.readdirSync(storageDir);
      const datasetDir = files.find(dir => dir.startsWith(`campaign-${campaignIdStr}-`));
      
      if (!datasetDir) {
        logger.info({ campaignIdStr, availableDirs: files }, 'Dataset directory not found');
        return res.json({ items: [] });
      }
      
      const datasetPath = path.join(storageDir, datasetDir);
      const datasetFiles = fs.readdirSync(datasetPath).filter(f => f.endsWith('.json'));
      
      logger.info({ datasetPath, fileCount: datasetFiles.length }, 'Reading dataset files');
      
      const items = [];
      for (const file of datasetFiles) {
        const filePath = path.join(datasetPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
          const item = JSON.parse(content);
          items.push(item);
        } catch (parseError) {
          logger.warn({ file, error: parseError }, 'Failed to parse dataset file');
        }
      }
      
      res.json({ items });
    } catch (error) {
      logger.error({ err: error }, 'Failed to get dataset');
      // Return empty array instead of error to handle missing datasets gracefully
      res.json({ items: [] });
    }
  });

  router.post('/:id/run-enrichment', async (req, res, next) => {
    const params = campaignIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }

    try {
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant context missing' });
      }
      const tenantId = tenant._id.toString();
      const campaign = await CampaignModel.findOne({ _id: params.data.id, tenantId });
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const existingEnrichTask = await TaskModel.findOne({
        campaignId: params.data.id,
        tenantId,
        type: 'enrich',
        status: { $in: ['queued', 'running'] },
      });

      if (existingEnrichTask) {
        return res.status(202).json({
          message: 'Enrichment already queued or in progress',
          taskId: existingEnrichTask._id.toString(),
        });
      }

      const task = await TaskModel.create({
        campaignId: campaign._id,
        tenantId,
        type: 'enrich',
      });

      await agenda.now('enrich:contacts', {
        campaignId: campaign._id.toString(),
        taskId: task._id.toString(),
        tenantId,
      });

      res.status(202).json({ taskId: task._id.toString(), status: task.status });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
