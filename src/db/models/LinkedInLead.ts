import { Schema, model, models, InferSchemaType } from 'mongoose';

const linkedInLeadSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    tenantId: { type: String, required: true, index: true },

    // LinkedIn specific IDs
    linkedInId: { type: String, index: true }, // urn:li:activity:...

    // Author information
    authorName: { type: String, required: true },
    authorHeadline: { type: String },
    authorProfile: { type: String },

    // Company & Job details
    company: { type: String, index: true },
    companyUrl: { type: String },
    jobTitles: { type: [String], default: [] },
    locations: { type: [String], default: [] },
    seniority: { type: String },

    // Skills & compensation
    skills: { type: [String], default: [] },
    salaryRange: { type: String },

    // Post information
    postText: { type: String },
    postTitle: { type: String },
    postUrl: { type: String },
    postedAt: { type: Date },
    applicationLink: { type: String },

    // Metadata
    notes: { type: String },
    collectedAt: { type: Date, default: Date.now },
    companyIndustry: { type: String },

    // Raw metadata for retry/reprocessing
    rawMetadata: {
      postText: { type: String },
      authorName: { type: String },
      authorHeadline: { type: String },
      postUrl: { type: String },
      postTitle: { type: String },
      companyUrl: { type: String },
      postedAt: { type: String },
      extractedAt: { type: Date },
    },

    // AI enrichment status
    enrichmentStatus: {
      type: String,
      enum: ['pending', 'enriched', 'failed', 'skipped'],
      default: 'pending'
    },
    enrichmentError: { type: String },
    lastEnrichmentAttempt: { type: Date },

    // Processing status
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'archived'],
      default: 'new'
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Compound indexes for efficient queries
linkedInLeadSchema.index({ tenantId: 1, campaignId: 1, createdAt: -1 });
linkedInLeadSchema.index({ tenantId: 1, company: 1 });
linkedInLeadSchema.index({ tenantId: 1, status: 1 });
linkedInLeadSchema.index({ linkedInId: 1 }, { unique: true, sparse: true });

export type LinkedInLeadDocument = InferSchemaType<typeof linkedInLeadSchema> & {
  _id: Schema.Types.ObjectId;
};

export const LinkedInLeadModel = models.LinkedInLead || model('LinkedInLead', linkedInLeadSchema);
