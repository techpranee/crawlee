#!/usr/bin/env tsx
/**
 * Test different Ollama vision models with saved LinkedIn captures
 * 
 * Usage:
 *   tsx scripts/test-vision-models.ts <capture-dir> [model-name]
 * 
 * Examples:
 *   tsx scripts/test-vision-models.ts storage/ai-analysis/linkedin-...
 *   tsx scripts/test-vision-models.ts storage/ai-analysis/linkedin-... llama3.2-vision:latest
 *   tsx scripts/test-vision-models.ts storage/ai-analysis/linkedin-... gpt-4-vision
 */

import { promises as fs } from 'fs';
import path from 'path';

interface TestConfig {
  captureDir: string;
  model: string;
  ollamaUrl: string;
}

async function loadCapturedData(captureDir: string) {
  const screenshotPath = path.join(captureDir, 'screenshot.jpg');
  const htmlPath = path.join(captureDir, 'page.html');
  const metadataPath = path.join(captureDir, 'metadata.json');

  const [screenshot, html, metadataStr] = await Promise.all([
    fs.readFile(screenshotPath),
    fs.readFile(htmlPath, 'utf-8'),
    fs.readFile(metadataPath, 'utf-8'),
  ]);

  const metadata = JSON.parse(metadataStr);
  const screenshotBase64 = screenshot.toString('base64');

  return { screenshot, screenshotBase64, html, metadata };
}

function buildPrompt(metadata: any, simplifiedHtml: string): string {
  const prompt = metadata.naturalLanguagePrompt || 'Extract relevant data from this page';
  const platform = metadata.platform || 'generic';

  return `You are an expert at web scraping and CSS selector generation. I'm providing you with BOTH a screenshot and HTML code of a ${platform} page.

TASK: ${prompt}

INSTRUCTIONS:
1. First, visually analyze the screenshot to identify where the requested elements appear on the page
2. Then, cross-reference those visual elements with the HTML structure below
3. Generate precise CSS selectors by matching visual position with DOM structure
4. Pay attention to:
   - Element positioning and layout (what's near the top, in cards, in lists, etc.)
   - Visual hierarchy (headers vs body text, bold vs normal, size differences)
   - Repeated patterns (list items, cards, posts)
   - Distinguishing features (icons, avatars, timestamps)

HTML Structure (first 8000 chars):
${simplifiedHtml}

Respond with ONLY valid JSON in this exact format:
{
  "selectors": [
    {
      "selector": "div.post-card h3.author-name",
      "field": "author_name",
      "type": "text",
      "required": true,
      "multiple": false,
      "visualContext": "Top of each card, bold text next to avatar"
    }
  ]
}`;
}

async function testWithOllama(config: TestConfig, screenshotBase64: string, prompt: string) {
  const ollamaBaseUrl = config.ollamaUrl.replace(/\/$/, '');

  console.log(`\n🤖 Testing with Ollama model: ${config.model}`);
  console.log(`📡 URL: ${ollamaBaseUrl}/api/generate`);
  console.log(`📸 Screenshot size: ${Math.round(Buffer.from(screenshotBase64, 'base64').length / 1024)} KB`);

  const requestBody = {
    model: config.model,
    prompt,
    stream: false,
    images: [screenshotBase64],
    options: {
      temperature: 0.2,
      top_p: 0.9,
    },
  };

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error ${response.status}: ${response.statusText}`);
      console.error(`Response: ${errorText.substring(0, 500)}`);
      return null;
    }

    const data = await response.json();
    const aiResponse = data.response;

    console.log(`✅ Success! Response received in ${(elapsed / 1000).toFixed(2)}s`);
    console.log(`📝 Response length: ${aiResponse?.length || 0} characters`);

    // Extract JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️  No valid JSON found in response');
      console.log('Raw response:', aiResponse.substring(0, 500));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const selectors = parsed.selectors || [];

    console.log(`\n🎯 Extracted ${selectors.length} selectors:`);
    selectors.forEach((sel: any, idx: number) => {
      console.log(`\n  ${idx + 1}. ${sel.field || 'unknown'}:`);
      console.log(`     Selector: ${sel.selector}`);
      console.log(`     Type: ${sel.type || 'text'}`);
      console.log(`     Visual Context: ${sel.visualContext || 'N/A'}`);
    });

    // Save results
    const resultsDir = path.join(config.captureDir, 'model-tests');
    await fs.mkdir(resultsDir, { recursive: true });

    const resultFile = path.join(
      resultsDir,
      `${config.model.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`
    );

    await fs.writeFile(
      resultFile,
      JSON.stringify(
        {
          model: config.model,
          timestamp: new Date().toISOString(),
          elapsedMs: elapsed,
          selectors,
          rawResponse: aiResponse,
        },
        null,
        2
      ),
      'utf-8'
    );

    console.log(`\n💾 Results saved to: ${resultFile}`);

    return selectors;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error after ${(elapsed / 1000).toFixed(2)}s:`, error);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: tsx scripts/test-vision-models.ts <capture-dir> [model-name]');
    console.error('\nExample:');
    console.error('  tsx scripts/test-vision-models.ts storage/ai-analysis/linkedin-...');
    process.exit(1);
  }

  const captureDir = path.resolve(args[0]);
  const model = args[1] || process.env.OLLAMA_MODEL || 'llama3.2-vision:latest';
  const ollamaUrl = process.env.OLLAMA_URL || 'https://ollama2.havenify.ai';

  console.log('🔍 Testing Vision Models with Saved Captures');
  console.log('=' .repeat(60));
  console.log(`📁 Capture directory: ${captureDir}`);
  console.log(`🤖 Model: ${model}`);
  console.log(`🌐 Ollama URL: ${ollamaUrl}`);
  console.log('=' .repeat(60));

  // Load captured data
  console.log('\n📂 Loading captured data...');
  const { screenshotBase64, html, metadata } = await loadCapturedData(captureDir);

  console.log(`✅ Loaded screenshot (${Math.round(Buffer.from(screenshotBase64, 'base64').length / 1024)} KB)`);
  console.log(`✅ Loaded HTML (${Math.round(html.length / 1024)} KB)`);
  console.log(`✅ Metadata: ${metadata.url}`);

  // Simplify HTML
  const simplifiedHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .substring(0, 8000);

  // Build prompt
  const prompt = buildPrompt(metadata, simplifiedHtml);

  // Test with Ollama
  const config: TestConfig = {
    captureDir,
    model,
    ollamaUrl,
  };

  await testWithOllama(config, screenshotBase64, prompt);

  console.log('\n✨ Test complete!');
}

main().catch(console.error);
