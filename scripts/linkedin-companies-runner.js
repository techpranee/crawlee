/**
 * LinkedIn Companies Scraper
 * 
 * Scrapes company information from LinkedIn company search results.
 * Extracts: name, industry, size, location, website, follower count, etc.
 * 
 * Usage:
 *   node scripts/linkedin-companies-runner.js --campaignId=<id>
 * 
 * Features:
 * - Human-like scrolling and delays
 * - Pagination handling
 * - Rate limit detection
 * - Saves to MongoDB (LinkedInCompany collection)
 */

require('dotenv').config();

const { chromium } = require('playwright');
const mongoose = require('mongoose');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const campaignIdArg = args.find(arg => arg.startsWith('--campaignId='));
const CAMPAIGN_ID = campaignIdArg ? campaignIdArg.split('=')[1] : null;

if (!CAMPAIGN_ID) {
    console.error('❌ Error: --campaignId=<id> is required');
    console.error('Usage: node scripts/linkedin-companies-runner.js --campaignId=<id>');
    process.exit(1);
}

// Configuration
const CONFIG = {
    MONGO_URL: process.env.MONGO_URL || 'mongodb://localhost:27017/crawlee',
    CHROME_USER_DATA: process.env.CHROME_USER_DATA || path.join(__dirname, '..', '.playwright-chrome-profile'),
    TENANT_ID: process.env.TENANT_ID || 'local-test-tenant',
    SCROLL_DELAY: 2000, // ms between scrolls
    PAGE_LOAD_DELAY: 3000, // ms to wait for page load
    MAX_RETRIES: 3,
};

// MongoDB Models
let CampaignModel, LinkedInCompanyModel, TaskModel;

/**
 * Initialize MongoDB connection and models
 */
async function initDatabase() {
    await mongoose.connect(CONFIG.MONGO_URL);
    console.log('✓ Connected to MongoDB');

    // Campaign Schema
    const campaignSchema = new mongoose.Schema({
        tenantId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        description: String,
        source: String,
        seedUrls: [String],
        query: mongoose.Schema.Types.Mixed,
        status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'running' },
        progress: { type: Number, default: 0 },
        maxItems: Number,
        stats: {
            totalLeads: { type: Number, default: 0 },
            totalRequests: { type: Number, default: 0 },
            errors: [String],
        },
    }, { timestamps: true });

    // Task Schema
    const taskSchema = new mongoose.Schema({
        tenantId: { type: String, required: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, required: true },
        type: String,
        status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
        progress: { type: Number, default: 0 },
        error: String,
    }, { timestamps: true });

    // LinkedIn Company Schema
    const linkedInCompanySchema = new mongoose.Schema({
        tenantId: { type: String, required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        linkedInId: { type: String, unique: true, sparse: true },
        linkedInUrl: { type: String, required: true },
        name: { type: String, required: true },
        tagline: String,
        description: String,
        website: String,
        industry: String,
        companySize: String,
        headquarters: String,
        founded: String,
        specialties: [String],
        locations: [{
            type: String,
            city: String,
            state: String,
            country: String,
            address: String
        }],
        followerCount: Number,
        employeeCount: Number,
        companyType: String,
        logo: String,
        cover: String,
        collectedAt: { type: Date, default: Date.now },
        lastUpdated: { type: Date, default: Date.now },
        rawMetadata: {
            html: String,
            searchResult: mongoose.Schema.Types.Mixed,
            extractedAt: Date,
        },
    }, { timestamps: true });

    CampaignModel = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
    TaskModel = mongoose.models.Task || mongoose.model('Task', taskSchema);
    LinkedInCompanyModel = mongoose.models.LinkedInCompany || mongoose.model('LinkedInCompany', linkedInCompanySchema);
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random jitter for human-like behavior
 */
function jitter(base, spread = 400) {
    return base + Math.floor(Math.random() * spread);
}

/**
 * Safe text extraction helper
 */
async function getTextSafe(locator) {
    try {
        const count = await locator.count();
        if (!count) return '';
        const txt = (await locator.first().innerText()).trim();
        return txt.replace(/\s+/g, ' ');
    } catch {
        return '';
    }
}

/**
 * Safe attribute extraction helper
 */
async function getAttrSafe(locator, attr) {
    try {
        const count = await locator.count();
        if (!count) return '';
        const val = await locator.first().getAttribute(attr);
        return (val || '').trim();
    } catch {
        return '';
    }
}

/**
 * Extract company data from a search result card
 * Updated to match actual LinkedIn HTML structure with obfuscated classes
 */
async function extractCompanyFromCard(card) {
    try {
        const data = {
            name: '',
            tagline: '',
            linkedInUrl: '',
            industry: '',
            location: '',
            followerCount: null,
            logo: '',
        };

        // Company link - look for any link with /company/ in href
        const companyLink = card.locator('a[href*="/company/"]').first();
        const linkCount = await companyLink.count();

        if (linkCount > 0) {
            const href = await getAttrSafe(companyLink, 'href');
            if (href) {
                data.linkedInUrl = href.split('?')[0]; // Remove tracking params
                if (!data.linkedInUrl.startsWith('http')) {
                    data.linkedInUrl = 'https://www.linkedin.com' + data.linkedInUrl;
                }
            }

            // Company name from the link text
            data.name = await getTextSafe(companyLink);
        }

        if (!data.name) {
            // Fallback: try to find company name in any clickable element
            const allLinks = card.locator('a[href*="/company/"]');
            const count = await allLinks.count();
            for (let i = 0; i < count && !data.name; i++) {
                const link = allLinks.nth(i);
                const text = await getTextSafe(link);
                if (text && text.length > 0 && text.length < 100) {
                    data.name = text;
                    if (!data.linkedInUrl) {
                        const href = await getAttrSafe(link, 'href');
                        if (href) {
                            data.linkedInUrl = href.split('?')[0];
                            if (!data.linkedInUrl.startsWith('http')) {
                                data.linkedInUrl = 'https://www.linkedin.com' + data.linkedInUrl;
                            }
                        }
                    }
                }
            }
        }

        if (!data.name || !data.linkedInUrl) {
            console.warn('   ⚠️  Could not extract company name or URL from card');
            return null;
        }

        // Get all text from card for parsing
        const allText = await getTextSafe(card);

        // Industry and location - usually in format: "Industry • Location"
        // Look for text containing bullet point separator
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const line of lines) {
            if (line.includes('•') && !line.includes('follower')) {
                const parts = line.split('•').map(s => s.trim());
                if (parts.length >= 1 && parts[0]) data.industry = parts[0];
                if (parts.length >= 2 && parts[1]) data.location = parts[1];
                break;
            }
        }

        // Follower count - look for "X follower" or "X followers"
        const followerMatch = allText.match(/([\d,]+)\s+followers?/i);
        if (followerMatch) {
            data.followerCount = parseInt(followerMatch[1].replace(/,/g, ''), 10);
        }

        // Logo - look for any image
        const images = card.locator('img');
        const imgCount = await images.count();
        if (imgCount > 0) {
            data.logo = await getAttrSafe(images.first(), 'src');
        }

        return data;
    } catch (error) {
        console.error('   ❌ Error extracting company from card:', error.message);
        return null;
    }
}

/**
 * Visit company About page and extract detailed information
 */
async function extractCompanyDetails(page, companyUrl) {
    try {
        console.log(`   🔍 Visiting company page: ${companyUrl}`);

        // Navigate to company about page
        const aboutUrl = companyUrl.replace(/\/$/, '') + '/about/';
        await page.goto(aboutUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        // Wait for about section to load
        await page.waitForSelector('.org-about-module, .org-page-details-module__card-spacing, h2:has-text("Overview")', { timeout: 10000 }).catch(() => { });
        await sleep(jitter(2000, 1000));

        // Wait for content to load
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

        const details = {
            website: null,
            industry: null,
            companySize: null,
            headquarters: null,
            founded: null,
            specialties: [],
            description: null,
            tagline: null
        };

        // Helper to extract text from elements
        const getTextContent = async (selector) => {
            try {
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: 1000 })) {
                    return await element.textContent();
                }
            } catch (e) {
                // Element not found
            }
            return null;
        };

        // Extract website - look for link with external icon or website pattern
        try {
            // Look for Website heading and get link from next dd element
            const websiteHeading = page.locator('h3.text-heading-medium:has-text("Website")');
            if (await websiteHeading.isVisible({ timeout: 2000 })) {
                const dt = websiteHeading.locator('..');
                const dd = dt.locator('+ dd').first();
                const link = dd.locator('a').first();
                if (await link.isVisible({ timeout: 1000 })) {
                    const href = await link.getAttribute('href');
                    if (href) {
                        details.website = href;
                        console.log(`      ✓ Website: ${href}`);
                    }
                }
            }
        } catch (e) {
            console.warn('      Website extraction error:', e.message);
        }

        // Get all definition lists (LinkedIn uses dl/dt/dd for company info)
        try {
            // Look for h3 headings with specific text and get their dd siblings
            const headings = ['Industry', 'Company size', 'Headquarters', 'Founded'];

            for (const heading of headings) {
                try {
                    const h3 = page.locator(`h3.text-heading-medium:has-text("${heading}")`).first();
                    if (await h3.isVisible({ timeout: 2000 })) {
                        const dt = h3.locator('..');
                        const dd = dt.locator('+ dd').first();
                        if (await dd.isVisible({ timeout: 1000 })) {
                            const value = await dd.textContent();
                            const valueTrim = value.trim().split('\n')[0].trim(); // Get first line only

                            if (heading === 'Industry') {
                                details.industry = valueTrim;
                                console.log(`      ✓ Industry: ${valueTrim}`);
                            } else if (heading === 'Company size') {
                                details.companySize = valueTrim;
                                console.log(`      ✓ Company size: ${valueTrim}`);
                            } else if (heading === 'Headquarters') {
                                details.headquarters = valueTrim;
                                console.log(`      ✓ Headquarters: ${valueTrim}`);
                            } else if (heading === 'Founded') {
                                details.founded = valueTrim;
                                console.log(`      ✓ Founded: ${valueTrim}`);
                            }
                        }
                    }
                } catch (err) {
                    // Skip if heading not found
                }
            }
        } catch (e) {
            console.warn('      Definition list extraction error:', e.message);
        }

        // Try alternative selectors if dl/dt/dd didn't work
        if (!details.industry || !details.companySize) {
            try {
                // Look for text patterns in the page
                const pageText = await page.textContent('body');

                // Industry pattern: "Industry\nSomething"
                if (!details.industry) {
                    const industryMatch = pageText.match(/Industry\s*\n\s*([^\n]+)/i);
                    if (industryMatch) details.industry = industryMatch[1].trim();
                }

                // Company size pattern: "Company size\n1,001-5,000 employees"
                if (!details.companySize) {
                    const sizeMatch = pageText.match(/Company size\s*\n\s*([^\n]+)/i);
                    if (sizeMatch) details.companySize = sizeMatch[1].trim();
                }

                // Headquarters pattern: "Headquarters\nCity, State"
                if (!details.headquarters) {
                    const hqMatch = pageText.match(/Headquarters\s*\n\s*([^\n]+)/i);
                    if (hqMatch) details.headquarters = hqMatch[1].trim();
                }

                // Founded pattern: "Founded\n2020"
                if (!details.founded) {
                    const foundedMatch = pageText.match(/Founded\s*\n\s*(\d{4})/i);
                    if (foundedMatch) details.founded = foundedMatch[1].trim();
                }
            } catch (e) {
                console.warn('      Text pattern extraction error:', e.message);
            }
        }

        // Get description/tagline
        try {
            // Tagline is usually near the top
            const tagline = await getTextContent('p.break-words');
            if (tagline && tagline.length > 10 && tagline.length < 500) {
                details.tagline = tagline.trim();
            }

            // Description might be in a section with "About us" or similar
            const sections = page.locator('section');
            const sectionCount = await sections.count();
            for (let i = 0; i < sectionCount && !details.description; i++) {
                const text = await sections.nth(i).textContent();
                if (text && text.length > 100 && text.length < 2000) {
                    // Check if it looks like a description
                    if (text.toLowerCase().includes('about') ||
                        text.toLowerCase().includes('overview') ||
                        (i === 0 && text.length > 200)) {
                        details.description = text.trim();
                    }
                }
            }
        } catch (e) {
            console.warn('      Description extraction error:', e.message);
        }

        console.log(`   ✓ Extracted details: website=${!!details.website}, industry=${!!details.industry}, size=${!!details.companySize}`);

        return details;
    } catch (error) {
        console.error(`   ❌ Error visiting company page:`, error.message);
        return null;
    }
}

/**
 * Scroll to load more results (using mouse wheel for more realistic behavior)
 */
async function scrollToLoadMore(page) {
    try {
        // Scroll with mouse wheel - more human-like
        await page.mouse.wheel(0, 600 + Math.floor(Math.random() * 800));
        await sleep(jitter(700, 600));

        // Wait for network idle with short timeout
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {
            // Ignore timeout - page might still be loading ads/tracking
        });
    } catch (error) {
        console.warn('      Scroll error:', error.message);
    }
}

/**
 * Debug: Take screenshot and log page info
 */
async function debugPage(page, filename = 'debug') {
    try {
        await page.screenshot({ path: `./storage/${filename}.png`, fullPage: false });
        const html = await page.content();
        require('fs').writeFileSync(`./storage/${filename}.html`, html);
        console.log(`   📸 Debug: Saved screenshot and HTML to ./storage/${filename}.*`);
    } catch (e) {
        console.warn(`   ⚠️  Could not save debug files: ${e.message}`);
    }
}

/**
 * Navigate to next page using URL pagination
 */
async function goToNextPage(page, baseSearchUrl, pageNumber) {
    try {
        // LinkedIn uses &page=X for pagination
        // Build URL with page parameter
        const separator = baseSearchUrl.includes('?') ? '&' : '?';
        let nextPageUrl;

        // Check if URL already has page parameter
        if (baseSearchUrl.includes('&page=') || baseSearchUrl.includes('?page=')) {
            // Replace existing page parameter
            nextPageUrl = baseSearchUrl.replace(/([?&])page=\d+/, `$1page=${pageNumber}`);
        } else {
            // Add page parameter
            nextPageUrl = `${baseSearchUrl}${separator}page=${pageNumber}`;
        }

        console.log(`→ Navigating to page ${pageNumber}...`);
        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait for company cards to load
        await page.waitForSelector('[data-chameleon-result-urn*="company"], .search-results-container', { timeout: 30000 });
        await sleep(jitter(3000, 1000));

        // Check if we got any results (if no results, we've reached the end)
        const companyCards = await page.locator('[data-chameleon-result-urn*="company"]').count();
        if (companyCards === 0) {
            console.log('✓ No more results found - reached end of pages');
            return false;
        }

        return true;
    } catch (error) {
        console.warn('Could not navigate to next page:', error.message);
        return false;
    }
}

/**
 * Main scraping function
 */
async function scrapeCompanies(campaign, task) {
    const searchUrl = campaign.query?.searchUrl || campaign.seedUrls?.[0];

    if (!searchUrl) {
        throw new Error('No search URL found in campaign');
    }

    console.log('\n🚀 Starting LinkedIn Companies Scraper');
    console.log(`📍 Search URL: ${searchUrl}`);
    console.log(`🎯 Target: ${campaign.maxItems || 'unlimited'} companies\n`);

    // Update campaign status
    await CampaignModel.findByIdAndUpdate(campaign._id, {
        status: 'running',
        'stats.totalRequests': 0,
    });

    await TaskModel.findByIdAndUpdate(task._id, {
        status: 'running',
        progress: 0,
    });

    // Launch browser (similar to reference code)
    const browser = await chromium.launchPersistentContext(CONFIG.CHROME_USER_DATA, {
        headless: false,
        viewport: { width: 1320, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    });

    const page = await browser.newPage();

    try {
        // Navigate to search URL
        console.log('🌐 Loading search results...');
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait for search results to appear (more reliable than networkidle)
        console.log('⏳ Waiting for search results to load...');
        await page.waitForSelector('[data-chameleon-result-urn*="company"], .search-results-container', { timeout: 30000 });
        await sleep(jitter(3000, 1000));

        // Check if logged in
        const loginForm = await page.locator('form.login__form, .authwall').count();
        if (loginForm > 0) {
            console.error('\n❌ LinkedIn login required!');
            console.error('Please log in manually in the browser window...');
            console.error('Waiting for 2 minutes for manual login...\n');
            await sleep(120000); // Wait 2 minutes for manual login

            // Reload the page after login
            console.log('🔄 Reloading page after login...');
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(jitter(CONFIG.PAGE_LOAD_DELAY, 2000));
        }

        // Wait for search results container
        console.log('⏳ Waiting for search results to load...');
        await page.waitForSelector('.search-results-container, .search-results, .reusable-search', { timeout: 15000 }).catch(() => {
            console.warn('   ⚠️  Search results container not found - continuing anyway...');
        });

        let companiesCollected = 0;
        let currentPage = 1;
        const maxItems = campaign.maxItems || 5000;
        let currentUrl = page.url(); // Track current search results URL

        // Main scraping loop
        while (companiesCollected < maxItems) {
            console.log(`\n📄 Processing page ${currentPage}...`);

            // Update current URL
            currentUrl = page.url();

            // Scroll to load all results on current page (4 times like reference code)
            console.log(`   🔄 Scrolling to load results...`);
            for (let i = 0; i < 4; i++) {
                await scrollToLoadMore(page);
                if (i % 2 === 1) {
                    console.log(`      Scroll ${i + 1}/4 complete`);
                }
            }
            console.log(`   ✓ Scrolling complete`);

            // Try multiple selectors for company cards (LinkedIn uses obfuscated classes and data attributes)
            console.log(`   🔍 Looking for company cards...`);
            let companyCards = [];
            const selectors = [
                '[data-chameleon-result-urn*="company"]',  // Most reliable - data attribute
                'div[data-chameleon-result-urn]',
                'li[class*="reatxbeTVkfTBoEZKnIsjAssOjqiKCMmBo"]',  // Obfuscated list item class
                'li.reusable-search__result-container',
                '.entity-result',
            ];

            for (const selector of selectors) {
                companyCards = await page.locator(selector).all();
                if (companyCards.length > 0) {
                    console.log(`   ✓ Found ${companyCards.length} company cards using selector: ${selector}`);
                    break;
                }
            }

            if (companyCards.length === 0) {
                console.log('⚠️  No company cards found with any selector - debugging...');
                await debugPage(page, `page-${currentPage}-no-results`);

                // Try to get any list items
                const anyLi = await page.locator('li').all();
                console.log(`   Found ${anyLi.length} total <li> elements on page`);

                // Check for common error messages
                const errorMsg = await page.locator('.search-error__image, .error-message').count();
                if (errorMsg > 0) {
                    console.log('   ❌ Error message detected on page');
                }

                break;
            }

            // Extract data from each card
            let pageSuccessCount = 0;
            for (const card of companyCards) {
                if (companiesCollected >= maxItems) {
                    console.log(`✓ Reached target of ${maxItems} companies`);
                    break;
                }

                const companyData = await extractCompanyFromCard(card);

                if (companyData && companyData.name && companyData.linkedInUrl) {
                    try {
                        // Visit company page to get detailed information
                        console.log(`   📋 Extracting details for: ${companyData.name}`);
                        const detailedData = await extractCompanyDetails(page, companyData.linkedInUrl);

                        // Merge search result data with detailed data
                        // Prefer detailed data when available
                        const finalData = {
                            ...companyData,
                            website: detailedData?.website || companyData.website,
                            industry: detailedData?.industry || companyData.industry,
                            companySize: detailedData?.companySize || companyData.companySize,
                            headquarters: detailedData?.headquarters || companyData.location,
                            founded: detailedData?.founded || companyData.founded,
                            tagline: detailedData?.tagline || companyData.tagline,
                            description: detailedData?.description || companyData.description,
                            specialties: detailedData?.specialties || [],
                        };

                        // Save to database
                        await LinkedInCompanyModel.findOneAndUpdate(
                            {
                                tenantId: campaign.tenantId,
                                linkedInUrl: finalData.linkedInUrl,
                            },
                            {
                                $set: {
                                    campaignId: campaign._id,
                                    tenantId: campaign.tenantId,
                                    name: finalData.name,
                                    tagline: finalData.tagline,
                                    description: finalData.description,
                                    website: finalData.website,
                                    linkedInUrl: finalData.linkedInUrl,
                                    industry: finalData.industry,
                                    companySize: finalData.companySize,
                                    headquarters: finalData.headquarters,
                                    founded: finalData.founded,
                                    specialties: finalData.specialties,
                                    followerCount: finalData.followerCount,
                                    logo: finalData.logo,
                                    collectedAt: new Date(),
                                    lastUpdated: new Date(),
                                    rawMetadata: {
                                        searchResult: companyData,
                                        detailedData: detailedData,
                                        extractedAt: new Date(),
                                    },
                                },
                            },
                            {
                                upsert: true,
                                new: true,
                            }
                        );

                        companiesCollected++;
                        pageSuccessCount++;

                        console.log(`   ✅ Saved: ${finalData.name} | ${finalData.industry || 'N/A'} | ${finalData.companySize || 'N/A'} | ${finalData.website || 'N/A'}`);

                        if (companiesCollected % 10 === 0) {
                            console.log(`   📊 Progress: ${companiesCollected} companies collected`);
                        }

                        // Navigate back to search results
                        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
                        await sleep(jitter(2000, 1000));

                    } catch (error) {
                        console.error(`   ❌ Error processing company: ${error.message}`);
                        // Try to navigate back to search results
                        try {
                            await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                            await sleep(jitter(2000, 1000));
                        } catch (navError) {
                            console.error(`   ❌ Failed to return to search results: ${navError.message}`);
                        }
                    }
                } else {
                    console.warn('   ⚠️  Skipped card - missing name or URL');
                }
            }

            console.log(`   ✓ Successfully extracted ${pageSuccessCount} companies from page ${currentPage}`);

            // Update campaign stats
            await CampaignModel.findByIdAndUpdate(campaign._id, {
                'stats.totalLeads': companiesCollected,
                'stats.totalRequests': currentPage,
                progress: Math.round((companiesCollected / maxItems) * 100),
            });

            await TaskModel.findByIdAndUpdate(task._id, {
                progress: Math.round((companiesCollected / maxItems) * 100),
            });

            // Check if we should continue
            if (companiesCollected >= maxItems) {
                console.log(`\n✅ Reached target of ${maxItems} companies!`);
                break;
            }

            // Try to go to next page (using URL-based pagination)
            currentPage++;
            const hasNextPage = await goToNextPage(page, searchUrl, currentPage);
            if (!hasNextPage) {
                console.log('\n✓ No more pages available');
                break;
            }
        }

        // Mark as completed
        await CampaignModel.findByIdAndUpdate(campaign._id, {
            status: 'completed',
            'stats.totalLeads': companiesCollected,
        });

        await TaskModel.findByIdAndUpdate(task._id, {
            status: 'completed',
            progress: 100,
        });

        console.log(`\n✅ Scraping completed!`);
        console.log(`   📊 Total companies collected: ${companiesCollected}`);
        console.log(`   📄 Pages processed: ${currentPage}`);

    } catch (error) {
        console.error('\n❌ Scraping failed:', error);

        await CampaignModel.findByIdAndUpdate(campaign._id, {
            status: 'failed',
            $push: {
                'stats.errors': error.message,
            },
        });

        await TaskModel.findByIdAndUpdate(task._id, {
            status: 'failed',
            error: error.message,
        });

        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Main execution
 */
async function main() {
    try {
        // Connect to database
        await initDatabase();

        // Get campaign
        const campaign = await CampaignModel.findById(CAMPAIGN_ID);
        if (!campaign) {
            throw new Error(`Campaign ${CAMPAIGN_ID} not found`);
        }

        console.log('\n📋 Campaign Details:');
        console.log(`   Name: ${campaign.name}`);
        console.log(`   Description: ${campaign.description}`);
        console.log(`   Source: ${campaign.source}`);
        console.log(`   Status: ${campaign.status}`);

        // Get task
        const task = await TaskModel.findOne({ campaignId: campaign._id });
        if (!task) {
            throw new Error(`Task for campaign ${CAMPAIGN_ID} not found`);
        }

        // Start scraping
        await scrapeCompanies(campaign, task);

        console.log('\n🎉 All done!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    }
}

// Run
main();
