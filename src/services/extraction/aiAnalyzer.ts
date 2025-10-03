import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { appConfig } from '../../config/env';
import { logger } from '../../utils/logger';
import type { TenantDocument } from '../../db/models/Tenant';
import type { SelectorConfig } from '../../db/models/Strategy';

interface AnalyzePageOptions {
  url: string;
  platform: 'linkedin' | 'apollo' | 'zoom' | 'generic';
  targetFields?: string[];
  naturalLanguagePrompt?: string; // New: plain language description
  tenant: TenantDocument;
}

interface AnalysisResult {
  url: string;
  platform: string;
  suggestedSelectors: SelectorConfig[];
  pageStructure: {
    title: string | null;
    bodyText: string;
    formFields: string[];
    links: number;
    images: number;
  };
  confidence: number;
  aiAnalysis?: string;
}

/**
 * Analyze page scraped with Firecrawl
 */
async function analyzePageWithFirecrawl(
  url: string,
  platform: string,
  firecrawlResult: { html: string; screenshot: string | null },
  options: AnalyzePageOptions
): Promise<AnalysisResult> {
  const { targetFields } = options;
  const htmlContent = firecrawlResult.html;
  
  // Extract basic page structure from HTML
  const pageStructure = {
    title: htmlContent.match(/<title>(.*?)<\/title>/i)?.[1] || 'Untitled',
    bodyText: htmlContent.replace(/<[^>]*>/g, '').substring(0, 500),
    formFields: [],
    links: (htmlContent.match(/<a /gi) || []).length,
    images: (htmlContent.match(/<img /gi) || []).length,
  };

  logger.info({ 
    pageTitle: pageStructure.title,
    bodyTextLength: pageStructure.bodyText.length,
    linksCount: pageStructure.links,
    imagesCount: pageStructure.images,
    hasScreenshot: !!firecrawlResult.screenshot
  }, 'Firecrawl page analyzed');

  // Convert Firecrawl screenshot (if available) or use a placeholder
  let screenshotBase64 = firecrawlResult.screenshot;
  let screenshot: Buffer | null = null;
  
  if (screenshotBase64) {
    // Firecrawl returns base64 with or without prefix
    if (screenshotBase64.startsWith('data:image')) {
      screenshotBase64 = screenshotBase64.split(',')[1];
    }
    screenshot = Buffer.from(screenshotBase64, 'base64');
  }

  // Save screenshot and HTML locally for LinkedIn pages
  let savedFilesPath: string | undefined;
  if (platform === 'linkedin' && screenshot) {
    try {
      const timestamp = Date.now();
      const sanitizedUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const captureDir = path.join(
        process.cwd(),
        'storage',
        'ai-analysis',
        `firecrawl-${platform}-${sanitizedUrl}-${timestamp}`
      );

      await fs.mkdir(captureDir, { recursive: true });

      // Save screenshot
      await fs.writeFile(path.join(captureDir, 'screenshot.jpg'), screenshot);

      // Save HTML
      await fs.writeFile(path.join(captureDir, 'page.html'), htmlContent, 'utf-8');

      // Save metadata
      const metadata = {
        url,
        finalUrl: url,
        platform,
        timestamp: new Date().toISOString(),
        targetFields,
        naturalLanguagePrompt: options.naturalLanguagePrompt,
        screenshotSize: screenshot.length,
        htmlSize: htmlContent.length,
        pageTitle: pageStructure.title,
        bodyTextLength: pageStructure.bodyText.length,
        linksCount: pageStructure.links,
        redirected: false,
        scrapedWith: 'firecrawl',
      };
      await fs.writeFile(
        path.join(captureDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );

      savedFilesPath = captureDir;
      logger.info({ captureDir }, 'Saved Firecrawl page capture locally');
    } catch (error) {
      logger.error({ error }, 'Failed to save Firecrawl page capture');
    }
  }

  // Analyze with AI
  const suggestedSelectors = await analyzeWithAI(
    htmlContent,
    platform,
    targetFields,
    options.naturalLanguagePrompt,
    screenshotBase64 || undefined,
    savedFilesPath
  );

  return {
    url,
    platform,
    suggestedSelectors,
    pageStructure,
    confidence: 0.75,
  };
}

/**
 * Use Firecrawl to scrape LinkedIn page (bypasses authentication issues)
 */
async function scrapeWithFirecrawl(url: string, retries = 2): Promise<{ html: string; screenshot: string | null; success: boolean }> {
  if (!appConfig.firecrawlApiUrl) {
    logger.warn('Firecrawl API URL not configured');
    return { html: '', screenshot: null, success: false };
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      logger.info({ 
        url, 
        firecrawlUrl: appConfig.firecrawlApiUrl,
        attempt,
        maxAttempts: retries + 1
      }, 'Attempting to scrape with Firecrawl');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(`${appConfig.firecrawlApiUrl}/v1/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appConfig.firecrawlApiKey ? { 'Authorization': `Bearer ${appConfig.firecrawlApiKey}` } : {}),
        },
        body: JSON.stringify({
          url,
          formats: ['html', 'screenshot'],
          onlyMainContent: false,
          waitFor: 5000, // Wait 5 seconds for content to load
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        
        // Check if it's a rate limit or server error that we should retry
        if (attempt <= retries && (response.status === 429 || response.status >= 500)) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
          logger.warn({ 
            status: response.status, 
            attempt,
            backoffSeconds: backoffMs / 1000,
            url
          }, 'Firecrawl error - will retry');
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        logger.error({ 
          status: response.status, 
          statusText: response.statusText,
          error: errorText.substring(0, 1000),
          url: url,
          attempt
        }, 'Firecrawl API error - response not OK');
        return { html: '', screenshot: null, success: false };
      }

      const data = await response.json();
      
      // Check if Firecrawl returned an error in the response body
      if (data.success === false || data.error) {
        // Retry on temporary errors
        if (attempt <= retries && data.error?.includes('timeout')) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          logger.warn({
            error: data.error,
            attempt,
            backoffSeconds: backoffMs / 1000,
            url
          }, 'Firecrawl timeout - will retry');
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        logger.error({
          error: data.error || 'Unknown error',
          message: data.message || 'No message',
          url: url,
          attempt
        }, 'Firecrawl returned error in response');
        return { html: '', screenshot: null, success: false };
      }
      
      logger.info({ 
        hasHtml: !!data.data?.html,
        hasScreenshot: !!data.data?.screenshot,
        htmlSize: data.data?.html?.length || 0,
        dataKeys: Object.keys(data),
        attempt
      }, 'Firecrawl scraping successful');

      // Firecrawl v1 API returns data nested in 'data' field
      const scrapedData = data.data || data;

      return {
        html: scrapedData.html || scrapedData.content || '',
        screenshot: scrapedData.screenshot || null, // Base64 screenshot
        success: true,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Retry on network errors
      if (attempt <= retries) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        logger.warn({ 
          error: lastError.message,
          attempt,
          backoffSeconds: backoffMs / 1000,
          url
        }, 'Firecrawl request failed - will retry');
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      logger.error({ error: lastError, url, attempt }, 'Firecrawl scraping failed after all retries');
    }
  }

  // All retries exhausted
  return { html: '', screenshot: null, success: false };
}

/**
 * Analyze a page using AI to suggest optimal selectors
 */
export async function analyzePage(options: AnalyzePageOptions): Promise<AnalysisResult> {
  const { url, platform, targetFields, tenant } = options;

  // Try Firecrawl first for LinkedIn pages (better authentication handling)
  if (platform === 'linkedin' && appConfig.firecrawlApiUrl) {
    logger.info({ url }, 'Using Firecrawl for LinkedIn scraping');
    
    const firecrawlResult = await scrapeWithFirecrawl(url);
    
    if (firecrawlResult.success && firecrawlResult.html) {
      return analyzePageWithFirecrawl(url, platform, firecrawlResult, options);
    }
    
    logger.warn('Firecrawl failed, falling back to Playwright');
  }

  // Fallback to Playwright
  logger.info({ url, platform }, 'Launching browser for AI analysis');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Inject authentication cookies if available
    if (platform === 'linkedin' && tenant.linkedinCookie) {
      const cookies = parseLinkedInCookies(tenant.linkedinCookie);
      await context.addCookies(cookies);
      logger.info({ 
        cookieCount: cookies.length,
        cookieNames: cookies.map(c => c.name),
        hasCriticalCookies: cookies.some(c => c.name === 'li_at')
      }, 'Added LinkedIn cookies to browser context');
    } else if (platform === 'apollo' && tenant.apolloCookie) {
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
    
    // Navigate and wait for content - be more patient for LinkedIn
    logger.info({ url, platform }, 'Navigating to page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for network to be idle (especially important for LinkedIn)
    logger.info('Waiting for network idle...');
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    
    // Additional wait for LinkedIn's dynamic content to render
    if (platform === 'linkedin') {
      logger.info('LinkedIn detected, waiting for content to render...');
      
      // Wait for the feed to appear (common selectors for LinkedIn content)
      try {
        await page.waitForSelector('div[data-id], div.feed-shared-update-v2, div.scaffold-finite-scroll__content', { 
          timeout: 30000 
        });
        logger.info('LinkedIn content container found');
      } catch (e) {
        logger.warn('LinkedIn content container not found, continuing anyway');
      }
      
      // Extra wait for JavaScript to finish rendering
      await page.waitForTimeout(5000);
      
      // Scroll a bit to trigger lazy loading (wrap in try-catch in case of navigation)
      try {
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.scrollBy(0, -300));
        await page.waitForTimeout(1000);
      } catch (e) {
        logger.warn({ error: e }, 'Could not scroll page (may have navigated)');
      }
    } else {
      // For other platforms, still wait a bit for dynamic content
      await page.waitForTimeout(3000);
    }
    
    logger.info('Page fully loaded, extracting content...');

    // Check if page is still valid (hasn't been destroyed/navigated)
    if (page.isClosed()) {
      throw new Error('Page was closed unexpectedly');
    }

    // Extract page structure
    let pageStructure;
    try {
      pageStructure = await page.evaluate(() => {
        const title = document.title;
        const bodyText = document.body.innerText.substring(0, 500); // First 500 chars
        
        const formFields = Array.from(document.querySelectorAll('input, textarea, select'))
          .map(el => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            name: el.getAttribute('name') || '',
            id: el.id || '',
            placeholder: el.getAttribute('placeholder') || '',
          }));

        return {
          title,
          bodyText,
          formFields: formFields.map(f => JSON.stringify(f)),
          links: document.querySelectorAll('a').length,
          images: document.querySelectorAll('img').length,
        };
      });
    } catch (error) {
      logger.error({ error }, 'Failed to extract page structure (execution context may have been destroyed)');
      throw new Error('Page navigation or execution context error - LinkedIn may have redirected');
    }

    // Get HTML structure for analysis
    const htmlContent = await page.content();
    const finalUrl = page.url();
    
    // Check if LinkedIn redirected us (e.g., to login page)
    if (platform === 'linkedin' && url !== finalUrl) {
      logger.warn({ 
        requestedUrl: url, 
        finalUrl,
        pageTitle: pageStructure.title
      }, 'LinkedIn redirected to different URL - cookies may not be working');
    }
    
    // Capture screenshot for vision model analysis (viewport only, not full page for performance)
    const screenshot = await page.screenshot({ 
      fullPage: false, // Only capture viewport to reduce size
      type: 'jpeg', // JPEG is smaller than PNG
      quality: 80 // Good quality but compressed
    });
    const screenshotBase64 = screenshot.toString('base64');
    
    logger.info({ 
      screenshotSize: screenshot.length,
      screenshotSizeKB: Math.round(screenshot.length / 1024),
      pageTitle: pageStructure.title,
      bodyTextLength: pageStructure.bodyText.length,
      linksCount: pageStructure.links,
      imagesCount: pageStructure.images,
      finalUrl
    }, 'Screenshot captured and page analyzed');
    
    // Verify we have actual content (not just a loading screen or login page)
    if (platform === 'linkedin' && (pageStructure.bodyText.length < 100 || pageStructure.links < 5)) {
      logger.warn({ 
        bodyTextLength: pageStructure.bodyText.length,
        linksCount: pageStructure.links,
        pageTitle: pageStructure.title,
        finalUrl
      }, 'Warning: Page may not be fully loaded (low content detected)');
    }
    
    // Save screenshot and HTML locally for LinkedIn pages for experimentation
    let savedFilesPath: string | undefined;
    if (platform === 'linkedin') {
      try {
        const timestamp = Date.now();
        const sanitizedUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const captureDir = path.join(process.cwd(), 'storage', 'ai-analysis', `${platform}-${sanitizedUrl}-${timestamp}`);
        
        await fs.mkdir(captureDir, { recursive: true });
        
        // Save screenshot
        await fs.writeFile(path.join(captureDir, 'screenshot.jpg'), screenshot);
        
        // Save HTML
        await fs.writeFile(path.join(captureDir, 'page.html'), htmlContent, 'utf-8');
        
        // Save metadata
        const metadata = {
          url,
          finalUrl,
          platform,
          timestamp: new Date().toISOString(),
          targetFields,
          naturalLanguagePrompt: options.naturalLanguagePrompt,
          screenshotSize: screenshot.length,
          htmlSize: htmlContent.length,
          pageTitle: pageStructure.title,
          bodyTextLength: pageStructure.bodyText.length,
          linksCount: pageStructure.links,
          redirected: url !== finalUrl,
        };
        await fs.writeFile(
          path.join(captureDir, 'metadata.json'), 
          JSON.stringify(metadata, null, 2), 
          'utf-8'
        );
        
        savedFilesPath = captureDir;
        logger.info({ captureDir }, 'Saved LinkedIn page capture locally for experimentation');
      } catch (error) {
        logger.error({ error }, 'Failed to save LinkedIn page capture locally');
      }
    }
    
    // Analyze with Ollama (vision model with screenshot + HTML)
    const suggestedSelectors = await analyzeWithAI(
      htmlContent, 
      platform, 
      targetFields, 
      options.naturalLanguagePrompt,
      screenshotBase64,
      savedFilesPath
    );

    await browser.close();

    logger.info({ url, selectorCount: suggestedSelectors.length }, 'AI analysis complete');

    return {
      url,
      platform,
      suggestedSelectors,
      pageStructure,
      confidence: 0.75, // TODO: Calculate based on AI confidence scores
    };
  } catch (error) {
    await browser.close();
    logger.error({ error, url }, 'Failed to analyze page');
    throw error;
  }
}

/**
 * Use Ollama vision model to analyze HTML AND screenshot to suggest selectors
 */
async function analyzeWithAI(
  htmlContent: string,
  platform: string,
  targetFields?: string[],
  naturalLanguagePrompt?: string,
  screenshotBase64?: string,
  savedFilesPath?: string
): Promise<SelectorConfig[]> {
  try {
    // Simplify HTML for AI analysis (remove scripts, styles, etc.)
    const simplifiedHtml = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .substring(0, 8000); // Limit to 8000 chars for AI

    // Build prompt based on input type
    let prompt: string;
    if (naturalLanguagePrompt) {
      // Natural language mode with vision analysis
      prompt = `You are an expert at web scraping and CSS selector generation. I'm providing you with BOTH a screenshot and HTML code of a ${platform} page.

TASK: ${naturalLanguagePrompt}

INSTRUCTIONS:
1. First, visually analyze the screenshot to identify where the requested elements appear on the page
2. Then, cross-reference those visual elements with the HTML structure below
3. Generate precise CSS selectors by matching visual position with DOM structure
4. Pay attention to:
   - Element positioning and layout (what's near the top, in cards, in lists, etc.)
   - Visual hierarchy (headers vs body text, bold vs normal, size differences)
   - Repeated patterns (list items, cards, posts)
   - Distinguishing features (icons, avatars, timestamps)

HTML Structure:
${simplifiedHtml}

Respond with ONLY valid JSON in this exact format:
{
  "selectors": [
    {
      "selector": "div.profile-name h1",
      "field": "person_name",
      "type": "text",
      "required": true,
      "multiple": false,
      "visualContext": "Located at top-left, large bold text next to avatar"
    }
  ]
}`;
    } else {
      // Traditional field-based mode with vision analysis
      const fields = targetFields && targetFields.length > 0 ? targetFields.join(', ') : 'relevant data fields';
      prompt = `You are an expert at web scraping and CSS selector generation. I'm providing you with BOTH a screenshot and HTML code of a ${platform} page.

TASK: Extract these fields: ${fields}

INSTRUCTIONS:
1. Visually analyze the screenshot to locate the requested fields
2. Match those visual elements with the HTML structure below
3. Generate CSS selectors based on visual + structural analysis

HTML Structure:
${simplifiedHtml}

Respond with ONLY valid JSON in this exact format:
{
  "selectors": [
    {
      "selector": "div.profile-name h1",
      "field": "name",
      "type": "text",
      "required": true,
      "multiple": false,
      "visualContext": "Top section, bold text"
    }
  ]
}`;
    }

    // Normalize Ollama URL (remove trailing slash)
    const ollamaBaseUrl = appConfig.ollamaUrl.replace(/\/$/, '');
    
    // Build request body for vision model
    const requestBody: any = {
      model: appConfig.ollamaModel,
      prompt,
      stream: false,
      options: {
        temperature: 0.2, // Low temperature for more deterministic output
        top_p: 0.9,
      },
    };

    // Add screenshot for vision model if available
    if (screenshotBase64) {
      requestBody.images = [screenshotBase64];
      const sizeKB = Math.round(Buffer.from(screenshotBase64, 'base64').length / 1024);
      logger.info({ 
        screenshotSizeKB: sizeKB,
        savedFilesPath: savedFilesPath || 'not saved'
      }, 'Sending screenshot to vision model for analysis');
    }
    
    // If files were saved locally, log the path for easy access
    if (savedFilesPath) {
      logger.info({ 
        savedFilesPath,
        instructions: `Files saved locally. You can experiment with different models by loading: ${savedFilesPath}/screenshot.jpg and ${savedFilesPath}/page.html`
      }, 'LinkedIn page captured for local experimentation');
    }
    
    logger.info({ 
      url: ollamaBaseUrl, 
      model: appConfig.ollamaModel,
      hasImage: !!screenshotBase64 
    }, 'Calling Ollama API');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 minute timeout
    
    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ 
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        ollamaUrl: ollamaBaseUrl,
        model: appConfig.ollamaModel,
        hasScreenshot: !!screenshotBase64
      }, 'Ollama API request failed');
      throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = data.response;

    logger.info({ 
      responseLength: aiResponse?.length,
      hasScreenshot: !!screenshotBase64,
      model: appConfig.ollamaModel
    }, 'Received AI analysis response');

    // Extract JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ aiResponse: aiResponse?.substring(0, 500) }, 'AI response does not contain valid JSON');
      return getFallbackSelectors(platform, targetFields || []);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const selectors = parsed.selectors || [];
    
    logger.info({ 
      selectorCount: selectors.length,
      usedVisionModel: !!screenshotBase64
    }, 'Successfully parsed AI-generated selectors');
    
    return selectors;
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ollamaUrl: appConfig.ollamaUrl,
      ollamaModel: appConfig.ollamaModel
    }, 'AI analysis failed, using fallback selectors');
    return getFallbackSelectors(platform, targetFields || []);
  }
}

/**
 * Fallback selectors if AI analysis fails
 */
function getFallbackSelectors(platform: string, targetFields: string[]): SelectorConfig[] {
  const fallbacks: Record<string, SelectorConfig[]> = {
    linkedin: [
      { selector: 'h1.text-heading-xlarge', field: 'name', type: 'text', required: true },
      { selector: 'div.text-body-medium', field: 'title', type: 'text', required: false },
      { selector: 'a[href*="linkedin.com/in/"]', field: 'linkedin_url', type: 'href', required: false },
    ],
    apollo: [
      { selector: 'h1.contact-name', field: 'name', type: 'text', required: true },
      { selector: 'div.contact-title', field: 'title', type: 'text', required: false },
      { selector: 'a[href^="mailto:"]', field: 'email', type: 'href', required: false },
    ],
    generic: [
      { selector: 'h1', field: 'name', type: 'text', required: true },
      { selector: 'title', field: 'pageTitle', type: 'text', required: false },
      { selector: 'a[href^="mailto:"]', field: 'email', type: 'href', required: false },
    ],
  };

  const platformSelectors = fallbacks[platform] || fallbacks.generic;
  return platformSelectors.filter(s => targetFields.includes(s.field));
}

/**
 * Parse LinkedIn cookie string into Playwright cookie format
 */
function parseLinkedInCookies(cookieString: string) {
  return cookieString.split(';').map(pair => {
    const [name, ...valueParts] = pair.trim().split('=');
    let value = valueParts.join('=').trim();
    
    // Remove quotes
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
