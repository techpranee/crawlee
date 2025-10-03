#!/usr/bin/env tsx
/**
 * Direct test of LinkedIn scraping with cookies
 */

import { chromium } from 'playwright';

const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://techpranee_crawlee:GRCEphLQgG6ketxx@crawlee.qjsnzmj.mongodb.net/crawlee';

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

async function testLinkedInWithCookies() {
  console.log('🔍 Testing LinkedIn scraping with cookies\n');

  // Get cookies from MongoDB
  const mongoose = await import('mongoose');
  await mongoose.default.connect(MONGO_URL);
  
  const Tenant = mongoose.default.model('Tenant', new mongoose.default.Schema({}, { strict: false }));
  const tenant = await Tenant.findOne({}) as any;
  
  if (!tenant || !tenant.linkedinCookie) {
    console.log('❌ No tenant found or no LinkedIn cookies configured');
    process.exit(1);
  }

  console.log(`✅ Found tenant with LinkedIn cookies (${tenant.linkedinCookie.length} chars)`);
  console.log('');

  const cookies = parseLinkedInCookies(tenant.linkedinCookie);
  console.log(`📋 Parsed ${cookies.length} cookies:`);
  cookies.forEach(c => console.log(`   - ${c.name}`));
  console.log('');

  // Launch browser
  console.log('🚀 Launching browser with stealth settings...');
  const browser = await chromium.launch({
    headless: false, // Show browser to see what's happening
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  // Add cookies
  await context.addCookies(cookies);
  console.log('✅ Cookies added to browser context\n');

  const page = await context.newPage();

  // Test URL
  const testUrl = 'https://www.linkedin.com/feed/';
  console.log(`📄 Navigating to: ${testUrl}`);
  console.log('   (Browser window will open - check if you see the feed or login page)\n');

  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);

  const finalUrl = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

  console.log('📊 Results:');
  console.log(`   Final URL: ${finalUrl}`);
  console.log(`   Page Title: ${title}`);
  console.log(`   Body Text Length: ${bodyText.length} characters`);
  console.log(`   Body Preview: ${bodyText.substring(0, 200)}...`);
  console.log('');

  // Check if redirected to login
  if (finalUrl.includes('/login') || finalUrl.includes('/uas/login')) {
    console.log('❌ REDIRECTED TO LOGIN - Cookies are not working or expired');
  } else if (bodyText.length > 500) {
    console.log('✅ SUCCESS - Page loaded with content!');
  } else {
    console.log('⚠️  WARNING - Page loaded but has minimal content');
  }

  console.log('\n⏸️  Browser will stay open for 30 seconds for inspection...');
  await page.waitForTimeout(30000);

  await browser.close();
  process.exit(0);
}

testLinkedInWithCookies().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
