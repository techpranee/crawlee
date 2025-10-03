// @ts-nocheck
import Agenda from 'agenda';
import { Types } from 'mongoose';

import { CampaignModel } from '../../db/models/Campaign';
import { CompanyModel } from '../../db/models/Company';
import { ContactModel } from '../../db/models/Contact';
import { TaskModel } from '../../db/models/Task';
import { appConfig } from '../../config/env';
import { logger } from '../../utils/logger';
import { jobCounter, jobLatencyHistogram } from '../../utils/metrics';

interface EnrichContactsJobData {
  campaignId: string;
  taskId?: string;
  tenantId: string;
}

function buildIcebreaker(contact: {
  first_name?: string | null;
  title?: string | null;
  company?: string | null;
}): string {
  const firstName = contact.first_name ?? 'there';
  const title = contact.title ?? 'your role';
  const company = contact.company ?? 'your company';
  return `Hi ${firstName}, noticed your role as ${title} at ${company} and was impressed by your work.`;
}

function guessEmail(
  contact: { first_name?: string | null; last_name?: string | null } & { email?: string | null },
  companyDomain?: string | null,
): string | null {
  if (contact.email) {
    return contact.email;
  }
  if (!contact.first_name || !contact.last_name || !companyDomain) {
    return null;
  }
  const sanitizedFirst = contact.first_name.replace(/\s+/g, '').toLowerCase();
  const sanitizedLast = contact.last_name.replace(/\s+/g, '').toLowerCase();
  if (!sanitizedFirst || !sanitizedLast) {
    return null;
  }
  const domain = companyDomain?.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  if (!domain) {
    return null;
  }
  return `${sanitizedFirst}.${sanitizedLast}@${domain}`;
}

async function resolveCompanyDomain(
  companyId: Types.ObjectId | undefined | null,
  tenantId: string,
): Promise<{
  domain: string | null;
  name: string | null;
}> {
  if (!companyId) {
    return { domain: null, name: null };
  }
  const company = await CompanyModel.findOne({ _id: companyId, tenantId })
    .select('domain name')
    .lean();
  if (!company) {
    return { domain: null, name: null };
  }
  return {
    domain: company.domain ?? null,
    name: company.name ?? null,
  };
}

export function defineEnrichContactsJob(agenda: Agenda): void {
  agenda.define<EnrichContactsJobData>(
    'enrich:contacts',
    { concurrency: Math.max(1, Math.floor(appConfig.maxConcurrency / 2)), lockLifetime: 5 * 60 * 1000 },
    async (job) => {
      const { campaignId, taskId, tenantId } = job.attrs.data ?? {};
      if (!campaignId || !tenantId || !Types.ObjectId.isValid(campaignId)) {
        logger.error({ campaignId, tenantId }, 'enrich:contacts job missing identifiers');
        return;
      }

      const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId });
      if (!campaign) {
        logger.error({ campaignId, tenantId }, 'Campaign not found for enrich job');
        return;
      }

      if (campaign.tenantId !== tenantId) {
        logger.warn({ campaignId, tenantId }, 'Tenant mismatch for enrich job');
        return;
      }

      const now = new Date();

      if (taskId && Types.ObjectId.isValid(taskId)) {
        await TaskModel.findOneAndUpdate({ _id: taskId, tenantId }, {
          status: 'running',
          startedAt: now,
        });
      }

      let processed = 0;
      let updated = 0;
      const companyDomainCache = new Map<string, { domain: string | null; name: string | null }>();
      const jobStart = Date.now();
      let jobStatus: 'done' | 'failed' = 'done';

      try {
        const cursor = ContactModel.find({
          campaignId,
          tenantId,
          $or: [
            { enriched: { $ne: true } },
            { email_status: { $in: [null, 'unknown'] } },
          ],
        })
          .lean()
          .cursor();

        for await (const contact of cursor) {
          processed += 1;

          let companyDomain: string | null = null;
          if (contact.companyId) {
            const cacheKey = String(contact.companyId);
            if (companyDomainCache.has(cacheKey)) {
              companyDomain = companyDomainCache.get(cacheKey)?.domain ?? null;
            } else {
              const info = await resolveCompanyDomain(contact.companyId as Types.ObjectId, tenantId);
              companyDomainCache.set(cacheKey, info);
              companyDomain = info.domain;
            }
          }

          if (!companyDomain && contact.company && contact.company.includes('.')) {
            companyDomain = contact.company;
          }

          const guessedEmail = guessEmail(contact, companyDomain);
          const email_status = guessedEmail ? 'unknown' : (contact.email_status as string) ?? 'unknown';

          const icebreaker = contact.icebreaker ?? buildIcebreaker(contact);

          const update: Record<string, unknown> = {
            enriched: true,
            email_status,
            icebreaker,
          };

          if (guessedEmail && !contact.email) {
            update.email = guessedEmail;
          }

          await ContactModel.updateOne({ _id: contact._id, tenantId }, { $set: update });
          updated += 1;
        }

        const finishedAt = new Date();

        if (taskId && Types.ObjectId.isValid(taskId)) {
          await TaskModel.findOneAndUpdate({ _id: taskId, tenantId }, {
            status: 'done',
            finishedAt,
            stats: {
              processed,
              updated,
            },
          });
        }

        campaign.stats = {
          ...(campaign.stats || {}),
          enrichmentRanAt: finishedAt,
          enrichmentProcessed: processed,
          enrichmentUpdated: updated,
        };
        await campaign.save();
      } catch (error) {
        logger.error({ err: error, campaignId, tenantId }, 'enrich:contacts job encountered error');
        jobStatus = 'failed';
        if (taskId && Types.ObjectId.isValid(taskId)) {
          await TaskModel.findOneAndUpdate({ _id: taskId, tenantId }, {
            status: 'failed',
            finishedAt: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        throw error;
      } finally {
        jobCounter.labels('enrich:contacts', jobStatus).inc();
        jobLatencyHistogram.labels('enrich:contacts').observe((Date.now() - jobStart) / 1000);
      }
    },
  );
}
