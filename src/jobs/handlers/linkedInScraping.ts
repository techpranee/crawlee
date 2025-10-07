import Agenda, { type Job } from 'agenda';
import { Types } from 'mongoose';
import { chromium, type BrowserContext, type Page } from 'playwright';

import { CampaignModel } from '../../db/models/Campaign';
import { TaskModel } from '../../db/models/Task';
import { LinkedInLeadModel } from '../../db/models/LinkedInLead';
import { appConfig } from '../../config/env';
import { logger } from '../../utils/logger';
import { jobCounter, jobLatencyHistogram } from '../../utils/metrics';

interface LinkedInJobData {
  campaignId: string;
  taskId?: string;
  tenantId: string;
  roles: string;
  period: string;
  limit: number;
}

interface LinkedInLead {
  id: string;
  author_name: string;
  author_headline: string;
  author_profile: string;
  company: string;
  job_titles: string[];
  locations: string[];
  seniority: string;
  skills: string[];
  salary_range: string;
  application_link: string;
  notes: string;
  post_text: string;
  post_url: string;
  post_title?: string;
  company_url?: string;
  collected_at: string;
}

// Utility functions
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread = 400) => base + Math.floor(Math.random() * spread);

// Retry logic for network failures
async function retryable<T>(fn: () => Promise<T>, maxRetries = 3, context = 'operation'): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      logger.warn({ attempt: i + 1, maxRetries, context, error: e }, 'Retry attempt');
      if (i === maxRetries - 1) throw e;
      await sleep(jitter(2000, 2000));
    }
  }
  throw new Error('Max retries exceeded');
}

// Safe text extraction with multiple selectors
async function safeExtractText(element: any, selectors: string[], context = 'element'): Promise<string> {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

  for (const selector of selectorArray) {
    try {
      const text = await element.locator(selector).allInnerTexts();
      if (text && text.length > 0) {
        return text.join('\n').trim();
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }

  logger.warn({ context }, 'Failed to extract text with all selectors');
  return '';
}

// AI extraction using Ollama
async function aiJSON(prompt: string, schemaHint = ''): Promise<any> {
  const sys = `You are an analyst. Output STRICT JSON. ${schemaHint}`;
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: prompt },
  ];

  // Ollama - use native API format
  if (appConfig.ollamaUrl) {
    try {
      const ollamaBase = appConfig.ollamaUrl.replace(/\/$/, '');
      const res = await fetch(`${ollamaBase}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: appConfig.ollamaModel || 'deepseek-r1:14b',
          messages,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error: ${res.status} ${res.statusText} - ${errorText}`);
      }

      const j = await res.json();
      const text = j?.message?.content || '{}';
      return safeParseJSON(text);
    } catch (e: any) {
      logger.warn({ error: e.message }, 'Ollama API failed');
      return {};
    }
  }

  logger.warn('No OLLAMA_URL configured');
  return {};
}

function safeParseJSON(txt: string): any {
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

// AI planner: produce search queries
async function planSearch(roles: string, period: string): Promise<any> {
  const plan = await aiJSON(
    `Produce a JSON plan for finding recent LinkedIn posts about hiring for roles: "${roles}". 
Return fields:
{
  "queries": string[], // 3-6 search queries/phrases to find "hiring" posts
  "tags": string[],    // 3-8 hashtags to include (#hiring, role tags)
  "filters": { "period": "${period}", "language":"en" },
  "notes": string      // brief strategy
}
Make queries specific, e.g. "hiring frontend developer", "we're hiring react", "looking for node.js engineer".`,
    `Ensure valid JSON with keys queries, tags, filters, notes.`,
  );

  // basic fallback
  if (!plan?.queries?.length) {
    plan.queries = ['we are hiring', 'hiring developer', 'job opening'];
    plan.tags = ['#hiring', '#nowhiring', '#job'];
    plan.filters = { period, language: 'en' };
    plan.notes = 'Fallback plan.';
  }
  return plan;
}

// AI extractor: turn post text into structured lead info
async function extractFromPost(params: {
  postText: string;
  authorName: string;
  authorHeadline: string;
  authorCompanyGuess: string;
}): Promise<any> {
  const json = await aiJSON(
    `From the LinkedIn post content and author info, extract a hiring lead:
Input:
- Author: ${params.authorName}
- Headline: ${params.authorHeadline}
- CompanyGuess: ${params.authorCompanyGuess}
- Post: """${(params.postText || '').slice(0, 1500)}"""

Return fields:
{
  "isHiringPost": boolean,
  "company": string,           // best-guess
  "job_titles": string[],      // one or more roles mentioned
  "locations": string[],       // city/country or remote
  "seniority": string,         // junior/mid/senior/lead/etc if clear else ""
  "skills": string[],          // required tech/skills mentioned (e.g., React, Python, AWS)
  "salary_range": string,      // if mentioned, otherwise ""
  "application_link": string,  // apply URL if present, otherwise ""
  "post_title": string,        // short post headline or first line
  "company_url": string,       // company linkedin profile if discernible
  "notes": string              // short summary/keywords gleaned
}
Only true when clearly a hiring post.`,
    `Strict JSON with all fields.`,
  );
  return json || {};
}

// LinkedIn automation
async function ensureLoggedIn(page: Page): Promise<void> {
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    logger.info('Waiting for LinkedIn login');
    await page.waitForURL(/linkedin\.com\/feed/, { timeout: 0 });
    logger.info('Logged in to LinkedIn');
  }
}

// Rate limit detection
async function checkForRateLimit(page: Page): Promise<boolean> {
  const url = page.url();

  // Check for various rate limit indicators
  if (url.includes('/authwall') || url.includes('/checkpoint')) {
    logger.warn('LinkedIn rate limit detected: authwall/checkpoint');
    return true;
  }

  // Check for rate limit messages in the page
  const rateLimitTexts = [
    'You\'ve been viewing',
    'Too many requests',
    'Unusual activity',
    'Please verify',
    'Try again later',
  ];

  for (const text of rateLimitTexts) {
    const found = await page.locator(`text=${text}`).count().catch(() => 0);
    if (found > 0) {
      logger.warn({ text }, 'LinkedIn rate limit detected: text match');
      return true;
    }
  }

  return false;
}

// Enhanced collection with human behavior
async function collectPostsOnPage(
  page: Page,
  maxToCollect: number,
  pushedIds: Set<string>,
  campaignId: Types.ObjectId,
  tenantId: string,
): Promise<{ leads: LinkedInLead[]; rateLimited: boolean }> {
  const leads: LinkedInLead[] = [];
  let attempts = 0;
  const startTime = Date.now();
  const MAX_DURATION = 5 * 60 * 1000; // 5 min per query

  while (
    leads.length < maxToCollect &&
    attempts < 30 &&
    Date.now() - startTime < MAX_DURATION
  ) {
    // Check for rate limiting
    if (await checkForRateLimit(page)) {
      logger.warn('Rate limit detected, stopping collection');
      return { leads, rateLimited: true };
    }

    const posts = page.locator(
      'div.feed-shared-update-v2, div.reusable-search__result-container, div[data-id*="urn:li:activity"]',
    );
    const count = await posts.count().catch(() => 0);

    logger.info({ count, attempt: attempts + 1, collected: leads.length }, 'Scanning posts');

    for (let i = 0; i < count && leads.length < maxToCollect; i++) {
      const post = posts.nth(i);
      const pid =
        (await post.getAttribute('data-urn').catch(() => null)) ||
        (await post.getAttribute('data-id').catch(() => null));
      if (pid && pushedIds.has(pid)) continue;

      // Enhanced text extraction with fallbacks
      const postTextRaw = await safeExtractText(
        post,
        [
          '[data-test-id="post-content"]',
          'div.feed-shared-update-v2__description',
          'span[dir="ltr"]',
          'div[class*="description"]',
          'div.feed-shared-text',
        ],
        'post content',
      );

      // Quick gate: must look like hiring
      if (
        !/\bhiring\b|\bwe'?re hiring\b|\blooking for\b|\bopenings?\b|\bapply\b|\bjoin.{0,20}team\b/i.test(
          postTextRaw,
        )
      )
        continue;

      // Enhanced author extraction
      const authorName = await safeExtractText(
        post,
        [
          'span.feed-shared-actor__name',
          'span.update-components-actor__name',
          'a.update-components-actor__meta-link',
          'span[class*="actor__name"]',
        ],
        'author name',
      );

      const authorHeadline = await safeExtractText(
        post,
        [
          'span.update-components-actor__description',
          'div.update-components-actor__sub-description',
          'span[class*="actor__description"]',
        ],
        'author headline',
      );

      // Post link extraction with fallbacks
      const postLink = await post
        .locator('a.app-aware-link[href*="/posts/"], a[href*="/posts/"], a[href*="activity"]')
        .first()
        .getAttribute('href')
        .catch(() => null);

      // Author profile link with fallbacks
      let authorProfileHref = await post
        .locator('a[href*="/in/"], a[href*="linkedin.com/in/"]')
        .first()
        .getAttribute('href')
        .catch(() => null);
      if (authorProfileHref && authorProfileHref.startsWith('/')) {
        authorProfileHref = 'https://www.linkedin.com' + authorProfileHref;
      }

      // Extract with AI
      logger.info({ author: authorName }, 'Analyzing post with AI');
      const extracted = await retryable(
        () =>
          extractFromPost({
            postText: postTextRaw,
            authorName,
            authorHeadline,
            authorCompanyGuess: authorHeadline || '',
          }),
        2,
        'AI extraction',
      );

      if (extracted?.isHiringPost) {
        const lead: LinkedInLead = {
          id: pid || postLink || `${authorProfileHref || ''}#${Math.random()}`,
          author_name: (authorName || '').trim(),
          author_headline: (authorHeadline || '').trim(),
          author_profile: authorProfileHref || '',
          company: extracted.company || '',
          job_titles: extracted.job_titles || [],
          locations: extracted.locations || [],
          seniority: extracted.seniority || '',
          skills: extracted.skills || [],
          salary_range: extracted.salary_range || '',
          application_link: extracted.application_link || '',
          notes: extracted.notes || '',
          post_text: postTextRaw.slice(0, 4000),
          post_url: postLink ? new URL(postLink, 'https://www.linkedin.com').toString() : '',
          // map AI fields to camelCase
          post_title: extracted.post_title || undefined,
          company_url: extracted.company_url || undefined,
          collected_at: new Date().toISOString(),
        };

        leads.push(lead);
        logger.info(
          { company: lead.company, jobTitles: lead.job_titles },
          'Found hiring post',
        );

        // Save to database immediately
        try {
          await LinkedInLeadModel.create({
            campaignId,
            tenantId,
            linkedInId: lead.id,
            authorName: lead.author_name,
            authorHeadline: lead.author_headline,
            authorProfile: lead.author_profile,
            company: lead.company,
            companyUrl: (lead as any).company_url || '',
            jobTitles: lead.job_titles,
            locations: lead.locations,
            seniority: lead.seniority,
            skills: lead.skills,
            salaryRange: lead.salary_range,
            applicationLink: lead.application_link,
            notes: lead.notes,
            postText: lead.post_text,
            postTitle: (lead as any).post_title || '',
            postUrl: lead.post_url,
            collectedAt: new Date(lead.collected_at),
            status: 'new',
          });
          logger.info({ linkedInId: lead.id }, 'Saved lead to database');
        } catch (e: any) {
          if (e.code === 11000) {
            logger.warn({ linkedInId: lead.id }, 'Duplicate lead, skipping');
          } else {
            logger.error({ error: e.message }, 'Failed to save lead to database');
          }
        }

        if (pid) pushedIds.add(pid);
      }
    }

    // Human-like scroll with occasional longer pauses
    const scrollAmount = 500 + Math.floor(Math.random() * 800);
    await page.mouse.wheel(0, scrollAmount);

    // Random mouse movements to mimic reading
    const x = 100 + Math.floor(Math.random() * 800);
    const y = 100 + Math.floor(Math.random() * 600);
    await page.mouse.move(x, y).catch(() => { });

    // Every 5 scrolls, take a longer break (simulate reading)
    if (attempts % 5 === 4) {
      logger.info('Taking reading break');
      await sleep(jitter(30_000, 20_000)); // 30-50s pause
    } else {
      await sleep(jitter(2000, 1500)); // 2-3.5s normal
    }

    attempts++;
  }

  return { leads, rateLimited: false };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Build LinkedIn search URL with advanced filters
 */
function buildLinkedInSearchUrl(query: string, filters: any = {}): string {
  const params = new URLSearchParams();

  // Basic search
  params.append('keywords', query);
  params.append('origin', 'GLOBAL_SEARCH_HEADER');

  // Date filter
  if (filters.period) {
    const dateMap: Record<string, string> = {
      'past 24 hours': 'past-24h',
      'past week': 'past-week',
      'past month': 'past-month',
      'past year': 'past-year',
    };
    const dateValue = dateMap[filters.period];
    if (dateValue) {
      params.append('datePosted', `"${dateValue}"`);
    }
  }

  // Sort order
  if (filters.sortBy === 'date') {
    params.append('sortBy', '"date_posted"');
  }

  // Content type
  if (filters.contentType && filters.contentType !== 'all') {
    const contentMap: Record<string, string> = {
      'posts': '"posts"',
      'articles': '"article"',
      'images': '"image"',
      'videos': '"video"',
      'documents': '"document"',
      'jobs': '"jobs"',
    };
    const contentValue = contentMap[filters.contentType];
    if (contentValue) {
      params.append('contentType', contentValue);
    }
  }

  // Location
  if (filters.location) {
    params.append('geoUrn', encodeURIComponent(filters.location));
  }

  // Language
  if (filters.language) {
    params.append('contentLanguage', `"${filters.language}"`);
  }

  // Connection degree
  if (filters.connections && filters.connections !== 'all') {
    const connectionMap: Record<string, string> = {
      '1st': 'F',
      '2nd': 'S',
      '3rd': 'O',
    };
    const connectionValue = connectionMap[filters.connections];
    if (connectionValue) {
      params.append('network', `["${connectionValue}"]`);
    }
  }

  return `https://www.linkedin.com/search/results/content/?${params.toString()}`;
}

// Main job handler
export function defineLinkedInScrapingJob(agenda: Agenda): void {
  agenda.define<LinkedInJobData>(
    'linkedin:scrape',
    { concurrency: 1, lockLifetime: 60 * 60 * 1000 }, // 1 hour lock, only 1 at a time
    async (job: Job<LinkedInJobData>) => {
      const { campaignId, taskId, tenantId, roles, period, limit } = job.attrs.data ?? {};

      if (!campaignId || !tenantId || !Types.ObjectId.isValid(campaignId)) {
        logger.error({ campaignId, tenantId }, 'linkedin:scrape job missing identifiers');
        return;
      }

      const campaign = await CampaignModel.findOne({ _id: campaignId, tenantId });
      if (!campaign) {
        logger.error({ campaignId, tenantId }, 'Campaign not found for LinkedIn scrape job');
        return;
      }

      const now = new Date();
      campaign.status = 'running';
      campaign.stats = {
        ...(campaign.stats || {}),
        startedAt: campaign.stats?.startedAt || now,
        totalLeads: 0,
        errors: campaign.stats?.errors || [],
      };
      await campaign.save();

      if (taskId && Types.ObjectId.isValid(taskId)) {
        await TaskModel.findOneAndUpdate(
          { _id: taskId, tenantId },
          {
            status: 'running',
            startedAt: now,
          },
        );
      }

      const jobStart = Date.now();
      let jobStatus: 'done' | 'failed' = 'done';
      let context: BrowserContext | null = null;

      try {
        logger.info({ campaignId, roles, period, limit }, 'Starting LinkedIn scraping job');
        jobCounter.labels('linkedin:scrape', 'started').inc();

        // Use exact keywords without AI expansion if user provided specific query
        const useAIExpansion = !roles || roles.split(',').length === 1 && roles.split(' ').length > 2;

        let queries: string[];
        if (useAIExpansion) {
          // Plan search with AI for complex queries
          const plan = await planSearch(roles || 'software engineer', period || 'past week');
          logger.info({ plan }, 'AI search plan generated');
          queries = dedupe([
            ...plan.queries,
            ...plan.tags.map((t: string) => `hiring ${t.replace('#', '')}`),
          ]).slice(0, 6); // Limit to 6 queries
        } else {
          // Use exact keywords provided by user
          queries = roles.split(',').map(r => r.trim()).filter(Boolean);
          logger.info({ queries }, 'Using exact user keywords (AI expansion disabled)');
        }

        // Launch persistent browser context
        const USER_DATA_DIR = './.playwright-chrome-profile';
        context = await chromium.launchPersistentContext(USER_DATA_DIR, {
          channel: 'chrome',
          headless: false,
          viewport: { width: 1320, height: 900 },
          args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
          bypassCSP: true,
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        const page = await context.newPage();
        await ensureLoggedIn(page);

        const allLeads: LinkedInLead[] = [];
        const pushedIds = new Set<string>();
        let rateLimited = false;

        for (let queryIdx = 0; queryIdx < queries.length && !rateLimited; queryIdx++) {
          const q = queries[queryIdx];
          logger.info({ query: q, progress: `${queryIdx + 1}/${queries.length}` }, 'Processing query');

          // Build URL with advanced filters
          const url = buildLinkedInSearchUrl(q, campaign.query || {});
          logger.info({ url }, 'Navigating to search URL');

          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await sleep(jitter(2000, 1500));

          // Check for rate limit after navigation
          if (await checkForRateLimit(page)) {
            rateLimited = true;
            logger.warn('Rate limit detected after navigation, stopping');
            break;
          }

          const remaining = Math.max(0, limit - allLeads.length);
          if (remaining <= 0) break;

          const take = Math.min(5, remaining);
          const result = await collectPostsOnPage(
            page,
            take,
            pushedIds,
            new Types.ObjectId(campaignId),
            tenantId,
          );

          allLeads.push(...result.leads);
          rateLimited = result.rateLimited;

          if (rateLimited) {
            logger.warn('Rate limit detected during collection, stopping');
            break;
          }

          if (allLeads.length >= limit) break;

          // Longer rest between queries (15-25s)
          logger.info('Resting before next query');
          await sleep(jitter(18_000, 12_000)); // 18-30s
        }

        // Update campaign stats
        campaign.status = rateLimited ? 'paused' : 'done';
        campaign.stats = {
          ...(campaign.stats || {}),
          finishedAt: new Date(),
          totalLeads: allLeads.length,
          rateLimited,
          lastQuery: rateLimited ? queries[allLeads.length] : null,
        };
        campaign.progress = 100;
        await campaign.save();

        if (taskId && Types.ObjectId.isValid(taskId)) {
          await TaskModel.findOneAndUpdate(
            { _id: taskId, tenantId },
            {
              status: rateLimited ? 'failed' : 'done',
              finishedAt: new Date(),
              stats: { totalLeads: allLeads.length, rateLimited },
            },
          );
        }

        logger.info(
          { totalLeads: allLeads.length, rateLimited },
          'LinkedIn scraping job completed',
        );
        jobCounter.labels('linkedin:scrape', 'success').inc();

        // Keep browser open if rate limited for manual intervention
        if (!rateLimited && context) {
          await context.close();
        }
      } catch (error: any) {
        jobStatus = 'failed';
        logger.error({ error: error.message, stack: error.stack }, 'LinkedIn scraping job failed');

        campaign.status = 'failed';
        campaign.stats = {
          ...(campaign.stats || {}),
          finishedAt: new Date(),
          errors: [...(campaign.stats?.errors || []), error.message],
        };
        await campaign.save();

        if (taskId && Types.ObjectId.isValid(taskId)) {
          await TaskModel.findOneAndUpdate(
            { _id: taskId, tenantId },
            {
              status: 'failed',
              finishedAt: new Date(),
              error: error.message,
            },
          );
        }

        jobCounter.labels('linkedin:scrape', 'failed').inc();

        if (context) {
          await context.close();
        }
      } finally {
        const duration = Date.now() - jobStart;
        jobLatencyHistogram.labels('linkedin:scrape', jobStatus).observe(duration / 1000);
      }
    },
  );
}
