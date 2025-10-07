import { Router, type Request } from 'express';
import { pipeline } from 'node:stream/promises';
import { Transform as StreamTransform } from 'node:stream';
import { Transform as CsvTransform } from 'json2csv';
import { Types } from 'mongoose';

import { ContactModel } from '../db/models/Contact';
import { CampaignModel } from '../db/models/Campaign';
import { campaignIdParamSchema } from '../types/api';
import { logger } from '../utils/logger';

type TenantAwareRequest = Request & { tenantId?: string };

function getTenantId(req: Request): string | undefined {
  return (req as TenantAwareRequest).tenantId;
}

export function createExportRouter() {
  const router = Router();

  router.get('/:id/export.csv', async (req, res, next) => {
    const params = campaignIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid campaign id' });
    }
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context missing' });
    }

    try {
      const campaignId = new Types.ObjectId(params.data.id);

      const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId })
        .select('_id')
        .lean();
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const cursor = ContactModel.find({ campaignId, tenantId })
        .sort({ createdAt: 1 })
        .lean()
        .cursor();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="campaign-${params.data.id}.csv"`,
      );

      const mapper = new StreamTransform({
        objectMode: true,
        transform(chunk, _enc, callback) {
          try {
            const doc = chunk as Record<string, unknown>;
            const mapped = {
              full_name: (doc.full_name as string) ?? '',
              first_name: (doc.first_name as string) ?? '',
              last_name: (doc.last_name as string) ?? '',
              title: (doc.title as string) ?? '',
              company: (doc.company as string) ?? '',
              email: (doc.email as string) ?? '',
              email_status: (doc.email_status as string) ?? '',
              phone: (doc.phone as string) ?? '',
              linkedin_url: (doc.linkedin_url as string) ?? '',
              source: (doc.source as string) ?? '',
              campaign_id:
                typeof doc.campaignId === 'object' && doc.campaignId
                  ? (doc.campaignId as Types.ObjectId).toString()
                  : params.data.id,
              created_at:
                doc.createdAt instanceof Date
                  ? doc.createdAt.toISOString()
                  : new Date(doc.createdAt as string | number | Date | undefined || Date.now()).toISOString(),
            };
            callback(null, mapped);
          } catch (error) {
            callback(error as Error);
          }
        },
      });

      const csvFields = [
        'full_name',
        'first_name',
        'last_name',
        'title',
        'company',
        'email',
        'email_status',
        'phone',
        'linkedin_url',
        'source',
        'campaign_id',
        'created_at',
      ];

      const csvTransform = new CsvTransform({ fields: csvFields, withBOM: true });

      await pipeline(cursor, mapper, csvTransform, res);
    } catch (error) {
      logger.error({ err: error }, 'CSV export failed');
      next(error);
    }
  });

  return router;
}
