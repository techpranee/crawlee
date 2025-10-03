import { Schema, model, models, InferSchemaType } from 'mongoose';

const campaignSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    source: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    query: { type: Schema.Types.Mixed, default: {} },
    seedUrls: { type: [String], default: [] },
    strategy: { type: String, enum: ['playwright', 'cheerio', 'auto'], default: 'auto' },
    selectors: { type: Schema.Types.Mixed, default: {} },
    waitFor: { type: String },
    headers: { type: Schema.Types.Mixed, default: {} },
    auth: { type: String, enum: ['apollo', 'zoom', 'linkedin', null], default: null },
    status: {
      type: String,
      enum: ['pending', 'queued', 'running', 'paused', 'done', 'partial', 'failed', 'stopped'],
      default: 'queued',
    },
    // Extended fields for frontend compatibility
    mode: { type: String, enum: ['crawlee', 'firecrawl', 'hybrid'], default: 'crawlee' },
    output: { type: String, enum: ['database', 'csv', 'vector'], default: 'database' },
    strategyId: { type: String },
    strategyInputs: { type: Schema.Types.Mixed, default: {} },
    progress: { type: Number, default: 0 },
    estimatedCompletion: { type: String },
    maxItems: { type: Number, default: 200 },
    stats: {
      type: Schema.Types.Mixed,
      default: {
        totalRequests: 0,
        contactsCreated: 0,
        contactsUpdated: 0,
        companiesCreated: 0,
        startedAt: null,
        finishedAt: null,
        errors: [],
      },
    },
  },
  { timestamps: true },
);

campaignSchema.index({ tenantId: 1, createdAt: -1 });

export type CampaignDocument = InferSchemaType<typeof campaignSchema> & {
  _id: Schema.Types.ObjectId;
};

export const CampaignModel = models.Campaign || model('Campaign', campaignSchema);
