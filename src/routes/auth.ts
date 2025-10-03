import { Router } from 'express';
import { chromium } from 'playwright';
import { TenantModel, type TenantDocument } from '../db/models/Tenant';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/auth/linkedin/capture - Launch browser for user to login
router.post('/linkedin/capture', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    logger.info('Launching browser for LinkedIn authentication capture');

    // Launch browser in NON-headless mode so user can interact
    const browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Navigate to LinkedIn login
    await page.goto('https://www.linkedin.com/login');

    logger.info('Browser launched - waiting for user to login...');

    // Send initial response
    res.json({
      message: 'Browser launched! Please log in to LinkedIn in the browser window that just opened.',
      status: 'waiting_for_login',
    });

    // Wait for navigation to feed (indicates successful login)
    try {
      await page.waitForURL('**/feed/**', { timeout: 300000 }); // 5 minutes
      
      logger.info('User logged in successfully, capturing cookies...');

      // Get all cookies
      const cookies = await context.cookies();
      
      // Find the li_at cookie (primary auth token)
      const liAtCookie = cookies.find(c => c.name === 'li_at');
      
      if (liAtCookie) {
        // Store the cookie in the database
        await TenantModel.findOneAndUpdate(
          { _id: tenant._id },
          { $set: { linkedinCookie: liAtCookie.value } },
          { new: true }
        );

        logger.info('LinkedIn cookie captured and stored successfully');

        // Show success message in the browser
        await page.evaluate(() => {
          const div = document.createElement('div');
          div.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #0a66c2; color: white; padding: 20px 40px; border-radius: 8px; font-family: sans-serif; font-size: 18px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
          div.innerHTML = '✓ Authentication captured successfully!<br><small style="font-size: 14px;">This window will close in 3 seconds...</small>';
          document.body.appendChild(div);
        });

        // Wait a bit for user to see the message
        await page.waitForTimeout(3000);
        
        await browser.close();

        logger.info('Browser closed, cookie capture complete');
      } else {
        logger.error('Could not find li_at cookie after login');
        await browser.close();
      }

    } catch (error) {
      logger.error('Timeout or error waiting for login');
      await browser.close();
    }

  } catch (error) {
    logger.error('Failed to capture LinkedIn authentication');
    next(error);
  }
});

// GET /api/auth/linkedin/status - Check if LinkedIn auth is configured
router.get('/linkedin/status', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({
      configured: !!tenant.linkedinCookie,
      hasToken: tenant.linkedinCookie ? true : false,
    });
  } catch (error) {
    logger.error('Failed to check LinkedIn auth status');
    next(error);
  }
});

export function createAuthRouter() {
  return router;
}
