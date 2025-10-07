/**
 * LinkedIn Hiring Posts Local Runner
 * 
 * This script scrapes LinkedIn for posts about hiring/recruiting.
 * It supports two modes:
 * 1. Search Mode: Search by keywords, time period, and location
 * 2. Seed URL Mode: Scrape from specific profile feeds or activity posts
 * 
 * Features:
 * - Human-like behavior (slow scrolling, random delays)
 * - AI-powered lead extraction using Ollama
 * - Rate limit detection
 * - Saves results to MongoDB
 * 
 * Usage:
 *   node scripts/linkedin-hiring-runner.js --campaignId=<id>
 *   node scripts/linkedin-hiring-runner.js  (creates new campaign with defaults)
 */

// Load environment variables from .env file
require('dotenv').config();

const { chromium } = require('playwright');
const mongoose = require('mongoose');
const path = require('path');
const { getOllamaService } = require('../src/services/ollama');

// Parse command line arguments
const args = process.argv.slice(2);
const campaignIdArg = args.find(arg => arg.startsWith('--campaignId='));
const CAMPAIGN_ID = campaignIdArg ? campaignIdArg.split('=')[1] : null;

// Configuration
const CONFIG = {
    MONGO_URL: process.env.MONGO_URL || 'mongodb://localhost:27017/crawlee',
    OLLAMA_URL: process.env.OLLAMA_URL || 'https://ollama2.havenify.ai',
    CHROME_USER_DATA: process.env.CHROME_USER_DATA || path.join(__dirname, '..', '.playwright-chrome-profile'),
    TENANT_ID: process.env.TENANT_ID || 'local-test-tenant',
    MAX_POSTS: parseInt(process.env.MAX_POSTS || '200', 10),
    SEARCH_QUERY: process.env.SEARCH_QUERY || 'hiring',
    TIME_FILTER: 'past-week', // LinkedIn's filter for past week
    LOCATION: process.env.LOCATION || '', // e.g., "United States", "San Francisco Bay Area", "Remote"
};

// Initialize Ollama service
const ollama = getOllamaService();// MongoDB Models
let CampaignModel, LinkedInLeadModel;

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
        status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'running' },
        progress: { type: Number, default: 0 },
        stats: {
            postsProcessed: { type: Number, default: 0 },
            leadsExtracted: { type: Number, default: 0 },
            errors: { type: Number, default: 0 },
        },
    }, { timestamps: true });

    // LinkedIn Lead Schema
    const linkedInLeadSchema = new mongoose.Schema({
        tenantId: { type: String, required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        linkedInId: { type: String, required: true, unique: true },
        authorName: String,
        authorHeadline: String,
        authorProfile: String,
        company: String,
        jobTitles: [String],
        locations: [String],
        seniority: String,
        skills: [String],
        salaryRange: String,
        workMode: String,
        postText: String,
        postUrl: String,
        postTitle: String,
        companyUrl: String,
        applicationLink: String,
        postedAt: Date,
        companyIndustry: String,
        extractedAt: { type: Date, default: Date.now },

        // Raw metadata for retry/reprocessing
        rawMetadata: {
            postText: String,
            authorName: String,
            authorHeadline: String,
            postUrl: String,
            postTitle: String,
            companyUrl: String,
            postedAt: String,
            extractedAt: Date,
        },

        // AI enrichment status
        enrichmentStatus: {
            type: String,
            enum: ['pending', 'enriched', 'failed', 'skipped'],
            default: 'pending'
        },
        enrichmentError: String,
        lastEnrichmentAttempt: Date,
    }, { timestamps: true });

    linkedInLeadSchema.index({ tenantId: 1, campaignId: 1 });
    linkedInLeadSchema.index({ tenantId: 1, linkedInId: 1 }, { unique: true });

    CampaignModel = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
    LinkedInLeadModel = mongoose.models.LinkedInLead || mongoose.model('LinkedInLead', linkedInLeadSchema);
}

/**
 * Extract lead information from a LinkedIn post using AI
 */
async function extractLeadFromPost(postText, authorName, authorHeadline, postUrl) {
    const prompt = `Analyze this LinkedIn hiring post and extract structured job information.

Post Author: ${authorName}
Author Headline: ${authorHeadline}
Post URL: ${postUrl}

Post Text:
${postText}

Extract the following information (return as JSON):
{
  "company": "company name",
  "jobTitles": ["job title 1", "job title 2"],
  "locations": ["location 1", "location 2"],
  "seniority": "Junior/Mid/Senior/Lead/Manager/Director",
  "skills": ["skill1", "skill2"],
  "salaryRange": "salary range if mentioned",
  "workMode": "Remote/Hybrid/Onsite",
  "applicationLink": "application URL if present"
}

If any field is not mentioned, use null. Be precise and extract only what's explicitly stated.`;

    try {
        const result = await ollama.extractJSON(
            prompt,
            'You are a professional recruiter assistant. Extract job information accurately from LinkedIn posts. Return only valid JSON.'
        );

        if (!result) {
            // If Ollama is unavailable, create a basic extraction from the post text
            console.warn('   ⚠️ Using fallback extraction (AI unavailable)');
            return {
                company: null,
                jobTitles: [],
                locations: [],
                seniority: null,
                skills: [],
                salaryRange: null,
                workMode: null,
                applicationLink: null
            };
        }

        return result;
    } catch (error) {
        console.error('Error extracting lead:', error.message);
        return null;
    }
}/**
 * Check if we hit LinkedIn rate limit
 */
async function checkForRateLimit(page) {
    try {
        const url = page.url();

        // Check URL patterns
        if (url.includes('/authwall') || url.includes('/checkpoint') || url.includes('/uas/')) {
            return true;
        }

        // Get page content
        const content = await page.content();

        // Check page content for rate limit indicators
        const rateLimitPhrases = [
            'try again later',
            'unusual activity',
            'too many requests',
            'verify your identity',
            'security verification',
        ];

        return rateLimitPhrases.some(phrase =>
            content.toLowerCase().includes(phrase)
        );
    } catch (error) {
        // If page is closed or error, assume no rate limit
        return false;
    }
}

/**
 * Random delay with human-like variance
 */
async function humanDelay(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Scroll page slowly like a human
 */
async function humanScroll(page) {
    const scrolls = Math.floor(Math.random() * 3) + 2; // 2-4 scrolls

    for (let i = 0; i < scrolls; i++) {
        await page.evaluate(() => {
            window.scrollBy({
                top: Math.floor(Math.random() * 400) + 200,
                behavior: 'smooth'
            });
        });
        await humanDelay(800, 1500);
    }
}

/**
 * Extract post data from a post element
 */
async function extractPostData(postElement) {
    return await postElement.evaluate(el => {
        // Debug: log element structure for first post
        const debugInfo = {
            tagName: el.tagName,
            className: el.className,
            dataAttributes: {},
            links: []
        };

        // Get all data attributes
        for (let attr of el.attributes) {
            if (attr.name.startsWith('data-')) {
                debugInfo.dataAttributes[attr.name] = attr.value;
            }
        }

        // Get all links
        const allLinks = el.querySelectorAll('a');
        allLinks.forEach((link, idx) => {
            if (idx < 5) { // Only first 5 links
                debugInfo.links.push({
                    href: link.href,
                    text: link.innerText?.substring(0, 50),
                    classes: link.className
                });
            }
        });

        // Get author info - try multiple selectors for search results vs feed
        const authorLink = el.querySelector('a.update-components-actor__meta-link, a[data-control-name="actor"], a.app-aware-link[href*="/in/"], a[href*="/in/"]');
        const authorName = el.querySelector('.update-components-actor__name, .feed-shared-actor__name, .update-components-actor__title, span.update-components-actor__name')?.innerText?.trim() ||
            el.querySelector('span[dir="ltr"]')?.innerText?.trim();
        const authorHeadline = el.querySelector('.update-components-actor__description, .feed-shared-actor__description, .update-components-actor__subtitle')?.innerText?.trim();
        const authorProfile = authorLink?.href;

        // Get post text - try multiple selectors
        const postTextEl = el.querySelector('.feed-shared-update-v2__description, .update-components-text, .feed-shared-inline-show-more-text, .update-components-text__text-view');
        const postText = postTextEl?.innerText?.trim();

        // Extract post ID and construct proper post URL
        let postUrl = null;
        let postId = null;

        // Method 1: Check the element itself for data-urn (search results pages)
        const selfUrn = el.getAttribute('data-urn');
        if (selfUrn && selfUrn.includes('activity')) {
            postId = selfUrn.match(/urn:li:activity:(\d+)/)?.[1];
        }

        // Method 2: Get from data-urn attribute on child (most reliable for feed)
        if (!postId) {
            const urnElement = el.querySelector('[data-urn*="activity"]');
            const urn = urnElement?.getAttribute('data-urn');
            if (urn) {
                postId = urn.match(/urn:li:activity:(\d+)/)?.[1];
            }
        }

        // Method 3: Get from timestamp link
        if (!postId) {
            const timestampLink = el.querySelector('a.update-components-actor__sub-description-link, a[data-control-name="timestamp"], a.app-aware-link[href*="activity"]');
            const timestampUrl = timestampLink?.href;
            if (timestampUrl) {
                postId = timestampUrl.match(/urn:li:activity:(\d+)/)?.[1] ||
                    timestampUrl.match(/posts\/(\d+)/)?.[1] ||
                    timestampUrl.match(/feed\/update\/urn:li:activity:(\d+)/)?.[1];
            }
        }

        // Method 4: Get from post link element
        if (!postId) {
            const postLink = el.querySelector('a[data-control-name="view_post"], a[href*="feed/update"]');
            const postLinkUrl = postLink?.href;
            if (postLinkUrl) {
                postId = postLinkUrl.match(/urn:li:activity:(\d+)/)?.[1] ||
                    postLinkUrl.match(/posts\/(\d+)/)?.[1] ||
                    postLinkUrl.match(/feed\/update\/urn:li:activity:(\d+)/)?.[1];
            }
        }

        // Method 5: Try to get from any link with activity in it
        if (!postId) {
            const allLinks = Array.from(el.querySelectorAll('a[href*="activity"]'));
            for (const link of allLinks) {
                const href = link.href;
                if (href) {
                    const match = href.match(/activity[:-](\d+)/);
                    if (match) {
                        postId = match[1];
                        break;
                    }
                }
            }
        }

        // Construct proper post URL from postId
        if (postId) {
            postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`;
        }

        // Extract postTitle and companyUrl directly in the DOM
        const dom = (function () {
            const titleEl = (function () { try { return el.querySelector('h3, h2, span[dir="ltr"], .feed-shared-update-v2__title'); } catch (e) { return null; } })();
            let postTitle = titleEl && titleEl.innerText ? titleEl.innerText.trim() : null;
            if (!postTitle && postText) {
                postTitle = postText.split('\n').map(s => s.trim()).find(Boolean) || null;
            }
            let companyUrl = null;
            try {
                const comp = el.querySelector('a[href*="/company/"]');
                if (comp && comp.getAttribute) {
                    const href = comp.getAttribute('href');
                    if (href) companyUrl = href.startsWith('/') ? 'https://www.linkedin.com' + href : href;
                }
            } catch (e) {
                companyUrl = null;
            }
            return { postTitle, companyUrl };
        })();

        const postTitle = dom.postTitle || null;
        const companyUrl = dom.companyUrl || null;

        // Try to extract postedAt (timestamp) from DOM
        const postedAt = (function () {
            try {
                const timeEl = el.querySelector('a[data-control-name="timestamp"] time, a[data-control-name="timestamp"], time');
                if (timeEl) return timeEl.getAttribute('datetime') || timeEl.innerText || null;
                const alt = el.querySelector('span.feed-shared-actor__sub-description, .update-components-actor__sub-description');
                return alt ? alt.innerText : null;
            } catch (e) {
                return null;
            }
        })();

        return {
            authorName,
            authorHeadline,
            authorProfile,
            postText,
            postUrl,
            postTitle,
            companyUrl,
            postId,
            postedAt,
            _debug: debugInfo, // Include debug info
        };
    });
}

/**
 * Save extracted lead to database
 */
async function saveLeadToDatabase(campaign, postData, extractedInfo) {
    try {
        const enrichmentStatus = extractedInfo ? 'enriched' : 'pending';
        const enrichmentError = !extractedInfo ? 'AI service unavailable during initial extraction' : null;

        await LinkedInLeadModel.create({
            tenantId: campaign.tenantId,
            campaignId: campaign._id,
            linkedInId: postData.postId || postData.postUrl,
            authorName: postData.authorName,
            authorHeadline: postData.authorHeadline,
            authorProfile: postData.authorProfile,
            company: extractedInfo?.company || null,
            companyUrl: postData.companyUrl || extractedInfo?.companyUrl || '',
            jobTitles: extractedInfo?.jobTitles || [],
            locations: extractedInfo?.locations || [],
            seniority: extractedInfo?.seniority || null,
            skills: extractedInfo?.skills || [],
            salaryRange: extractedInfo?.salaryRange || null,
            workMode: extractedInfo?.workMode || null,
            postText: postData.postText,
            postTitle: postData.postTitle || extractedInfo?.postTitle || '',
            postUrl: postData.postUrl,
            applicationLink: extractedInfo?.applicationLink || null,
            postedAt: postData.postedAt ? new Date(postData.postedAt) : (extractedInfo?.postedAt ? new Date(extractedInfo.postedAt) : undefined),
            companyIndustry: extractedInfo?.companyIndustry || '',

            // Store raw metadata for retry
            rawMetadata: {
                postText: postData.postText,
                authorName: postData.authorName,
                authorHeadline: postData.authorHeadline,
                postUrl: postData.postUrl,
                postTitle: postData.postTitle,
                companyUrl: postData.companyUrl,
                postedAt: postData.postedAt,
                extractedAt: new Date(),
            },

            // Enrichment tracking
            enrichmentStatus,
            enrichmentError,
            lastEnrichmentAttempt: new Date(),
        });
        return true;
    } catch (dbError) {
        if (dbError.code === 11000) {
            console.log('   ⚠️ Duplicate post, skipping...');
            return false;
        } else {
            console.error('   ❌ Database error:', dbError.message);
            throw dbError;
        }
    }
}

/**
 * Process a single post and extract lead
 */
async function processPost(page, post, campaign, processedUrls, stats, skipFilter = false) {
    try {
        const postData = await extractPostData(post);

        // Debug: log extracted data
        if (!postData.postUrl) {
            console.log('   ⚠️ Skipping post: no postUrl extracted');
            console.log('      PostId:', postData.postId);
            console.log('      Author:', postData.authorName);
            console.log('      Debug info:', JSON.stringify(postData._debug, null, 2));
            return false;
        }

        // Skip if we've already processed this post
        if (processedUrls.has(postData.postUrl)) {
            console.log('   ⏭️  Skipping duplicate:', postData.postUrl);
            return false;
        }

        // Skip if post text doesn't mention hiring (only for seed URL mode, not search mode)
        if (!skipFilter) {
            const hiringKeywords = ['hiring', 'recruiting', 'join', 'looking for', 'opportunity', 'position', 'role', 'opening'];
            const hasHiringContent = hiringKeywords.some(keyword =>
                postData.postText?.toLowerCase().includes(keyword)
            );

            if (!hasHiringContent) {
                console.log('   ⏭️  Skipping non-hiring post');
                return false;
            }
        }

        processedUrls.add(postData.postUrl);
        stats.postsProcessed++;

        console.log(`\n📝 Processing post ${stats.postsProcessed}`);
        console.log(`   Author: ${postData.authorName}`);
        console.log(`   Text preview: ${postData.postText?.substring(0, 100)}...`);

        // Scroll to post (human behavior)
        await post.scrollIntoViewIfNeeded();
        await humanDelay(1000, 2000);

        // Extract lead information using AI
        console.log('   🤖 Extracting lead details with AI...');
        const extractedInfo = await extractLeadFromPost(
            postData.postText,
            postData.authorName,
            postData.authorHeadline,
            postData.postUrl
        );

        if (extractedInfo) {
            // If we have a company URL, try to fetch company industry using a new page in same context
            if (postData.companyUrl) {
                try {
                    const companyPage = await page.context().newPage();
                    await companyPage.goto(postData.companyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const industry = await companyPage.evaluate(() => {
                        const selectors = [
                            'p.org-top-card-summary__industry',
                            'dd.org-top-card__industry',
                            'span.company-industries',
                            'li.org-top-card__secondary-description',
                            'div.org-top-card__description',
                            '[data-test-company-industry]'
                        ];
                        for (const s of selectors) {
                            const el = document.querySelector(s);
                            if (el && el.innerText) return el.innerText.trim();
                        }
                        return '';
                    }).catch(() => '');
                    extractedInfo.companyIndustry = industry || extractedInfo.companyIndustry || '';
                    await companyPage.close();
                } catch (e) {
                    // ignore company industry fetch errors
                    extractedInfo.companyIndustry = extractedInfo.companyIndustry || '';
                }
            }

            // Normalize postedAt from postData if present
            if (postData.postedAt) {
                // Some values may already be ISO or human text; try Date parsing
                const dt = new Date(postData.postedAt);
                if (!isNaN(dt.getTime())) {
                    postData.postedAt = dt.toISOString();
                } else {
                    postData.postedAt = null;
                }
            }
        }

        const saved = await saveLeadToDatabase(campaign, postData, extractedInfo);
        if (saved) {
            stats.leadsExtracted++;
            console.log(`   ✅ Lead saved! (${stats.leadsExtracted} total)`);

            if (extractedInfo && extractedInfo.jobTitles?.length) {
                console.log(`      Jobs: ${extractedInfo.jobTitles.join(', ')}`);
            }
            if (extractedInfo && extractedInfo.locations?.length) {
                console.log(`      Locations: ${extractedInfo.locations.join(', ')}`);
            }
        }

        // Update campaign progress
        await CampaignModel.updateOne(
            { _id: campaign._id },
            {
                'stats.postsProcessed': stats.postsProcessed,
                'stats.leadsExtracted': stats.leadsExtracted,
                'stats.errors': stats.errors,
            }
        );

        // Human-like delay between posts
        await humanDelay(18000, 30000); // 18-30 seconds

        return true;
    } catch (error) {
        console.error('❌ Error processing post:', error.message);
        stats.errors++;
        return false;
    }
}

/**
 * Scrape posts from a single activity URL
 */
async function scrapeSinglePost(page, url, campaign, processedUrls, stats) {
    console.log(`\n🔗 Scraping single post: ${url}`);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await humanDelay(3000, 5000);

        // Check if we're logged in
        if (page.url().includes('/authwall') || page.url().includes('/login')) {
            console.error('❌ Not logged in! Please log in to LinkedIn in Chrome first.');
            return;
        }

        // Find the post element
        const post = await page.$('.feed-shared-update-v2, .update-components-actor');
        if (post) {
            await processPost(page, post, campaign, processedUrls, stats);
        } else {
            console.log('   ⚠️ Post not found or already deleted');
        }
    } catch (error) {
        console.error(`❌ Error scraping single post: ${error.message}`);
        stats.errors++;
    }
}

/**
 * Scrape posts from a profile's recent activity feed
 */
async function scrapeProfileFeed(page, url, campaign, processedUrls, stats, maxPosts) {
    console.log(`\n👤 Scraping profile feed: ${url}`);

    try {
        // Ensure URL is in the recent-activity format
        let feedUrl = url;
        if (!feedUrl.includes('/recent-activity/')) {
            // Convert profile URL to recent activity feed
            feedUrl = feedUrl.replace(/\/$/, '') + '/recent-activity/all/';
        }

        await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await humanDelay(3000, 5000);

        // Check if we're logged in
        if (page.url().includes('/authwall') || page.url().includes('/login')) {
            console.error('❌ Not logged in! Please log in to LinkedIn in Chrome first.');
            return;
        }

        let postsFoundInFeed = 0;
        let consecutiveNoNewPosts = 0;
        let longWaitRetries = 0;
        const MAX_QUICK_RETRIES = 3;
        const MAX_LONG_WAIT_RETRIES = 3;

        while (postsFoundInFeed < maxPosts) {
            // Get all post cards on the page
            const posts = await page.$$('.feed-shared-update-v2, .update-components-actor, .profile-creator-shared-feed-update__container');
            console.log(`   Found ${posts.length} posts on profile feed`);

            let processedInThisScroll = 0;

            for (const post of posts) {
                if (postsFoundInFeed >= maxPosts) break;

                // Use hiring filter for seed URLs (skipFilter = false)
                const processed = await processPost(page, post, campaign, processedUrls, stats, false);
                if (processed) {
                    postsFoundInFeed++;
                    processedInThisScroll++;
                }
            }

            // If no new posts were processed, scroll to load more
            if (processedInThisScroll === 0 && postsFoundInFeed < maxPosts) {
                consecutiveNoNewPosts++;
                console.log(`   📜 Scrolling to load more posts... (no new posts: ${consecutiveNoNewPosts}/${MAX_QUICK_RETRIES})`);
                await humanScroll(page);
                await humanDelay(5000, 8000);

                if (consecutiveNoNewPosts >= MAX_QUICK_RETRIES) {
                    if (longWaitRetries < MAX_LONG_WAIT_RETRIES) {
                        longWaitRetries++;
                        consecutiveNoNewPosts = 0;
                        console.log(`   ⏳ Waiting 60 seconds before retry ${longWaitRetries}/${MAX_LONG_WAIT_RETRIES}...`);
                        await humanDelay(60000, 62000);
                        console.log('   🔄 Retrying scroll after long wait...');
                    } else {
                        console.log('   ⚠️ Reached max retries, ending profile feed scrape');
                        break;
                    }
                }
            } else {
                consecutiveNoNewPosts = 0;
                longWaitRetries = 0;
            }
        }

        console.log(`   ✅ Processed ${postsFoundInFeed} posts from profile feed`);
    } catch (error) {
        console.error(`❌ Error scraping profile feed: ${error.message}`);
        stats.errors++;
    }
}

/**
 * Scrape hiring posts from seed URLs
 */
async function scrapeSeedUrls(page, campaign, seedUrls) {
    console.log(`\n🌱 SEED URL MODE: Processing ${seedUrls.length} URLs`);
    if (campaign.query?.summary) {
        console.log(`📝 Campaign Summary: ${campaign.query.summary}`);
    }

    const processedUrls = new Set();
    const stats = {
        postsProcessed: 0,
        leadsExtracted: 0,
        errors: 0,
    };

    const maxPostsPerUrl = Math.ceil((campaign.query?.limit || CONFIG.MAX_POSTS) / Math.max(1, seedUrls.length));

    for (let i = 0; i < seedUrls.length; i++) {
        const url = seedUrls[i].trim();
        if (!url) continue;

        console.log(`\n[${i + 1}/${seedUrls.length}] Processing URL: ${url}`);

        try {
            // Check for rate limit
            if (await checkForRateLimit(page)) {
                console.warn('⚠️ Rate limit detected! Stopping gracefully...');
                stats.stopReason = 'rate_limit_detected';
                // persist immediate stop reason on campaign
                try {
                    await CampaignModel.updateOne({ _id: campaign._id }, { 'stats.stopReason': stats.stopReason });
                } catch (e) {
                    // ignore persistence errors here
                }
                break;
            }

            if (url.includes('/feed/update/') || url.includes('/posts/') || url.includes('/activity/')) {
                // Single post URL
                await scrapeSinglePost(page, url, campaign, processedUrls, stats);
            } else if (url.includes('/in/') || url.includes('/recent-activity/')) {
                // Profile URL or profile feed URL
                await scrapeProfileFeed(page, url, campaign, processedUrls, stats, maxPostsPerUrl);
            } else if (url.includes('/company/')) {
                // Company page URL
                console.log('   ℹ️ Company pages not yet supported, skipping...');
                // TODO: Implement company page scraping
            } else if (url.includes('/search/results/content/')) {
                // Search results URL - treat as search mode for this URL
                console.log('   🔍 Detected search results URL, processing as search...');
                // Navigate to the search URL directly
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await humanDelay(3000, 5000);

                // Process posts on this search page with retry logic
                let postsOnPage = 0;
                let consecutiveNoNewPosts = 0;
                let longWaitRetries = 0;
                const MAX_QUICK_RETRIES = 3;
                const MAX_LONG_WAIT_RETRIES = 3;

                while (postsOnPage < maxPostsPerUrl) {
                    const posts = await page.$$('.feed-shared-update-v2, .update-components-actor');
                    console.log(`   📄 Found ${posts.length} posts on search page`);

                    let processedInRound = 0;
                    for (const post of posts) {
                        if (postsOnPage >= maxPostsPerUrl) break;
                        // Skip filter for search URLs
                        const processed = await processPost(page, post, campaign, processedUrls, stats, true);
                        if (processed) {
                            postsOnPage++;
                            processedInRound++;
                        }
                    }

                    // If no posts processed, use retry logic
                    if (processedInRound === 0) {
                        consecutiveNoNewPosts++;
                        console.log(`   ⚠️ No new posts processed (attempt ${consecutiveNoNewPosts}/${MAX_QUICK_RETRIES})`);

                        if (consecutiveNoNewPosts >= MAX_QUICK_RETRIES) {
                            if (longWaitRetries < MAX_LONG_WAIT_RETRIES) {
                                longWaitRetries++;
                                consecutiveNoNewPosts = 0;
                                console.log(`   ⏳ Waiting 60 seconds before retry ${longWaitRetries}/${MAX_LONG_WAIT_RETRIES}...`);
                                await humanDelay(60000, 62000);
                                console.log('   🔄 Retrying scroll after long wait...');
                            } else {
                                console.log('   ⚠️ Reached max retries for this search URL');
                                break;
                            }
                        }
                    } else {
                        consecutiveNoNewPosts = 0;
                        longWaitRetries = 0;
                    }

                    if (postsOnPage >= maxPostsPerUrl) break;

                    // Scroll to load more
                    console.log('   📜 Scrolling to load more posts...');
                    await humanScroll(page);
                    await humanDelay(5000, 8000);
                }
            } else {
                console.log('   ⚠️ Unknown URL format, skipping...');
            }
        } catch (error) {
            console.error(`   ❌ Error processing URL: ${error.message}`);
            stats.errors++;
            // record as error stop if severe
            // continue to next URL
        }
    }

    // If we finished because we hit the per-campaign limit, mark reason
    if (!stats.stopReason && stats.postsProcessed >= (campaign.query?.limit || CONFIG.MAX_POSTS)) {
        stats.stopReason = 'limit_reached';
    }

    return stats;
}

/**
 * Scrape hiring posts using search mode
 */
async function scrapeBySearch(page, campaign) {
    console.log(`\n🔍 SEARCH MODE: Searching for "${campaign.query?.roles || CONFIG.SEARCH_QUERY}"`);

    const processedUrls = new Set();
    const stats = {
        postsProcessed: 0,
        leadsExtracted: 0,
        errors: 0,
    };

    const maxPosts = campaign.query?.limit || CONFIG.MAX_POSTS;
    const searchQuery = campaign.query?.roles || CONFIG.SEARCH_QUERY;
    const location = campaign.query?.location || CONFIG.LOCATION;
    const period = campaign.query?.period || 'past week';

    // DEBUG: Log the exact query values
    console.log('📊 Campaign Query Details:');
    console.log('   Campaign ID:', campaign._id);
    console.log('   Campaign Name:', campaign.name);
    console.log('   Raw query object:', JSON.stringify(campaign.query, null, 2));
    console.log('   Extracted searchQuery:', searchQuery);
    console.log('   Extracted location:', location);
    console.log('   Extracted period:', period);

    // DEBUG: Log the exact query values
    console.log('📊 Campaign Query Details:');
    console.log('   Campaign ID:', campaign._id);
    console.log('   Campaign Name:', campaign.name);
    console.log('   Raw query object:', JSON.stringify(campaign.query, null, 2));
    console.log('   Extracted searchQuery:', searchQuery);
    console.log('   Extracted location:', location);
    console.log('   Extracted period:', period);

    // Build LinkedIn search URL
    let searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(searchQuery)}&datePosted="${period.replace(' ', '-')}"&sortBy="date_posted"&contentType="jobs"`;

    // Add location filter if specified
    if (location) {
        searchUrl += `&geoUrn=${encodeURIComponent(location)}`;
    }

    console.log(`🔍 Final search URL: ${searchUrl}`);
    await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });
    await humanDelay(3000, 5000);

    // Check if we're logged in
    if (page.url().includes('/authwall') || page.url().includes('/login')) {
        console.error('❌ Not logged in! Please log in to LinkedIn in Chrome first.');
        throw new Error('Not logged in');
    }

    let consecutiveNoNewPosts = 0;
    let longWaitRetries = 0;
    const MAX_QUICK_RETRIES = 3;
    const MAX_LONG_WAIT_RETRIES = 3;
    let previousPostCount = 0;

    // Scroll and collect posts
    while (stats.postsProcessed < maxPosts) {
        // Check for rate limit
        if (await checkForRateLimit(page)) {
            console.warn('⚠️ Rate limit detected! Stopping gracefully...');
            stats.stopReason = 'rate_limit_detected';
            try {
                await CampaignModel.updateOne({ _id: campaign._id }, { 'stats.stopReason': stats.stopReason });
            } catch (e) { }
            break;
        }

        // Get all post cards on the page
        const posts = await page.$$('.feed-shared-update-v2, .update-components-actor');
        console.log(`📄 Found ${posts.length} posts on page`);

        let processedInThisRound = 0;

        for (const post of posts) {
            if (stats.postsProcessed >= maxPosts) break;

            // In search mode, skip the hiring keyword filter
            const processed = await processPost(page, post, campaign, processedUrls, stats, true);
            if (processed) {
                processedInThisRound++;
            }
        }

        console.log(`✅ Processed ${processedInThisRound} posts in this round (total: ${stats.postsProcessed}/${maxPosts})`);

        // Check if we need to load more posts
        if (stats.postsProcessed < maxPosts) {
            // Check if page has new posts since last scroll
            if (posts.length === previousPostCount && processedInThisRound === 0) {
                consecutiveNoNewPosts++;
                console.log(`⚠️ No new posts loaded (attempt ${consecutiveNoNewPosts}/${MAX_QUICK_RETRIES})`);

                if (consecutiveNoNewPosts >= MAX_QUICK_RETRIES) {
                    // Try longer waits
                    if (longWaitRetries < MAX_LONG_WAIT_RETRIES) {
                        longWaitRetries++;
                        consecutiveNoNewPosts = 0; // Reset quick retries
                        console.log(`⏳ Waiting 60 seconds before retry ${longWaitRetries}/${MAX_LONG_WAIT_RETRIES}...`);
                        await humanDelay(60000, 62000);
                        console.log('🔄 Retrying scroll after long wait...');
                    } else {
                        console.log('⚠️ Reached max retries, ending scroll');
                        break;
                    }
                }
            } else {
                // Reset retry counters if we made progress
                consecutiveNoNewPosts = 0;
                longWaitRetries = 0;
            }

            previousPostCount = posts.length;
            console.log('\n📜 Scrolling to load more posts...');
            await humanScroll(page);
            await humanDelay(5000, 8000);
        }
    }
    if (!stats.stopReason && stats.postsProcessed >= maxPosts) {
        stats.stopReason = 'limit_reached';
    }

    return stats;
}

/**
 * Main scraping function
 */
async function scrapeHiringPosts() {
    console.log('🚀 Starting LinkedIn Hiring Posts Scraper');

    // Initialize database
    await initDatabase();

    let campaign;

    // Load existing campaign or create new one
    if (CAMPAIGN_ID) {
        console.log(`� Loading campaign: ${CAMPAIGN_ID}`);
        campaign = await CampaignModel.findById(CAMPAIGN_ID);

        if (!campaign) {
            console.error(`❌ Campaign not found: ${CAMPAIGN_ID}`);
            process.exit(1);
        }

        console.log(`✓ Loaded campaign: ${campaign.name}`);
        console.log(`   Mode: ${campaign.seedUrls && campaign.seedUrls.length > 0 ? 'Seed URLs' : 'Search'}`);

        // Update campaign status to running
        await CampaignModel.updateOne(
            { _id: campaign._id },
            { status: 'running', progress: 0 }
        );
    } else {
        // Create new campaign with defaults
        console.log('📊 Creating new campaign with defaults');
        campaign = await CampaignModel.create({
            tenantId: CONFIG.TENANT_ID,
            name: `Hiring Posts - ${new Date().toISOString().split('T')[0]}`,
            description: 'Scraping LinkedIn hiring posts',
            source: 'linkedin',
            query: {
                mode: 'search',
                roles: CONFIG.SEARCH_QUERY,
                period: CONFIG.TIME_FILTER,
                location: CONFIG.LOCATION,
                limit: CONFIG.MAX_POSTS,
            },
            status: 'running',
        });
        console.log(`✓ Created campaign: ${campaign._id}`);
    }

    // Launch browser with persistent context
    console.log('🌐 Launching Chrome with dedicated profile...');
    console.log(`📁 Profile: ${CONFIG.CHROME_USER_DATA}`);
    console.log('');
    console.log('⚠️  IMPORTANT: If this is your first run, Chrome will open.');
    console.log('   You need to manually log into LinkedIn in the browser window.');
    console.log('   After logging in, the script will continue automatically.');
    console.log('');

    const browser = await chromium.launchPersistentContext(CONFIG.CHROME_USER_DATA, {
        headless: false,
        channel: 'chrome',
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await browser.newPage();
    console.log('✓ Browser ready');

    let stats = {
        postsProcessed: 0,
        leadsExtracted: 0,
        errors: 0,
    };

    try {
        // Check campaign mode and execute appropriate scraping strategy
        if (campaign.seedUrls && campaign.seedUrls.length > 0) {
            // SEED URL MODE
            stats = await scrapeSeedUrls(page, campaign, campaign.seedUrls);
        } else {
            // SEARCH MODE
            stats = await scrapeBySearch(page, campaign);
        }

        // Mark campaign as completed
        await CampaignModel.updateOne(
            { _id: campaign._id },
            {
                status: 'completed',
                progress: 100,
                'stats.postsProcessed': stats.postsProcessed,
                'stats.leadsExtracted': stats.leadsExtracted,
                'stats.errors': stats.errors,
                'stats.stopReason': stats.stopReason || null,
            }
        );

        console.log('\n✅ Scraping completed!');
        console.log(`📊 Summary:`);
        console.log(`   Posts processed: ${stats.postsProcessed}`);
        console.log(`   Leads extracted: ${stats.leadsExtracted}`);
        console.log(`   Errors: ${stats.errors}`);
        console.log(`   Campaign ID: ${campaign._id}`);

    } catch (error) {
        console.error('❌ Fatal error:', error);

        // Mark campaign as failed
        await CampaignModel.updateOne(
            { _id: campaign._id },
            { status: 'failed' }
        );
    } finally {
        await browser.close();
        await mongoose.connection.close();
    }
}

// Run the scraper
scrapeHiringPosts().catch(console.error);
