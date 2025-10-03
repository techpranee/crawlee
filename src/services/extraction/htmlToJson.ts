import { load } from 'cheerio';

import { generateOllamaJson } from '../nlp/ollama';

interface HtmlToJsonInput {
  html: string;
  schema: Record<string, unknown>;
}

interface HtmlToJsonOutput {
  json: Record<string, unknown>;
  confidence: number;
}

const MAX_HTML_LENGTH = 8000;

function truncateHtml(html: string): string {
  if (html.length <= MAX_HTML_LENGTH) {
    return html;
  }
  return `${html.slice(0, MAX_HTML_LENGTH)}<!-- truncated -->`;
}

function fallbackExtract(html: string, schema: Record<string, unknown>): Record<string, unknown> {
  const $ = load(html);
  const fields = (schema.fields as Record<string, { selectors?: string[] }> | undefined) ?? {};
  const result: Record<string, unknown> = {};

  for (const [field, config] of Object.entries(fields)) {
    const selectors = config?.selectors ?? [];
    for (const selector of selectors) {
      const value = $(selector).first().text().trim();
      if (value) {
        result[field] = value;
        break;
      }
    }
  }

  return result;
}

export async function extractHtmlToJson({ html, schema }: HtmlToJsonInput): Promise<HtmlToJsonOutput> {
  const prompt = [
    'Extract structured JSON data from the provided HTML according to the schema. Respond with JSON matching the schema keys only.',
    `Schema: ${JSON.stringify(schema)}`,
    `HTML: ${truncateHtml(html)}`,
    'JSON:',
  ].join('\n');

  const aiResponse = (await generateOllamaJson(prompt, { maxTokens: 600 })) as
    | { json?: Record<string, unknown>; confidence?: number }
    | null;

  if (aiResponse && typeof aiResponse === 'object' && aiResponse.json) {
    return {
      json: aiResponse.json,
      confidence: typeof aiResponse.confidence === 'number' ? aiResponse.confidence : 0.8,
    };
  }

  const fallback = fallbackExtract(html, schema);
  return {
    json: fallback,
    confidence: 0.4,
  };
}
