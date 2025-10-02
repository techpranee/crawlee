import { z } from 'zod';

// Extended enums for frontend compatibility
const sourceEnum = z.enum(['mca', 'linkedin', 'apollo', 'zoom', 'custom']);
const strategyEnum = z.enum(['playwright', 'cheerio', 'auto']);
const authEnum = z.enum(['apollo', 'zoom']);
const modeEnum = z.enum(['crawlee', 'firecrawl', 'hybrid']);
const outputEnum = z.enum(['database', 'csv', 'vector']);
const complexityEnum = z.enum(['easy', 'medium', 'advanced']);
const categoryEnum = z.enum(['social-media', 'business', 'ecommerce', 'content', 'real-estate', 'jobs']);

const selectorsSchema = z.record(z.string());
const headersSchema = z.record(z.string());

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: sourceEnum,
  query: z.record(z.unknown()).default({}),
  seedUrls: z.array(z.string().url()).optional(),
  maxItems: z.number().int().positive().max(1000).default(200),
  strategy: strategyEnum.default('auto'),
  selectors: selectorsSchema.optional(),
  waitFor: z.string().optional(),
  headers: headersSchema.optional(),
  auth: authEnum.optional().nullable(),
});

export const createScrapeSchema = createCampaignSchema.extend({
  name: z.string().min(1).default('ad-hoc-scrape'),
});

export const campaignIdParamSchema = z.object({
  id: z.string().length(24),
});

export const enrichmentRequestSchema = z.object({});

export const getContactsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
  cursor: z.string().length(24).optional(),
  q: z.string().optional(),
  enriched: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return undefined;
    }),
});

// Strategy Template Schema
export const strategyFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'select', 'textarea', 'date-range', 'number']),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
  description: z.string().optional(),
});

export const strategyTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: categoryEnum,
  mode: modeEnum,
  output: outputEnum,
  complexity: complexityEnum,
  fields: z.array(strategyFieldSchema),
});

// Job Schema (extends Campaign)
export const createJobSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: sourceEnum.default('custom'),
  mode: modeEnum.default('crawlee'),
  output: outputEnum.default('database'),
  strategyId: z.string().optional(),
  strategyInputs: z.record(z.string()).optional(),
  query: z.record(z.unknown()).default({}),
  seedUrls: z.array(z.string().url()).optional(),
  maxItems: z.number().int().positive().max(1000).default(200),
  strategy: strategyEnum.default('auto'),
  selectors: selectorsSchema.optional(),
  waitFor: z.string().optional(),
  headers: headersSchema.optional(),
  auth: authEnum.optional().nullable(),
});

export const updateJobSchema = createJobSchema.partial();

export const jobControlSchema = z.object({
  action: z.enum(['pause', 'resume', 'stop', 'restart']),
});

// Job status and progress tracking
export const jobStatusEnum = z.enum(['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'stopped']);

// Type exports for frontend use
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobControlInput = z.infer<typeof jobControlSchema>;
export type StrategyTemplate = z.infer<typeof strategyTemplateSchema>;
export type StrategyField = z.infer<typeof strategyFieldSchema>;
export type JobStatus = z.infer<typeof jobStatusEnum>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CreateScrapeInput = z.infer<typeof createScrapeSchema>;
export type CampaignIdParams = z.infer<typeof campaignIdParamSchema>;
export type GetContactsQuery = z.infer<typeof getContactsQuerySchema>;
