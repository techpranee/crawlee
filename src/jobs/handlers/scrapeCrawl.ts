import Agenda, { type Job } from 'agenda';
import { Types } from 'mongoose';

import { CampaignModel } from '../../db/models/Campaign';
import { CompanyModel } from '../../db/models/Company';
import { ContactModel } from '../../db/models/Contact';
import { TaskModel } from '../../db/models/Task';
import { TenantModel } from '../../db/models/Tenant';
import { runCrawl } from '../../services/crawl/crawlers';
import { normalizeExtraction } from '../../services/crawl/normalize';
import { appConfig } from '../../config/env';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../services/crawl/rateLimiter';
import {
  crawlErrorsCounter,
  dedupeCounter,
  jobCounter,
  jobLatencyHistogram,
} from '../../utils/metrics';

interface ScrapeCrawlJobData {
  campaignId: string;
  taskId?: string;
  tenantId: string;
  urlIndex?: number; // For LinkedIn rate limiting
}

export function defineScrapeCrawlJob(agenda: Agenda): void {
  agenda.define<ScrapeCrawlJobData>(
    'scrape:crawl',
    { concurrency: appConfig.maxConcurrency, lockLifetime: appConfig.requestTimeoutMs * 4 },
    async (job: Job<ScrapeCrawlJobData>) => {
      const { campaignId, taskId, tenantId } = job.attrs.data ?? {};
      if (!campaignId || !tenantId || !Types.ObjectId.isValid(campaignId)) {
        logger.error({ campaignId, tenantId }, 'scrape:crawl job missing identifiers');
        return;
      }

      const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId });
      if (!campaign) {
        logger.error({ campaignId, tenantId }, 'Campaign not found for scrape job');
        return;
      }

      if (campaign.tenantId !== tenantId) {
        logger.warn({ campaignId, tenantId }, 'Tenant mismatch for scrape job');
        return;
      }

      const now = new Date();

      // Check if this is a LinkedIn campaign that needs rate limiting
      const isLinkedIn = campaign.auth === 'linkedin' || 
        (campaign.seedUrls && campaign.seedUrls.length > 0 && campaign.seedUrls[0].includes('linkedin.com'));
      
      const urlIndex = job.attrs.data?.urlIndex ?? 0;
      
            // For LinkedIn campaigns with multiple seedUrls, process one URL at a time
      if (campaign.source === 'linkedin' && campaign.seedUrls && campaign.seedUrls.length > 1) {
        const processedUrls = (campaign.stats?.processedUrls as string[]) || [];
        const remainingUrls = campaign.seedUrls.filter((url: string) => !processedUrls.includes(url));
        
        if (remainingUrls.length > 0) {
          // Process only the first remaining URL
          logger.info({ campaignId, remainingUrls: remainingUrls.length }, 'LinkedIn: Processing one URL at a time');
          
          // Store original seedUrls before modifying
          const originalSeedUrls = [...campaign.seedUrls];
          campaign.seedUrls = [remainingUrls[0]];
          
          // Store original seedUrls in stats for rescheduling
          campaign.stats = {
            ...campaign.stats,
            originalSeedUrls: originalSeedUrls,
            processedUrls: processedUrls,
            remainingUrls: remainingUrls.length,
            totalUrls: originalSeedUrls.length
          };
        }
      }

      campaign.status = 'running';
      campaign.stats = {
        ...(campaign.stats || {}),
        startedAt: campaign.stats?.startedAt || now, // Preserve original start time
        contactsCreated: campaign.stats?.contactsCreated || 0,
        contactsUpdated: campaign.stats?.contactsUpdated || 0,
        companiesCreated: campaign.stats?.companiesCreated || 0,
        totalRequests: campaign.stats?.totalRequests || 0,
        errors: campaign.stats?.errors || [],
      };
      await campaign.save();

      if (taskId && Types.ObjectId.isValid(taskId)) {
        await TaskModel.findOneAndUpdate({ _id: taskId, tenantId }, {
          status: 'running',
          startedAt: now,
        });
      }

      const jobStart = Date.now();
      let jobStatus: 'done' | 'failed' = 'done';

      try {
        let tenant: { apolloCookie?: string; zoomCookie?: string; linkedinCookie?: string } | null = null;
        if (tenantId) {
          const tenantDoc = await TenantModel.findById(tenantId).select('apolloCookie zoomCookie linkedinCookie').exec();
          if (tenantDoc) {
            tenant = {
              apolloCookie: tenantDoc.apolloCookie ?? undefined,
              zoomCookie: tenantDoc.zoomCookie ?? undefined,
              linkedinCookie: tenantDoc.linkedinCookie ?? undefined,
            };
          }
        }
        if (tenantId && !tenant) {
          throw new Error(`Tenant ${tenantId} not found`);
        }

        const crawlResult = await runCrawl({
          campaign: campaign as typeof campaign & { _id: Types.ObjectId },
          strategy: (campaign.strategy as 'playwright' | 'cheerio' | 'auto') ?? 'auto',
          tenant,
        });

        let contactsCreated = 0;
        let contactsUpdated = 0;
        let companiesCreated = 0;

        for (const raw of crawlResult.items) {
          const normalized = normalizeExtraction(campaign as typeof campaign & { _id: Types.ObjectId }, raw);
          if (!normalized) {
            continue;
          }

          let companyId: Types.ObjectId | undefined;
          if (normalized.company && (normalized.company.name || normalized.company.domain)) {
            const companyFilter: Record<string, unknown> = {
              campaignId: campaign._id,
              tenantId: campaign.tenantId,
            };
            let hasIdentifier = false;
            if (normalized.company.domain) {
              companyFilter.domain = normalized.company.domain;
              hasIdentifier = true;
            }
            if (normalized.company.name) {
              companyFilter.name = normalized.company.name;
              hasIdentifier = true;
            }
            if (!normalized.company.domain && !normalized.company.name && normalized.company.linkedin_url) {
              companyFilter.linkedin_url = normalized.company.linkedin_url;
              hasIdentifier = true;
            }
            if (hasIdentifier) {
              const companyResult = await CompanyModel.findOneAndUpdate(
                companyFilter,
                {
                  $set: {
                    ...normalized.company,
                    campaignId: campaign._id,
                    source: campaign.source,
                    tenantId: campaign.tenantId,
                  },
                },
                {
                  upsert: true,
                  new: true,
                  rawResult: true,
                  collation: { locale: 'en', strength: 2 },
                },
              );

              const companyDoc = companyResult?.value ?? null;
              if (companyDoc) {
                companyId = companyDoc._id as Types.ObjectId;
              }
              if (companyResult?.lastErrorObject?.upserted) {
                companiesCreated += 1;
              }
            }
          }

          const contactFilter: Record<string, unknown> = {
            campaignId: campaign._id,
            tenantId: campaign.tenantId,
          };
          if (normalized.contact.linkedin_url) {
            contactFilter.linkedin_url = normalized.contact.linkedin_url;
          } else if (normalized.contact.full_name && companyId) {
            contactFilter.full_name = normalized.contact.full_name;
            contactFilter.companyId = companyId;
          } else if (normalized.contact.full_name) {
            contactFilter.full_name = normalized.contact.full_name;
          } else {
            continue;
          }

          const contactResult = await ContactModel.findOneAndUpdate(
            contactFilter,
            {
              $set: {
                ...normalized.contact,
                campaignId: campaign._id,
                companyId,
                company: normalized.contact.company,
                enriched: false,
                tenantId: campaign.tenantId,
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            {
              upsert: true,
              new: true,
              rawResult: true,
              collation: { locale: 'en', strength: 2 },
            },
          );

          if (contactResult?.lastErrorObject?.upserted) {
            contactsCreated += 1;
          } else {
            contactsUpdated += 1;
          }
        }

        const finishedAt = new Date();
        const hasContacts = contactsCreated + contactsUpdated > 0;
        const hasErrors = crawlResult.errors.length > 0;

        // Update stats with cumulative values
        campaign.stats = {
          ...(campaign.stats || {}),
          contactsCreated: (campaign.stats?.contactsCreated || 0) + contactsCreated,
          contactsUpdated: (campaign.stats?.contactsUpdated || 0) + contactsUpdated,
          companiesCreated: (campaign.stats?.companiesCreated || 0) + companiesCreated,
          totalRequests: (campaign.stats?.totalRequests || 0) + crawlResult.items.length,
          errors: [...(campaign.stats?.errors || []), ...crawlResult.errors],
          datasetIds: [...(campaign.stats?.datasetIds || []), ...crawlResult.datasetIds],
        };
        
        // For LinkedIn, check if there are more URLs to process
        if (isLinkedIn && urlIndex !== undefined) {
          const originalSeedUrls = campaign.stats?.originalSeedUrls as string[] | undefined;
          const nextUrlIndex = urlIndex + 1;
          
          if (originalSeedUrls && nextUrlIndex < originalSeedUrls.length) {
            // More URLs to process - schedule next job with 10-minute delay
            campaign.status = 'running';
            campaign.stats = {
              ...campaign.stats,
              processedUrls: [...((campaign.stats?.processedUrls as string[]) || []), originalSeedUrls[urlIndex]],
            };
            await campaign.save();
            
            logger.info({ 
              campaignId, 
              urlIndex,
              nextUrlIndex,
              totalUrls: originalSeedUrls.length,
              delayMinutes: 10
            }, 'Scheduling next LinkedIn URL after 10-minute delay');
            
            // Schedule the next URL to be processed after 10 minutes
            await agenda.schedule('10 minutes', 'scrape:crawl', {
              campaignId: campaignId.toString(),
              taskId: taskId?.toString(),
              tenantId,
              urlIndex: nextUrlIndex,
            });
            
            return; // Exit - next job will continue
          }
        }
        
        // All done - mark campaign complete
        campaign.status = !hasContacts && hasErrors ? 'failed' : hasErrors ? 'partial' : 'done';
        campaign.stats.finishedAt = finishedAt;
        await campaign.save();

        dedupeCounter.labels('created').inc(contactsCreated);
        dedupeCounter.labels('updated').inc(contactsUpdated);
        if (crawlResult.errors.length > 0) {
          crawlErrorsCounter.labels(campaign.strategy ?? 'auto').inc(crawlResult.errors.length);
        }

        if (taskId && Types.ObjectId.isValid(taskId)) {
          const taskStatus = !hasContacts && hasErrors ? 'failed' : 'done';
          await TaskModel.findOneAndUpdate({ _id: taskId, tenantId }, {
            status: taskStatus,
            finishedAt,
            stats: {
              contactsCreated,
              contactsUpdated,
              companiesCreated,
              datasetIds: crawlResult.datasetIds,
              errors: crawlResult.errors,
              outcome: hasErrors && hasContacts ? 'partial' : campaign.status,
            },
          });
        }
      } catch (error) {
        const finishedAt = new Date();
        logger.error({ err: error, campaignId }, 'scrape:crawl job encountered error');

        campaign.status = 'failed';
        campaign.stats = {
          ...(campaign.stats || {}),
          finishedAt,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
        await campaign.save();

        if (taskId && Types.ObjectId.isValid(taskId)) {
          await TaskModel.findOneAndUpdate({ _id: taskId, tenantId }, {
            status: 'failed',
            finishedAt,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        jobStatus = 'failed';
        throw error;
      } finally {
        jobCounter.labels('scrape:crawl', jobStatus).inc();
        jobLatencyHistogram.labels('scrape:crawl').observe((Date.now() - jobStart) / 1000);
      }
    },
  );
}
