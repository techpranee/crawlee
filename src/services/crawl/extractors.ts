import type { CheerioAPI } from 'cheerio';
import type { PlaywrightCrawlingContext } from 'crawlee';

export interface RawExtraction {
  url: string;
  data: Record<string, string | null>;
  metadata: {
    title?: string | null;
    description?: string | null;
    canonicalUrl?: string | null;
  };
}

export interface ExtractionOptions {
  selectors?: Record<string, string>;
}

function sanitize(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function extractFromCheerio(
  $: CheerioAPI,
  requestUrl: string,
  options: ExtractionOptions = {},
): RawExtraction {
  const descriptionMeta = $('meta[name="description"]').attr('content') || null;
  const canonicalLink = $('link[rel="canonical"]').attr('href') || null;

  if (options.selectors && Object.keys(options.selectors).length > 0) {
    const data: Record<string, string | null> = {};
    for (const [field, selector] of Object.entries(options.selectors)) {
      data[field] = sanitize($(selector).first().text());
    }

    return {
      url: requestUrl,
      data,
      metadata: {
        title: sanitize($('title').first().text()),
        description: sanitize(descriptionMeta),
        canonicalUrl: sanitize(canonicalLink),
      },
    };
  }

  const title = $('title').first().text();

  return {
    url: requestUrl,
    data: {
      title: sanitize(title),
      description: sanitize(descriptionMeta),
    },
    metadata: {
      title: sanitize(title),
      description: sanitize(descriptionMeta),
      canonicalUrl: sanitize(canonicalLink),
    },
  };
}

async function getLocatorText(
  context: PlaywrightCrawlingContext,
  selector: string,
): Promise<string | null> {
  try {
    return await context.page.locator(selector).first().evaluate((el) => el?.textContent ?? null);
  } catch (error) {
    return null;
  }
}

async function getLocatorAttribute(
  context: PlaywrightCrawlingContext,
  selector: string,
  attribute: string,
): Promise<string | null> {
  try {
    return await context.page.locator(selector).first().getAttribute(attribute);
  } catch (error) {
    return null;
  }
}

export async function extractFromPlaywright(
  context: PlaywrightCrawlingContext,
  options: ExtractionOptions = {},
): Promise<RawExtraction> {
  const { request } = context;
  const requestUrl = request.loadedUrl ?? request.url;
  const title = await context.page.title().catch(() => null);
  const descriptionMeta = await getLocatorAttribute(context, 'meta[name="description"]', 'content');
  const canonicalLink = await getLocatorAttribute(context, 'link[rel="canonical"]', 'href');

  if (options.selectors && Object.keys(options.selectors).length > 0) {
    const data: Record<string, string | null> = {};
    for (const [field, selector] of Object.entries(options.selectors)) {
      const value = await getLocatorText(context, selector);
      data[field] = sanitize(value);
    }

    return {
      url: requestUrl,
      data,
      metadata: {
        title: sanitize(title),
        description: sanitize(descriptionMeta),
        canonicalUrl: sanitize(canonicalLink),
      },
    };
  }

  return {
    url: requestUrl,
    data: {
      title: sanitize(title),
      description: sanitize(descriptionMeta),
    },
    metadata: {
      title: sanitize(title),
      description: sanitize(descriptionMeta),
      canonicalUrl: sanitize(canonicalLink),
    },
  };
}
