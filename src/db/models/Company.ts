import { Schema, model, models, InferSchemaType } from 'mongoose';

const companySchema = new Schema(
  {
    name: { type: String, required: true },
    domain: { type: String },
    website: { type: String },
    industry: { type: String },
    size: { type: String },
    location: { type: String },
    linkedin_url: { type: String },
    source: { type: String },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    tenantId: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

companySchema.index({ tenantId: 1, domain: 1, name: 1 }, { unique: false, collation: { locale: 'en', strength: 2 } });
companySchema.index({ tenantId: 1, linkedin_url: 1 }, { sparse: true, unique: false, collation: { locale: 'en', strength: 2 } });

export type CompanyDocument = InferSchemaType<typeof companySchema> & {
  _id: Schema.Types.ObjectId;
};

export const CompanyModel = models.Company || model('Company', companySchema);
