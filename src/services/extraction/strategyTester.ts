import { chromium } from 'playwright';
import { logger } from '../../utils/logger';
import type { TenantDocument } from '../../db/models/Tenant';
import type { StrategyDocument, SelectorConfig } from '../../db/models/Strategy';

interface TestStrategyOptions {
  strategy: StrategyDocument;
  testUrl: string;
  tenant: TenantDocument;
}

interface TestResult {
  success: boolean;
  url: string;
  strategyName: string;
  extractedData: Record<string, unknown>;
  selectorResults: Array<{
    field: string;
    selector: string;
    found: boolean;
    value: unknown;
    error?: string;
  }>;
  screenshotUrl?: string;
  duration: number;
}

/**
 * Test a strategy on a sample URL to validate selectors
 */
export async function testStrategy(options: TestStrategyOptions): Promise<TestResult> {
  const { strategy, testUrl, tenant } = options;
  const startTime = Date.now();

  logger.info({ strategyId: strategy._id, testUrl }, 'Testing strategy');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });

    // Inject authentication cookies if needed
    if (strategy.authType === 'linkedin' && tenant.linkedinCookie) {
      const cookies = parseLinkedInCookies(tenant.linkedinCookie);
      await context.addCookies(cookies);
    } else if (strategy.authType === 'apollo' && tenant.apolloCookie) {
      await context.addCookies([{
        name: '_apollo_session',
        value: tenant.apolloCookie,
        domain: '.apollo.io',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      }]);
    }

    const page = await context.newPage();
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // LinkedIn-specific wait logic for dynamic content
    if (strategy.authType === 'linkedin' && testUrl.includes('linkedin.com')) {
      try {
        // Wait for main content
        await page.waitForSelector('main, [role="main"]', { timeout: 5000 });
        
        // If it's a post page, wait for post content
        if (testUrl.includes('/posts/')) {
          await page.waitForSelector('.feed-shared-update-v2, [data-test-id="main-feed-activity-card"]', { 
            timeout: 8000 
          }).catch(() => {
            logger.warn({ url: testUrl }, 'LinkedIn post content not found');
          });
          
          // Additional wait for JavaScript rendering
          await page.waitForTimeout(3000);
        }
        
        // If it's a search/feed page
        if (testUrl.includes('/search/') || testUrl.includes('/feed')) {
          await page.waitForSelector('.scaffold-finite-scroll__content', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }
      } catch (error) {
        logger.warn({ 
          url: testUrl, 
          error: error instanceof Error ? error.message : String(error) 
        }, 'LinkedIn wait logic failed in tester');
      }
    } else {
      await page.waitForTimeout(1000);
    }

    // Test each selector
    const selectorResults = await testSelectors(page, strategy.selectors);
    
    // Extract data using the selectors
    const extractedData: Record<string, unknown> = {};
    for (const result of selectorResults) {
      if (result.found) {
        extractedData[result.field] = result.value;
      }
    }

    const duration = Date.now() - startTime;
    await browser.close();

    const success = selectorResults.filter(r => r.found).length > 0;

    logger.info({ 
      strategyId: strategy._id, 
      success,
      fieldsFound: selectorResults.filter(r => r.found).length,
      duration,
    }, 'Strategy test complete');

    return {
      success,
      url: testUrl,
      strategyName: strategy.name,
      extractedData,
      selectorResults,
      duration,
    };
  } catch (error) {
    await browser.close();
    logger.error({ error, strategyId: strategy._id, testUrl }, 'Strategy test failed');
    
    return {
      success: false,
      url: testUrl,
      strategyName: strategy.name,
      extractedData: {},
      selectorResults: [],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Test all selectors on the page
 */
async function testSelectors(page: any, selectors: SelectorConfig[]) {
  const results = [];

  for (const selectorConfig of selectors) {
    try {
      const { selector, field, type, attribute, multiple } = selectorConfig;

      let value: unknown = null;
      let found = false;

      if (multiple) {
        // Multiple elements
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          found = true;
          if (type === 'text') {
            value = await Promise.all(elements.map((el: any) => el.innerText()));
          } else if (type === 'href') {
            value = await Promise.all(elements.map((el: any) => el.getAttribute('href')));
          } else if (type === 'src') {
            value = await Promise.all(elements.map((el: any) => el.getAttribute('src')));
          } else if (type === 'attribute' && attribute) {
            value = await Promise.all(elements.map((el: any) => el.getAttribute(attribute)));
          }
        }
      } else {
        // Single element
        const element = await page.$(selector);
        if (element) {
          found = true;
          if (type === 'text') {
            value = await element.innerText();
          } else if (type === 'href') {
            value = await element.getAttribute('href');
          } else if (type === 'src') {
            value = await element.getAttribute('src');
          } else if (type === 'attribute' && attribute) {
            value = await element.getAttribute(attribute);
          } else if (type === 'html') {
            value = await element.innerHTML();
          }
        }
      }

      results.push({
        field,
        selector,
        found,
        value,
      });
    } catch (error: any) {
      results.push({
        field: selectorConfig.field,
        selector: selectorConfig.selector,
        found: false,
        value: null,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Parse LinkedIn cookie string into Playwright cookie format
 */
function parseLinkedInCookies(cookieString: string) {
  return cookieString.split(';').map(pair => {
    const [name, ...valueParts] = pair.trim().split('=');
    let value = valueParts.join('=').trim();
    
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    
    return {
      name: name.trim(),
      value,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    };
  });
}
