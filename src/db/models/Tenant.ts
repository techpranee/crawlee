import { Schema, model, models, type InferSchemaType } from 'mongoose';

const tenantSchema = new Schema(
  {
    name: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    basicAuthUser: { type: String, required: true },
    basicAuthPass: { type: String, required: true },
    apolloCookie: { type: String },
    zoomCookie: { type: String },
    linkedinCookie: { type: String },
    twentyCrmApiKey: { type: String },
    twentyCrmApiBaseUrl: { type: String },
  },
  { timestamps: true },
);

tenantSchema.index({ apiKey: 1 });

type Tenant = InferSchemaType<typeof tenantSchema>;

export type TenantDocument = Tenant & { _id: Schema.Types.ObjectId };

export const TenantModel = models.Tenant || model('Tenant', tenantSchema);
