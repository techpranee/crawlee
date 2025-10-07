/**
 * AI-planned LinkedIn hiring-lead collector (Posts -> Authors -> Profiles)
 * - Uses system Chrome (headful) with persistent profile for manual login once.
 * - AI "planner" produces search topics/keywords from your focus roles.
 * - Playwright collects recent posts mentioning hiring; opens authors; extracts:
 *   author name, author profile, company (if present), job title(s), location(s),
 *   post text, post url, timestamp.
 * - AI "extractor" turns messy post text into neat JSON.
 * - Trickle-feeds into CRM via webhook with strict rate limits.
 *
 * ⚠️ Use responsibly; respect platform ToS and rate limits. Keep volumes low.
 *
 * Usage:
 *   npm i playwright p-queue json2csv dotenv
 *   node ai_linkedin_hiring_leadgen.js --roles "frontend, react, node" --period "past week" --limit 20 --push-crm
 *
 * Env (.env):
 *   OLLAMA_URL=http://localhost:11434   # or leave empty to use OPENAI_*
 *   OLLAMA_MODEL=llama3.1:8b-instruct
 *   OPENAI_API_KEY=sk-...
 *   OPENAI_MODEL=gpt-4o-mini
 *   CRM_WEBHOOK=https://your-crm.example.com/leads/incoming
 */

import { chromium } from "playwright";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Parser as CsvParser } from "json2csv";
import { default as PQueue } from "p-queue";
import * as path from "path";
import * as url from "url";
import dotenv from "dotenv";
dotenv.config();

const args = parseArgs(process.argv.slice(2));
const USER_DATA_DIR = "./.playwright-chrome-profile";
const OUTDIR = "./out";
await fs.mkdir(OUTDIR, { recursive: true });

const LIMIT = Number(args.limit ?? 25);
const PERIOD = String(args.period ?? "past week"); // "past day" | "past week" | "past month"
const ROLES = String(args.roles ?? "software engineer, react, node");
const PUSH_CRM = !!args["push-crm"];

const CRM_WEBHOOK = process.env.CRM_WEBHOOK || "";
const OLLAMA_URL = process.env.OLLAMA_URL || "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:14b"; // Use available model
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---- tiny utils
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, spread = 400) => base + Math.floor(Math.random() * spread);

// Retry logic for network failures
async function retryable(fn, maxRetries = 3, context = "operation") {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e) {
            console.warn(`⚠️ Retry ${i + 1}/${maxRetries} for ${context}:`, e.message);
            if (i === maxRetries - 1) throw e;
            await sleep(jitter(2000, 2000));
        }
    }
}

// Safe text extraction with multiple selectors
async function safeExtractText(element, selectors, context = "element") {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorArray) {
        try {
            const text = await element.locator(selector).allInnerTexts();
            if (text && text.length > 0) {
                return text.join("\n").trim();
            }
        } catch (e) {
            // Try next selector
            continue;
        }
    }

    console.warn(`⚠️ Failed to extract text from ${context} with all selectors`);
    return "";
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k.startsWith("--")) {
            const key = k.slice(2);
            const next = argv[i + 1];
            if (!next || next.startsWith("--")) out[key] = true;
            else {
                out[key] = next;
                i++;
            }
        }
    }
    return out;
}

// ---- AI helpers (Ollama preferred; fallback OpenAI)
async function aiJSON(prompt, schemaHint = "") {
    const sys = `You are an analyst. Output STRICT JSON. ${schemaHint}`;
    const messages = [
        { role: "system", content: sys },
        { role: "user", content: prompt },
    ];

    // Ollama - use native API format
    if (OLLAMA_URL) {
        try {
            const ollamaBase = OLLAMA_URL.replace(/\/$/, ''); // Remove trailing slash
            const res = await fetch(`${ollamaBase}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages,
                    stream: false,
                    format: "json",
                    options: {
                        temperature: 0.2,
                    }
                }),
            });

            if (!res.ok) {
                const errorText = await res.text().catch(() => "Unknown error");
                throw new Error(`Ollama API error: ${res.status} ${res.statusText} - ${errorText}`);
            }

            const j = await res.json();
            const text = j?.message?.content || "{}";
            return safeParseJSON(text);
        } catch (e) {
            console.warn("⚠️ Ollama API failed, falling back to OpenAI:", e.message);
            // Fall through to OpenAI
        }
    }

    // OpenAI
    if (!OPENAI_KEY) {
        console.warn("⚠️ No OPENAI_KEY configured, returning empty JSON");
        return {};
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages,
        }),
    });
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content || "{}";
    return safeParseJSON(text);
}

function safeParseJSON(txt) {
    try { return JSON.parse(txt); } catch { return {}; }
}

// ---- AI planner: produce search queries, synonyms, and hashtags
async function planSearch(roles, period) {
    const plan = await aiJSON(
        `Produce a JSON plan for finding recent LinkedIn posts about hiring for roles: "${roles}". 
Return fields:
{
  "queries": string[], // 3-6 search queries/phrases to find "hiring" posts
  "tags": string[],    // 3-8 hashtags to include (#hiring, role tags)
  "filters": { "period": "${period}", "language":"en" },
  "notes": string      // brief strategy
}
Make queries specific, e.g. "hiring frontend developer", "we're hiring react", "looking for node.js engineer".`,
        `Ensure valid JSON with keys queries, tags, filters, notes.`
    );

    // basic fallback
    if (!plan?.queries?.length) {
        plan.queries = [
            "we are hiring frontend developer",
            "hiring react developer",
            "hiring node.js engineer",
        ];
        plan.tags = ["#hiring", "#nowhiring", "#job", "#frontend", "#reactjs", "#nodejs"];
        plan.filters = { period, language: "en" };
        plan.notes = "Fallback plan.";
    }
    return plan;
}

// ---- AI extractor: turn post text into structured lead info
async function extractFromPost({ postText, authorName, authorHeadline, authorCompanyGuess }) {
    const json = await aiJSON(
        `From the LinkedIn post content and author info, extract a hiring lead:
Input:
- Author: ${authorName}
- Headline: ${authorHeadline}
- CompanyGuess: ${authorCompanyGuess}
- Post: """${(postText || "").slice(0, 1500)}"""

Return fields:
{
  "isHiringPost": boolean,
  "company": string,           // best-guess
  "job_titles": string[],      // one or more roles mentioned
  "locations": string[],       // city/country or remote
  "seniority": string,         // junior/mid/senior/lead/etc if clear else ""
  "skills": string[],          // required tech/skills mentioned (e.g., React, Python, AWS)
  "salary_range": string,      // if mentioned, otherwise ""
  "application_link": string,  // apply URL if present, otherwise ""
  "notes": string              // short summary/keywords gleaned
}
Only true when clearly a hiring post.`,
        `Strict JSON with all fields.`
    );
    return json || {};
}

// ---- LinkedIn automation
async function ensureLoggedIn(page) {
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
        console.log("➡️ Please log in to LinkedIn in the opened Chrome window.");
        await page.waitForURL(/linkedin\.com\/feed/, { timeout: 0 });
        console.log("✅ Logged in.");
    }
}

function periodParams(period) {
    // heuristic: LinkedIn doesn't expose a stable param; we’ll use generic search and filter UI.
    // We'll still return a label we click later.
    const label =
        /day/i.test(period) ? "Past 24 hours" :
            /week/i.test(period) ? "Past week" :
                /month/i.test(period) ? "Past month" : "Any time";
    return { label };
}

async function searchPosts(page, query, periodLabel) {
    const url = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(jitter(1200, 800));

    // Click Filters → "Date posted" → select period if present (UI subject to change; best-effort)
    try {
        await page.locator('button:has-text("All filters"), button:has-text("Filters")').first().click({ timeout: 5000 });
        await sleep(jitter(400, 400));
        // date section
        const dateBtn = page.locator('button:has-text("Date posted")').first();
        if (await dateBtn.count()) {
            await dateBtn.click();
            await sleep(jitter(300, 300));
            const opt = page.locator(`label:has-text("${periodLabel}")`).first();
            if (await opt.count()) {
                await opt.click();
            }
        }
        await sleep(jitter(300, 300));
        const showBtn = page.locator('button:has-text("Show results"), button:has-text("Apply")').first();
        if (await showBtn.count()) {
            await showBtn.click();
            await sleep(jitter(1000, 800));
        }
    } catch { /* filter UI may differ, continue anyway */ }

    return page;
}

async function collectPostsOnPage(page, maxToCollect, pushedIds) {
    // Scroll and collect visible posts that mention hiring
    const leads = [];
    let attempts = 0;
    const startTime = Date.now();
    const MAX_DURATION = 5 * 60 * 1000; // 5 min per query

    while (leads.length < maxToCollect && attempts < 30 && Date.now() - startTime < MAX_DURATION) {
        const posts = page.locator('div.feed-shared-update-v2, div.reusable-search__result-container, div[data-id*="urn:li:activity"]');
        const count = await posts.count().catch(() => 0);

        console.log(`   📄 Scanning ${count} posts on page (attempt ${attempts + 1})...`);

        for (let i = 0; i < count && leads.length < maxToCollect; i++) {
            const post = posts.nth(i);
            const pid = await post.getAttribute("data-urn").catch(() =>
                post.getAttribute("data-id").catch(() => null)
            );
            if (pid && pushedIds.has(pid)) continue;

            // Enhanced text extraction with fallbacks
            const postTextRaw = await safeExtractText(post, [
                '[data-test-id="post-content"]',
                'div.feed-shared-update-v2__description',
                'span[dir="ltr"]',
                'div[class*="description"]',
                'div.feed-shared-text'
            ], "post content");

            // quick gate: must look like hiring
            if (!/\bhiring\b|\bwe'?re hiring\b|\blooking for\b|\bopenings?\b|\bapply\b|\bjoin.{0,20}team\b/i.test(postTextRaw)) continue;

            // Enhanced author extraction
            const authorName = await safeExtractText(post, [
                'span.feed-shared-actor__name',
                'span.update-components-actor__name',
                'a.update-components-actor__meta-link',
                'span[class*="actor__name"]'
            ], "author name");

            const authorHeadline = await safeExtractText(post, [
                'span.update-components-actor__description',
                'div.update-components-actor__sub-description',
                'span[class*="actor__description"]'
            ], "author headline");

            // Post link extraction with fallbacks
            const postLink = await post.locator('a.app-aware-link[href*="/posts/"], a[href*="/posts/"], a[href*="activity"]')
                .first()
                .getAttribute("href")
                .catch(() => null);

            // Author profile link with fallbacks
            let authorProfileHref = await post.locator('a[href*="/in/"], a[href*="linkedin.com/in/"]')
                .first()
                .getAttribute("href")
                .catch(() => null);
            if (authorProfileHref && authorProfileHref.startsWith("/")) {
                authorProfileHref = "https://www.linkedin.com" + authorProfileHref;
            }

            // Extract with AI
            console.log(`   🤖 Analyzing post from ${authorName || "Unknown"}...`);
            const extracted = await retryable(
                () => extractFromPost({
                    postText: postTextRaw,
                    authorName,
                    authorHeadline,
                    authorCompanyGuess: authorHeadline || "",
                }),
                2,
                "AI extraction"
            );

            if (extracted?.isHiringPost) {
                const lead = {
                    id: pid || postLink || `${authorProfileHref || ""}#${Math.random()}`,
                    author_name: (authorName || "").trim(),
                    author_headline: (authorHeadline || "").trim(),
                    author_profile: authorProfileHref || "",
                    company: extracted.company || "",
                    job_titles: extracted.job_titles || [],
                    locations: extracted.locations || [],
                    seniority: extracted.seniority || "",
                    skills: extracted.skills || [],
                    salary_range: extracted.salary_range || "",
                    application_link: extracted.application_link || "",
                    notes: extracted.notes || "",
                    post_text: postTextRaw.slice(0, 4000),
                    post_url: postLink ? (new URL(postLink, "https://www.linkedin.com")).toString() : "",
                    collected_at: new Date().toISOString(),
                };
                leads.push(lead);
                console.log(`   ✅ Found hiring post: ${lead.company || "Unknown"} - ${(lead.job_titles || []).join(", ")}`);
                if (pid) pushedIds.add(pid);
            }
        }

        // human-like scroll with occasional longer pauses
        const scrollAmount = 500 + Math.floor(Math.random() * 800);
        await page.mouse.wheel(0, scrollAmount);

        // Every 5 scrolls, take a longer break (simulate reading)
        if (attempts % 5 === 4) {
            console.log(`   ⏸️  Taking a reading break...`);
            await sleep(jitter(30_000, 20_000)); // 30-50s pause
        } else {
            await sleep(jitter(1500, 1200)); // 1.5-2.7s normal
        }

        attempts++;
    }

    return leads;
}

// ---- CRM push (optional)
async function pushToCRMBatch(leads) {
    if (!CRM_WEBHOOK) return { ok: false, reason: "CRM_WEBHOOK missing" };
    try {
        const res = await fetch(CRM_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "linkedin-hiring", leads }),
        });
        return { ok: res.ok, status: res.status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

// ---- main
(async () => {
    console.log("🚀 LinkedIn Hiring Lead Collector Starting...");
    console.log(`📋 Config: Roles="${ROLES}", Period="${PERIOD}", Limit=${LIMIT}`);

    const plan = await planSearch(ROLES, PERIOD);
    console.log("📋 AI Plan:", JSON.stringify(plan, null, 2));

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        channel: "chrome",
        headless: false,
        viewport: { width: 1320, height: 900 },
        args: [
            "--disable-blink-features=AutomationControlled",
            "--start-maximized"
        ],
        bypassCSP: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await ensureLoggedIn(page);

    // Load checkpoint if exists
    let checkpoint = { lastQuery: 0, totalCollected: 0 };
    try {
        const checkpointData = await fs.readFile(path.join(OUTDIR, "checkpoint.json"), "utf8");
        checkpoint = JSON.parse(checkpointData);
        console.log(`📍 Resuming from checkpoint: ${checkpoint.totalCollected} leads collected`);
    } catch {
        console.log("📍 Starting fresh (no checkpoint found)");
    }

    const { label: periodLabel } = periodParams(PERIOD);
    const queries = dedupe([
        ...plan.queries,
        ...plan.tags.map((t) => `hiring ${t.replace("#", "")}`),
    ]).slice(0, 8);

    const queue = new PQueue({
        intervalCap: 1,         // one task per interval
        interval: 30_000,       // 30s per item (increased from 25s)
        carryoverConcurrencyCount: true,
    });

    const allLeads = [];
    const pushedIds = new Set();
    const jsonlPath = path.join(OUTDIR, `leads_${Date.now()}.jsonl`);
    const jsonl = createWriteStream(jsonlPath, { flags: "a" });

    for (let queryIdx = checkpoint.lastQuery; queryIdx < queries.length; queryIdx++) {
        const q = queries[queryIdx];
        console.log(`\n🔍 Query ${queryIdx + 1}/${queries.length}: "${q}"`);

        await retryable(
            () => searchPosts(page, q, periodLabel),
            2,
            `search for "${q}"`
        );
        await sleep(jitter(1200, 900));

        // Collect a handful each query (e.g., 5) to reach LIMIT gently
        const remaining = Math.max(0, LIMIT - allLeads.length);
        console.log(`📊 Progress: ${allLeads.length}/${LIMIT} leads collected`);

        if (remaining <= 0) break;

        const take = Math.min(5, remaining);
        const leads = await collectPostsOnPage(page, take, pushedIds);
        console.log(`   ✨ Collected ${leads.length} new leads from this query`);

        // schedule CRM pushes with delays (trickle)
        for (const lead of leads) {
            allLeads.push(lead);
            jsonl.write(JSON.stringify(lead) + "\n");

            queue.add(async () => {
                if (PUSH_CRM) {
                    const result = await pushToCRMBatch([lead]);
                    console.log(`→ CRM push (${lead.author_name} / ${lead.company || "?"})`, result);
                } else {
                    console.log(`→ Staged lead: ${lead.author_name} @ ${lead.company || "?"}`);
                }
                await sleep(jitter(3000, 3000)); // extra pause
            });

            if (allLeads.length >= LIMIT) break;
        }

        // Save checkpoint after each query
        checkpoint = { lastQuery: queryIdx + 1, totalCollected: allLeads.length };
        await fs.writeFile(
            path.join(OUTDIR, "checkpoint.json"),
            JSON.stringify(checkpoint),
            "utf8"
        );

        if (allLeads.length >= LIMIT) break;

        // Longer rest between queries (increased from 8-13s to 15-25s)
        console.log(`   ⏸️  Resting before next query...`);
        await sleep(jitter(15_000, 10_000)); // 15-25s
    }

    // Drain queue
    console.log("\n⏳ Finalizing CRM pushes...");
    await queue.onIdle();
    jsonl.end();

    // Also save CSV
    const csv = new CsvParser({
        fields: [
            "author_name",
            "author_headline",
            "author_profile",
            "company",
            "job_titles",
            "locations",
            "seniority",
            "skills",
            "salary_range",
            "application_link",
            "notes",
            "post_url",
            "collected_at",
        ],
    }).parse(allLeads);

    const csvPath = path.join(OUTDIR, `leads_${Date.now()}.csv`);
    await fs.writeFile(csvPath, csv, "utf8");

    console.log(`\n✅ Collection Complete!`);
    console.log(`   📊 Total leads: ${allLeads.length}`);
    console.log(`   📝 JSONL: ${jsonlPath}`);
    console.log(`   📊 CSV  : ${csvPath}`);

    // Clean up checkpoint
    try {
        await fs.unlink(path.join(OUTDIR, "checkpoint.json"));
    } catch { /* ignore */ }

    // Keep browser open for a bit for you to review page; comment to auto-close
    console.log("\n👀 Browser kept open for review. Close manually when done.");
    // await context.close();
})();

function dedupe(arr) {
    return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
