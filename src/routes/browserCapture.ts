import { Router } from 'express';
import { chromium } from 'playwright';
import { TenantModel, type TenantDocument } from '../db/models/Tenant';
import { logger } from '../utils/logger';

const router = Router();

// Launch browser for manual login and capture cookies
router.post('/capture-cookies', async (req, res, next) => {
  const { platform } = req.body; // 'linkedin', 'apollo', 'zoom'
  
  try {
    const tenant = res.locals.tenant as TenantDocument;
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Map platforms to their login URLs
    const platformUrls: Record<string, string> = {
      linkedin: 'https://www.linkedin.com/login',
      apollo: 'https://app.apollo.io/login',
      zoom: 'https://zoom.us/signin',
    };

    const url = platformUrls[platform];
    if (!url) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    logger.info(`Launching browser for ${platform} cookie capture`);

    // Launch browser with stealth settings to avoid detection
    const browser = await chromium.launch({
      headless: false, // User needs to see the browser to login
      args: [
        '--disable-blink-features=AutomationControlled', // Remove automation flags
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: [],
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    });

    // Remove webdriver flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();
    
    // Navigate to login page
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    logger.info(`Browser opened at ${url}. Waiting for user to login...`);

    // Wait for user to navigate away from login page (indicating successful login)
    let cookiesCapture: string = '';
    const checkInterval = setInterval(async () => {
      try {
        const currentUrl = page.url();
        
        // Check if user has navigated away from login page
        if (!currentUrl.includes('login') && !currentUrl.includes('signin')) {
          clearInterval(checkInterval);
          
          // Get all cookies from the browser
          const cookies = await context.cookies();
          
          // Find the main auth cookie based on platform
          let authCookie: string | undefined;
          
          if (platform === 'linkedin') {
            // Capture ALL LinkedIn cookies, not just li_at
            // LinkedIn needs multiple cookies for proper authentication
            const linkedinCookies = cookies
              .filter(c => ['li_at', 'JSESSIONID', 'liap', 'bcookie', 'bscookie', 'lang'].includes(c.name))
              .map(c => `${c.name}=${c.value}`)
              .join('; ');
            
            if (linkedinCookies) {
              authCookie = linkedinCookies;
              logger.info(`LinkedIn cookies captured: ${cookies.length} total cookies, ${linkedinCookies.split(';').length} auth cookies`);
            }
          } else if (platform === 'apollo') {
            // Apollo might use different cookie names - capture all
            const apolloCookies = cookies
              .map(c => `${c.name}=${c.value}`)
              .join('; ');
            authCookie = apolloCookies;
            logger.info('Apollo cookies captured');
          } else if (platform === 'zoom') {
            const zoomCookies = cookies
              .map(c => `${c.name}=${c.value}`)
              .join('; ');
            authCookie = zoomCookies;
            logger.info('Zoom cookies captured');
          }

          if (authCookie) {
            // Save cookies to tenant
            const updateField = `${platform}Cookie`;
            await TenantModel.findOneAndUpdate(
              { _id: tenant._id },
              { $set: { [updateField]: authCookie } }
            );

            cookiesCapture = authCookie;
            logger.info(`${platform} cookies saved to tenant`);
            
            // Show success message in browser
            await page.evaluate(() => {
              const div = document.createElement('div');
              div.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                z-index: 999999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              `;
              div.textContent = '✓ Cookies captured! You can close this window.';
              document.body.appendChild(div);
            });

            // Close browser after 3 seconds
            setTimeout(async () => {
              await browser.close();
            }, 3000);
          }
        }
      } catch (error) {
        // Page might be closed
        clearInterval(checkInterval);
      }
    }, 2000); // Check every 2 seconds

    // Set timeout to close browser after 5 minutes if user doesn't login
    setTimeout(async () => {
      clearInterval(checkInterval);
      try {
        await browser.close();
      } catch (e) {
        // Browser might already be closed
      }
    }, 5 * 60 * 1000);

    res.json({ 
      success: true, 
      message: 'Browser launched. Please login and the cookies will be captured automatically.' 
    });

  } catch (error) {
    logger.error('Failed to capture cookies');
    next(error);
  }
});

export function createBrowserCaptureRouter() {
  return router;
}
