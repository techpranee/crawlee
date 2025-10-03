import { Router, type Request } from 'express';
import type Agenda from 'agenda';
import { Types } from 'mongoose';

import { CampaignModel, type CampaignDocument } from '../db/models/Campaign';
import { TaskModel } from '../db/models/Task';
import type { TenantDocument } from '../db/models/Tenant';
import {
  campaignIdParamSchema,
  createJobSchema,
  updateJobSchema,
  jobControlSchema,
  type CreateJobInput,
  type UpdateJobInput,
  type JobControlInput,
} from '../types/api';
import { logger } from '../utils/logger';

interface JobRouterDeps {
  agenda: Agenda;
}

type TenantAwareRequest = Request & { tenantId?: string; tenant?: TenantDocument };

function getTenant(req: Request): TenantDocument | undefined {
  return (req as TenantAwareRequest).tenant;
}

function toObjectId(id: string) {
  return new Types.ObjectId(id);
}

function serializeJob(job: CampaignDocument | Record<string, unknown> | null): any {
  if (!job) {
    return null;
  }
  const source = job as any;
  const { _id, __v, tenantId, ...rest } = source;
  
  // Map backend status to frontend status
  let status = rest.status as string;
  if (status === 'done') status = 'completed';
  if (status === 'partial') status = 'failed';
  
  // Calculate success rate if we have stats
  const stats = rest.stats as any;
  const successRate = stats?.totalRequests > 0 
    ? Math.round(((stats.totalRequests - (stats.errors?.length || 0)) / stats.totalRequests) * 100)
    : 100;
  
  return { 
    id: _id instanceof Types.ObjectId ? _id.toString() : String(_id), 
    ...rest,
    status,
    successRate,
    progress: rest.progress || 0,
  };
}

// Calculate progress based on current status and stats
function calculateProgress(campaign: any): number {
  if (campaign.status === 'done') return 100;
  if (campaign.status === 'failed' || campaign.status === 'stopped') return 0;
  if (campaign.status === 'pending' || campaign.status === 'queued') return 0;
  
  // For running jobs, calculate based on requests processed
  const stats = campaign.stats as any;
  if (stats?.totalRequests && campaign.maxItems) {
    return Math.min(Math.round((stats.totalRequests / campaign.maxItems) * 100), 95);
  }
  
  return campaign.progress || 0;
}

export function createJobRouter({ agenda }: JobRouterDeps) {
  const router = Router();

  // GET /jobs - List all jobs
  router.get('/', async (req, res, next) => {
    try {
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant required' });
      }

      const campaigns = await CampaignModel.find({ tenantId: tenant._id.toString() })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      const jobs = campaigns.map(campaign => {
        const serialized = serializeJob(campaign);
        if (serialized) {
          serialized.progress = calculateProgress(campaign);
          // Add estimated completion for running jobs
          if (campaign.status === 'running' && (campaign.stats as any)?.startedAt) {
            const elapsed = Date.now() - new Date((campaign.stats as any).startedAt).getTime();
            const remaining = serialized.progress > 0 ? (elapsed / serialized.progress) * (100 - serialized.progress) : 0;
            serialized.estimatedCompletion = remaining > 0 ? `~${Math.round(remaining / 60000)} minutes` : null;
          }
        }
        return serialized;
      }).filter(Boolean);

      res.json({ jobs });
    } catch (error) {
      logger.error({ err: error }, 'Failed to list jobs');
      next(error);
    }
  });

  // GET /jobs/:id - Get job details
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = campaignIdParamSchema.parse(req.params);
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant required' });
      }

      const campaign = await CampaignModel.findOne({ 
        _id: toObjectId(id), 
        tenantId: tenant._id.toString() 
      }).lean().exec();

      if (!campaign) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = serializeJob(campaign as any);
      if (job) {
        job.progress = calculateProgress(campaign as any);
        
        // Get associated tasks
        const tasks = await TaskModel.find({ 
          campaignId: toObjectId(id),
          tenantId: tenant._id.toString()
        }).lean().exec();
        
        job.tasks = tasks.map((task: any) => ({
          id: task._id.toString(),
          type: task.type,
          status: task.status,
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          error: task.error,
          stats: task.stats,
        }));
      }

      res.json(job);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get job details');
      next(error);
    }
  });

  // POST /jobs - Create new job
  router.post('/', async (req, res, next) => {
    try {
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant required' });
      }

      const input: CreateJobInput = createJobSchema.parse(req.body);
      
      // Generate seed URLs from strategy if strategyId is provided
      let seedUrls = input.seedUrls || [];
      if (input.strategyId && input.strategyInputs) {
        // Here you would implement strategy template URL generation
        // For now, we'll use the provided seedUrls or generate a default one
        if (seedUrls.length === 0 && input.strategyInputs.profileUrl) {
          seedUrls = [input.strategyInputs.profileUrl];
        }
      }

      const campaign = new CampaignModel({
        ...input,
        seedUrls,
        tenantId: tenant._id.toString(),
        status: 'queued',
        progress: 0,
      });

      await campaign.save();

      // Queue the scraping job
      await agenda.now('scrape:crawl', {
        campaignId: campaign._id.toString(),
        tenantId: tenant._id.toString(),
      });

      const job = serializeJob(campaign.toObject());
      logger.info({ campaignId: campaign._id, tenantId: tenant._id }, 'Job created');

      res.status(201).json(job);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create job');
      next(error);
    }
  });

  // PUT /jobs/:id - Update job
  router.put('/:id', async (req, res, next) => {
    try {
      const { id } = campaignIdParamSchema.parse(req.params);
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant required' });
      }

      const input: UpdateJobInput = updateJobSchema.parse(req.body);
      
      const campaign = await CampaignModel.findOneAndUpdate(
        { _id: toObjectId(id), tenantId: tenant._id.toString() },
        input,
        { new: true, runValidators: true }
      ).exec();

      if (!campaign) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = serializeJob(campaign.toObject());
      res.json(job);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update job');
      next(error);
    }
  });

  // POST /jobs/:id/control - Control job (pause, resume, stop, restart)
  router.post('/:id/control', async (req, res, next) => {
    try {
      const { id } = campaignIdParamSchema.parse(req.params);
      const { action }: JobControlInput = jobControlSchema.parse(req.body);
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant required' });
      }

      const campaign = await CampaignModel.findOne({ 
        _id: toObjectId(id), 
        tenantId: tenant._id.toString() 
      }).exec();

      if (!campaign) {
        return res.status(404).json({ error: 'Job not found' });
      }

      let newStatus = campaign.status;
      switch (action) {
        case 'pause':
          if (campaign.status === 'running') {
            newStatus = 'paused';
          }
          break;
        case 'resume':
          if (campaign.status === 'paused') {
            newStatus = 'running';
          }
          break;
        case 'stop':
          if (['running', 'paused', 'queued'].includes(campaign.status)) {
            newStatus = 'stopped';
          }
          break;
        case 'restart':
          newStatus = 'queued';
          campaign.progress = 0;
          // Queue new job
          await agenda.now('scrape:crawl', {
            campaignId: campaign._id.toString(),
            tenantId: tenant._id.toString(),
          });
          break;
      }

      campaign.status = newStatus;
      await campaign.save();

      const job = serializeJob(campaign.toObject());
      if (job) {
        job.progress = calculateProgress(campaign.toObject());
      }

      logger.info({ campaignId: id, action, newStatus }, 'Job control action executed');
      res.json(job);
    } catch (error) {
      logger.error({ err: error }, 'Failed to control job');
      next(error);
    }
  });

  // DELETE /jobs/:id - Delete job
  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = campaignIdParamSchema.parse(req.params);
      const tenant = getTenant(req);
      if (!tenant) {
        return res.status(401).json({ error: 'Tenant required' });
      }

      const campaign = await CampaignModel.findOneAndDelete({ 
        _id: toObjectId(id), 
        tenantId: tenant._id.toString() 
      }).exec();

      if (!campaign) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Also delete associated tasks
      await TaskModel.deleteMany({ 
        campaignId: toObjectId(id),
        tenantId: tenant._id.toString()
      }).exec();

      logger.info({ campaignId: id }, 'Job deleted');
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete job');
      next(error);
    }
  });

  return router;
}