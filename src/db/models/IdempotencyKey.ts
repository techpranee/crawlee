import { Schema, model, models, InferSchemaType } from 'mongoose';

const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true },
    tenantId: { type: String, required: true },
    requestHash: { type: String, required: true },
    responseBody: { type: Schema.Types.Mixed },
    statusCode: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

idempotencyKeySchema.index({ tenantId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdempotencyKeyDocument = InferSchemaType<typeof idempotencyKeySchema>;

export const IdempotencyKeyModel =
  models.IdempotencyKey || model('IdempotencyKey', idempotencyKeySchema);
