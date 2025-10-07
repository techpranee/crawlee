/**
 * Debug script to test LinkedIn company search selectors
 * Usage: node scripts/debug-linkedin-selectors.js
 */

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');

const SEARCH_URL = 'https://www.linkedin.com/search/results/companies/?companyHqGeo=%5B%22102713980%22%5D&companySize=%5B%22D%22%5D&keywords=Manufacture&origin=FACETED_SEARCH';
const CHROME_USER_DATA = process.env.CHROME_USER_DATA || path.join(__dirname, '..', '.playwright-chrome-profile');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('🚀 Starting LinkedIn Selector Debug\n');

    const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
        headless: false,
        viewport: { width: 1320, height: 900 },
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    });

    const page = await browser.newPage();

    try {
        console.log('📍 Navigating to:', SEARCH_URL);
        await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 45000 });
        await sleep(3000);

        console.log('\n🔍 Testing selectors...\n');

        // Test various selectors
        const selectors = [
            'li.reusable-search__result-container',
            '.entity-result',
            '[data-chameleon-result-urn]',
            'li[class*="reusable-search"]',
            '.search-results-container li',
            'li',
            '.search-results-container',
            '.reusable-search',
        ];

        for (const selector of selectors) {
            const count = await page.locator(selector).count();
            console.log(`${selector.padEnd(45)} → ${count} elements`);
        }

        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: './storage/debug-linkedin.png', fullPage: false });

        console.log('💾 Saving HTML...');
        const html = await page.content();
        require('fs').writeFileSync('./storage/debug-linkedin.html', html);

        console.log('\n✅ Debug files saved to ./storage/');
        console.log('   - debug-linkedin.png');
        console.log('   - debug-linkedin.html');

        // Try to extract from first card if any
        const firstCard = await page.locator('li.reusable-search__result-container').first();
        const hasCard = await firstCard.count() > 0;

        if (hasCard) {
            console.log('\n🎯 Found card! Testing extraction...\n');

            // Test link extraction
            const link = await firstCard.locator('a[href*="/company/"]').first();
            const linkCount = await link.count();
            console.log(`   Company link count: ${linkCount}`);

            if (linkCount > 0) {
                const href = await link.getAttribute('href');
                const text = await link.innerText().catch(() => '');
                console.log(`   Company URL: ${href}`);
                console.log(`   Company name: ${text}`);
            }

            // Test other elements
            const allText = await firstCard.innerText().catch(() => '');
            console.log(`\n   Full card text (first 200 chars):`);
            console.log(`   ${allText.substring(0, 200)}...`);
        } else {
            console.log('\n⚠️  No company cards found!');
            console.log('   This might mean:');
            console.log('   1. Need to log in to LinkedIn');
            console.log('   2. Page structure is different');
            console.log('   3. Results not loaded yet');
        }

        console.log('\n✅ Debug complete! Press Ctrl+C to close browser.');
        await sleep(300000); // Keep open for 5 minutes

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await browser.close();
    }
}

main();
