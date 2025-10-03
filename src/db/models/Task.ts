import { Schema, model, models, InferSchemaType } from 'mongoose';

const taskSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    tenantId: { type: String, required: true, index: true },
    type: { type: String, enum: ['scrape', 'enrich'], required: true },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String },
    stats: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

taskSchema.index({ tenantId: 1, campaignId: 1, createdAt: -1 });

taskSchema.index({ status: 1 });

export type TaskDocument = InferSchemaType<typeof taskSchema> & {
  _id: Schema.Types.ObjectId;
};

export const TaskModel = models.Task || model('Task', taskSchema);
