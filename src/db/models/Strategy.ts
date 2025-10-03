import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Strategy - Reusable scraping configuration with AI-discovered selectors
 * 
 * Purpose: Store validated selector patterns for different page types
 * (LinkedIn profiles, company pages, search results, etc.)
 */

export interface SelectorConfig {
  /** CSS/XPath selector */
  selector: string;
  /** Field name in extracted data */
  field: string;
  /** Data type: text, href, src, attribute */
  type: 'text' | 'href' | 'src' | 'attribute' | 'html';
  /** Attribute name if type=attribute */
  attribute?: string;
  /** Whether field is required */
  required?: boolean;
  /** Transform function name (optional) */
  transform?: string;
  /** Multiple matches expected */
  multiple?: boolean;
}

export interface ValidationRule {
  /** Field to validate */
  field: string;
  /** Validation type */
  type: 'regex' | 'length' | 'required' | 'format';
  /** Rule parameter */
  value: string | number;
  /** Error message */
  message: string;
}

export interface StrategyDocument extends Document {
  /** Tenant ID for isolation */
  tenantId: mongoose.Types.ObjectId;
  
  /** Strategy name (e.g., "LinkedIn Profile - Full", "Apollo Contact Page") */
  name: string;
  
  /** Description of what this strategy extracts */
  description?: string;
  
  /** Platform: linkedin, apollo, zoom, generic */
  platform: 'linkedin' | 'apollo' | 'zoom' | 'generic';
  
  /** URL pattern this strategy applies to (regex) */
  urlPattern: string;
  
  /** Selector configurations */
  selectors: SelectorConfig[];
  
  /** Validation rules for extracted data */
  validationRules?: ValidationRule[];
  
  /** Example URLs where this strategy works */
  exampleUrls: string[];
  
  /** Auth type required (if any) */
  authType?: 'linkedin' | 'apollo' | 'zoom' | null;
  
  /** Crawler strategy preference */
  crawlerStrategy: 'playwright' | 'cheerio' | 'auto';
  
  /** Whether strategy is active */
  active: boolean;
  
  /** Number of times used in campaigns */
  usageCount: number;
  
  /** Last validation date */
  lastValidated?: Date;
  
  /** Success rate (0-100) */
  successRate?: number;
  
  /** Tags for categorization */
  tags?: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

const SelectorConfigSchema = new Schema<SelectorConfig>({
  selector: { type: String, required: true },
  field: { type: String, required: true },
  type: { type: String, enum: ['text', 'href', 'src', 'attribute', 'html'], required: true },
  attribute: { type: String },
  required: { type: Boolean, default: false },
  transform: { type: String },
  multiple: { type: Boolean, default: false },
}, { _id: false });

const ValidationRuleSchema = new Schema<ValidationRule>({
  field: { type: String, required: true },
  type: { type: String, enum: ['regex', 'length', 'required', 'format'], required: true },
  value: { type: Schema.Types.Mixed, required: true },
  message: { type: String, required: true },
}, { _id: false });

const StrategySchema = new Schema<StrategyDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant', index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    platform: { 
      type: String, 
      enum: ['linkedin', 'apollo', 'zoom', 'generic'], 
      required: true,
      index: true 
    },
    urlPattern: { type: String, required: true },
    selectors: { type: [SelectorConfigSchema], required: true },
    validationRules: { type: [ValidationRuleSchema] },
    exampleUrls: { type: [String], default: [] },
    authType: { 
      type: String, 
      enum: ['linkedin', 'apollo', 'zoom', null], 
      default: null 
    },
    crawlerStrategy: { 
      type: String, 
      enum: ['playwright', 'cheerio', 'auto'], 
      default: 'auto' 
    },
    active: { type: Boolean, default: true, index: true },
    usageCount: { type: Number, default: 0 },
    lastValidated: { type: Date },
    successRate: { type: Number, min: 0, max: 100 },
    tags: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
StrategySchema.index({ tenantId: 1, platform: 1, active: 1 });
StrategySchema.index({ tenantId: 1, name: 1 }, { unique: true });
StrategySchema.index({ tenantId: 1, tags: 1 });

// Increment usage count when strategy is used
StrategySchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  await this.save();
};

// Update success rate based on campaign results
StrategySchema.methods.updateSuccessRate = async function(successRate: number) {
  this.successRate = successRate;
  this.lastValidated = new Date();
  await this.save();
};

export const StrategyModel: Model<StrategyDocument> = mongoose.model<StrategyDocument>('Strategy', StrategySchema);
