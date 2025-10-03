import { Schema, model, models, InferSchemaType } from 'mongoose';

const contactSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    tenantId: { type: String, required: true, index: true },
    full_name: { type: String },
    first_name: { type: String },
    last_name: { type: String },
    title: { type: String },
    company: { type: String },
    email: { type: String },
    email_status: { type: String, enum: ['valid', 'invalid', 'unknown'], default: 'unknown' },
    phone: { type: String },
    linkedin_url: { type: String },
    source: { type: String },
    enriched: { type: Boolean, default: false },
    icebreaker: { type: String },
  },
  { timestamps: true },
);

contactSchema.index(
  { tenantId: 1, linkedin_url: 1 },
  { unique: true, sparse: true, collation: { locale: 'en', strength: 2 } },
);
contactSchema.index(
  { tenantId: 1, full_name: 1, companyId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      full_name: { $type: 'string' },
      companyId: { $exists: true },
    },
    collation: { locale: 'en', strength: 2 },
  },
);
contactSchema.index({ tenantId: 1, campaignId: 1, createdAt: -1 });
contactSchema.index({ tenantId: 1, enriched: 1 });

export type ContactDocument = InferSchemaType<typeof contactSchema> & {
  _id: Schema.Types.ObjectId;
};

export const ContactModel = models.Contact || model('Contact', contactSchema);
