import { Dataset, ProxyConfiguration, CheerioCrawler, PlaywrightCrawler } from 'crawlee';
import { randomInt } from 'crypto';
import { Types } from 'mongoose';

import type { CampaignDocument } from '../../db/models/Campaign';
import type { TenantDocument } from '../../db/models/Tenant';
import { appConfig } from '../../config/env';
import { logger } from '../../utils/logger';
import { getPolicy } from '../policy';
import { extractFromCheerio, extractFromPlaywright, type RawExtraction } from './extractors';
import { rateLimiter } from './rateLimiter';
import { proxyRotator } from './proxyRotator';

export interface CrawlRuntimeResult {
  items: RawExtraction[];
  errors: string[];
  datasetIds: string[];
}

export interface CrawlRuntimeOptions {
  campaign: CampaignDocument & { _id: Types.ObjectId };
  strategy: 'playwright' | 'cheerio' | 'auto';
  tenant?: Pick<TenantDocument, 'apolloCookie' | 'zoomCookie' | 'linkedinCookie'> | null;
}

function resolveCookie(
  auth: string | null | undefined,
  tenant?: Pick<TenantDocument, 'apolloCookie' | 'zoomCookie' | 'linkedinCookie'> | null,
): string | undefined {
  if (auth === 'apollo') {
    return tenant?.apolloCookie ?? undefined;
  }
  if (auth === 'zoom') {
    return tenant?.zoomCookie ?? undefined;
  }
  if (auth === 'linkedin') {
    return tenant?.linkedinCookie ?? undefined;
  }
  return undefined;
}

function buildHeaders(baseHeaders: Record<string, string> | undefined, authCookie?: string) {
  const headers = { ...(baseHeaders ?? {}) };
  if (authCookie) {
    headers.Cookie = authCookie;
  }
  return headers;
}

function ensureSeedUrls(campaign: CampaignDocument): string[] {
  if (campaign.seedUrls && campaign.seedUrls.length > 0) {
    return campaign.seedUrls;
  }
  const querySeedUrls = Array.isArray((campaign.query as Record<string, unknown>)?.seedUrls)
    ? ((campaign.query as Record<string, unknown>).seedUrls as string[])
    : [];
  if (querySeedUrls.length > 0) {
    return querySeedUrls;
  }
  throw new Error('Campaign does not define any seed URLs to crawl.');
}

async function runCheerio(options: CrawlRuntimeOptions): Promise<CrawlRuntimeResult> {
  const { campaign } = options;
  const seeds = ensureSeedUrls(campaign);
  const policy = await getPolicy(seeds[0]);
  const results: RawExtraction[] = [];
  const errors: string[] = [];
  const dataset = await Dataset.open(`campaign-${campaign._id}-${Date.now()}`);
  const datasetIds = [dataset.id];

  const proxyConfiguration = appConfig.proxyUrl
    ? new ProxyConfiguration({ proxyUrls: [appConfig.proxyUrl] })
    : undefined;

  const cookieHeader = resolveCookie(campaign.auth ?? null, options.tenant);
  const headers = buildHeaders(campaign.headers as Record<string, string> | undefined, cookieHeader);
  let completed = 0;
  const baseDelayMs = Math.max(0, policy.delayMs);
  const jitterMs = Math.max(0, policy.jitter);
  const derivedConcurrency = Math.max(1, Math.min(appConfig.maxConcurrency, Math.round(policy.maxRPS) || 1));

  const crawler = new CheerioCrawler({
    maxConcurrency: derivedConcurrency,
    navigationTimeoutSecs: appConfig.navTimeoutMs / 1000,
    requestHandlerTimeoutSecs: appConfig.requestTimeoutMs / 1000,
    maxRequestsPerCrawl: campaign.maxItems,
    proxyConfiguration,
    preNavigationHooks: [
      async ({ request }) => {
        request.headers = { ...(request.headers ?? {}), ...headers };
      },
    ],
    async requestHandler({ request, $ }) {
      if (completed >= campaign.maxItems) {
        return;
      }

      const extraction = extractFromCheerio($, request.loadedUrl ?? request.url, {
        selectors: (campaign.selectors as Record<string, string> | undefined) ?? undefined,
      });

      results.push(extraction);
      await dataset.pushData(extraction);
      completed += 1;

      const jitter = jitterMs > 0 ? randomInt(0, jitterMs) : 0;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitter));
    },
    failedRequestHandler({ request, error }) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${request.url}: ${message}`);
    },
  });

  await crawler.run(seeds);

  return { items: results, errors, datasetIds };
}

async function runPlaywright(options: CrawlRuntimeOptions): Promise<CrawlRuntimeResult> {
  const { campaign } = options;
  const seeds = ensureSeedUrls(campaign);
  const policy = await getPolicy(seeds[0]);
  const results: RawExtraction[] = [];
  const errors: string[] = [];
  const dataset = await Dataset.open(`campaign-${campaign._id}-${Date.now()}`);
  const datasetIds = [dataset.id];

  // Use proxy rotation if configured, otherwise fall back to single proxy
  let proxyConfiguration: ProxyConfiguration | undefined;
  const configuredProxies = appConfig.proxyUrls && appConfig.proxyUrls.length > 0 
    ? appConfig.proxyUrls 
    : appConfig.proxyUrl 
      ? [appConfig.proxyUrl] 
      : [];
  
  if (configuredProxies.length > 0) {
    proxyConfiguration = new ProxyConfiguration({ proxyUrls: configuredProxies });
    logger.info({ 
      proxyCount: configuredProxies.length,
      rotation: appConfig.proxyRotation 
    }, 'Using proxy configuration for LinkedIn scraping');
  } else {
    logger.warn('No proxies configured - LinkedIn may block requests more aggressively');
  }

  const cookieHeader = resolveCookie(campaign.auth ?? null, options.tenant);
  const headers = buildHeaders(campaign.headers as Record<string, string> | undefined, cookieHeader);
  let completed = 0;
  
  // LinkedIn-specific rate limiting (more aggressive)
  const isLinkedIn = campaign.auth === 'linkedin' || seeds[0].includes('linkedin.com');
  const baseDelayMs = isLinkedIn ? Math.max(3000, policy.delayMs) : Math.max(0, policy.delayMs);
  const jitterMs = isLinkedIn ? Math.max(2000, policy.jitter) : Math.max(0, policy.jitter);
  const derivedConcurrency = isLinkedIn ? 1 : Math.max(1, Math.min(appConfig.maxConcurrency, Math.round(policy.maxRPS) || 1));

  const crawler = new PlaywrightCrawler({
    maxConcurrency: derivedConcurrency,
    navigationTimeoutSecs: appConfig.navTimeoutMs / 1000,
    requestHandlerTimeoutSecs: appConfig.requestTimeoutMs / 1000,
    maxRequestsPerCrawl: campaign.maxItems,
    proxyConfiguration,
    launchContext: {
      useChrome: true,
      launchOptions: {
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
      },
    },
    preNavigationHooks: [
      async ({ page, request }) => {
        // Note: For LinkedIn, rate limiting is now handled at the job level
        // to avoid request handler timeouts. This hook just monitors responses.

        // Log HTTP responses for debugging and detect blocks
        page.on('response', (response) => {
          if (response.url() === request.url || response.url().includes('linkedin.com')) {
            const status = response.status();
            const logLevel = (status === 403 || status === 429) ? 'warn' : 'info';
            logger[logLevel]({ 
              url: response.url(), 
              status,
              statusText: response.statusText() 
            }, status === 429 ? 'LinkedIn rate limit hit' : status === 403 ? 'LinkedIn blocked request' : 'LinkedIn HTTP response');
            
            // Record rate limit or success
            if (status === 429) {
              rateLimiter.recordRateLimit(request.url);
              logger.error({ url: request.url }, 'HTTP 429 - Rate limit enforced by LinkedIn');
            } else if (status >= 200 && status < 300) {
              rateLimiter.recordSuccess(request.url);
            } else if (status >= 400) {
              rateLimiter.recordError(request.url);
            }
          }
        });
      },
      async ({ page, request }) => {
        // Set browser cookies for authentication (LinkedIn, etc.)
        if (cookieHeader && campaign.auth) {
          const url = new URL(request.url);
          const domain = url.hostname;
          const baseDomain = domain.startsWith('www.') ? domain.substring(4) : domain;
          
          // For LinkedIn, parse multiple cookies from the captured string
          if (campaign.auth === 'linkedin') {
            // cookieHeader contains multiple cookies like: "li_at=VALUE; JSESSIONID=VALUE; ..."
            const cookiePairs = cookieHeader.split(';').map(c => c.trim());
            const cookies = cookiePairs
              .filter(pair => pair.includes('='))
              .map(pair => {
                const equalIndex = pair.indexOf('=');
                const name = pair.substring(0, equalIndex).trim();
                let value = pair.substring(equalIndex + 1).trim();
                
                // Remove surrounding quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.slice(1, -1);
                }
                
                return {
                  name,
                  value,
                  domain: '.linkedin.com',
                  path: '/',
                  httpOnly: true,
                  secure: true,
                  sameSite: 'Lax' as const,
                };
              });
            
            await page.context().addCookies(cookies);
          } else {
            // Parse cookie header for other auth types
            const cookies = cookieHeader.split(';').map(cookie => {
              const [name, ...valueParts] = cookie.trim().split('=');
              return {
                name: name.trim(),
                value: valueParts.join('=').trim(),
                domain: '.' + baseDomain,
                path: '/',
              };
            });
            
            await page.context().addCookies(cookies);
          }
        }
        
        // Set additional HTTP headers (non-auth)
        const nonCookieHeaders = Object.entries(headers)
          .filter(([key]) => key.toLowerCase() !== 'cookie')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
          
        if (Object.keys(nonCookieHeaders).length > 0) {
          await page.setExtraHTTPHeaders(nonCookieHeaders);
        }
      },
    ],
    async requestHandler(context) {
      if (completed >= campaign.maxItems) {
        return;
      }

      const requestUrl = context.request.url;

      // Apply rate limiting BEFORE processing request
      if (isLinkedIn) {
        const stats = rateLimiter.getStats(requestUrl);
        logger.info({ stats }, 'Rate limiter stats before request');
        
        // Check if we're in backoff period
        if (rateLimiter.isBlocked(requestUrl)) {
          const delayMs = await rateLimiter.calculateDelay(requestUrl);
          logger.warn({ 
            delayMinutes: Math.round(delayMs / 60000),
            url: requestUrl 
          }, 'Domain is blocked, skipping this request for now');
          throw new Error(`Rate limited: wait ${Math.round(delayMs / 60000)} minutes`);
        }
      }

      // Log response status for debugging LinkedIn issues
      const response = context.page.mainFrame().url();
      logger.info({ 
        url: requestUrl, 
        loadedUrl: response,
        auth: campaign.auth 
      }, 'Page loaded successfully');

      // LinkedIn-specific wait logic for dynamic content
      if (campaign.auth === 'linkedin' && context.request.url.includes('linkedin.com')) {
        try {
          // Wait for main content container
          await context.page.waitForSelector('main, [role="main"]', { timeout: 5000 });
          
          // If it's a post page, wait for post content to load
          if (context.request.url.includes('/posts/')) {
            await context.page.waitForSelector('.feed-shared-update-v2, [data-test-id="main-feed-activity-card"]', { 
              timeout: 8000 
            }).catch(() => {
              logger.warn({ url: context.request.url }, 'LinkedIn post content selector not found');
            });
            
            // Additional wait for JavaScript rendering
            await context.page.waitForTimeout(2000);
          }
          
          // If it's a search/feed page, wait for feed items
          if (context.request.url.includes('/search/') || context.request.url.includes('/feed')) {
            await context.page.waitForSelector('.scaffold-finite-scroll__content', { timeout: 5000 }).catch(() => {});
            await context.page.waitForTimeout(1500);
          }
        } catch (error) {
          logger.warn({ 
            url: context.request.url, 
            error: error instanceof Error ? error.message : String(error) 
          }, 'LinkedIn wait logic failed, continuing anyway');
        }
      }

      if (campaign.waitFor) {
        await context.page.waitForSelector(campaign.waitFor, {
          timeout: appConfig.navTimeoutMs,
        });
      }

      // Additional delay for LinkedIn to avoid rate limiting
      if (campaign.auth === 'linkedin' && context.request.url.includes('linkedin.com')) {
        const randomDelay = 2000 + Math.random() * 3000; // 2-5 seconds
        logger.info({ delay: Math.round(randomDelay) }, 'Adding LinkedIn rate limit delay');
        await context.page.waitForTimeout(randomDelay);
      }

      const extraction = await extractFromPlaywright(context, {
        selectors: (campaign.selectors as Record<string, string> | undefined) ?? undefined,
      });

      results.push(extraction);
      await dataset.pushData(extraction);
      completed += 1;

      // Record successful extraction (if LinkedIn)
      if (isLinkedIn) {
        logger.info({ 
          url: requestUrl,
          extractedFields: Object.keys(extraction.data || {}).length 
        }, 'LinkedIn extraction successful');
      }

      const jitter = jitterMs > 0 ? randomInt(0, jitterMs) : 0;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitter));
    },
    failedRequestHandler({ request, error }) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${request.url}: ${message}`);
      
      // Record error with rate limiter (if LinkedIn and not already rate limited)
      if (isLinkedIn && !message.includes('Rate limited')) {
        rateLimiter.recordError(request.url);
        logger.error({ url: request.url, error: message }, 'LinkedIn request failed');
      }
    },
  });

  await crawler.run(seeds);

  return { items: results, errors, datasetIds };
}

export async function runCrawl(options: CrawlRuntimeOptions): Promise<CrawlRuntimeResult> {
  logger.info(
    {
      campaignId: options.campaign._id,
      strategy: options.strategy,
      maxItems: options.campaign.maxItems,
    },
    'Starting crawl run',
  );

  if (options.strategy === 'cheerio') {
    return runCheerio(options);
  }

  if (options.strategy === 'playwright') {
    return runPlaywright(options);
  }

  try {
    const result = await runCheerio(options);
    if (result.items.length > 0 || result.errors.length === 0) {
      return result;
    }
    logger.warn({ campaignId: options.campaign._id }, 'Cheerio run yielded no results, falling back');
  } catch (error) {
    logger.warn({ err: error, campaignId: options.campaign._id }, 'Cheerio run failed, falling back');
  }

  return runPlaywright(options);
}
