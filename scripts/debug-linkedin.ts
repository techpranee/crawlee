import { chromium } from 'playwright';

async function debugLinkedInPage() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  // Add LinkedIn cookies (replace with actual cookies)
  const cookies = [
    { name: 'li_at', value: 'YOUR_LI_AT_VALUE', domain: '.linkedin.com', path: '/', httpOnly: true, secure: true },
    { name: 'JSESSIONID', value: 'YOUR_JSESSIONID_VALUE', domain: '.linkedin.com', path: '/', httpOnly: true, secure: true }
  ];
  await context.addCookies(cookies);
  
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/posts/pam-legacygroup_hiring-activity-7379773519699726336-dGTQ');
  
  // Wait for content
  await page.waitForTimeout(5000);
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/linkedin-post.png', fullPage: true });
  
  // Get all text content
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Page text (first 500 chars):', bodyText.substring(0, 500));
  
  // Get all links
  const links = await page.evaluate(() => 
    Array.from(document.querySelectorAll('a')).map(a => ({ 
      href: a.href, 
      text: a.textContent?.trim().substring(0, 50) 
    })).slice(0, 20)
  );
  console.log('Links:', JSON.stringify(links, null, 2));
  
  // Try common selectors
  const selectors = [
    'div[role="article"]',
    '.feed-shared-update-v2',
    '[data-test-id]',
    '.update-components-text',
    '.feed-shared-text'
  ];
  
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    console.log(`Selector "${selector}": found ${count} elements`);
  }
  
  await browser.close();
}

debugLinkedInPage().catch(console.error);
