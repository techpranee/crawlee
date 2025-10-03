import { URLSearchParams } from 'node:url';

import { generateOllamaJson } from './ollama';
import { logger } from '../../utils/logger';

interface ApolloAudienceResponse {
  url: string;
  filters: Record<string, unknown>;
}

interface LinkedinAudienceResponse {
  query: string;
  rationale: string;
}

const TITLE_KEYWORDS = [
  'ceo',
  'cfo',
  'coo',
  'cmo',
  'cro',
  'cto',
  'vp',
  'vice president',
  'founder',
  'director',
  'head of',
  'manager',
  'lead',
  'engineer',
  'product',
  'sales',
  'marketing',
  'revenue',
  'operations',
  'growth',
];

const GEO_KEYWORDS = [
  'san francisco',
  'new york',
  'los angeles',
  'chicago',
  'austin',
  'seattle',
  'boston',
  'london',
  'berlin',
  'toronto',
  'remote',
  'usa',
  'united states',
  'canada',
  'europe',
];

const COMPANY_SIZE_MAP: Record<string, string> = {
  startup: '1-50',
  smb: '51-200',
  midmarket: '201-1000',
  enterprise: '1000+',
  'fortune 500': '5000+',
};

const INDUSTRY_KEYWORDS = [
  'saas',
  'software',
  'healthcare',
  'finance',
  'fintech',
  'marketing',
  'manufacturing',
  'education',
  'ai',
  'retail',
];

function sanitize(text: string): string {
  return text.normalize('NFKC').trim();
}

function extractMatches(text: string, keywords: string[]): string[] {
  const normalized = text.toLowerCase();
  return keywords.filter((keyword) => normalized.includes(keyword)).map((keyword) => sanitize(keyword));
}

function deriveTitles(text: string): string[] {
  const matches = extractMatches(text, TITLE_KEYWORDS);
  return matches.map((match) => (match === 'head of' ? 'Head' : match)).map((value) => value.replace(/\b([a-z])/g, (m) => m.toUpperCase()));
}

function deriveLocations(text: string): string[] {
  return extractMatches(text, GEO_KEYWORDS).map((value) => value.replace(/\b([a-z])/g, (m) => m.toUpperCase()));
}

function deriveCompanySize(text: string): string | undefined {
  for (const [keyword, size] of Object.entries(COMPANY_SIZE_MAP)) {
    if (text.toLowerCase().includes(keyword)) {
      return size;
    }
  }
  const rangeMatch = text.match(/(\d{1,2,3})\s*[-–]\s*(\d{1,2,3})/);
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]}`;
  }
  return undefined;
}

function deriveIndustries(text: string): string[] {
  const matches = extractMatches(text, INDUSTRY_KEYWORDS);
  return matches.map((value) => value.replace(/\b([a-z])/g, (m) => m.toUpperCase()));
}

function buildApolloUrl(filters: Record<string, unknown>): string {
  const params = new URLSearchParams({
    filters: JSON.stringify(filters),
  });
  return `https://app.apollo.io/#/people?${params.toString()}`;
}

export async function audienceToApollo(audience: string): Promise<ApolloAudienceResponse> {
  const trimmedAudience = sanitize(audience);
  const baseFilters: Record<string, unknown> = {
    titles: deriveTitles(trimmedAudience),
    locations: deriveLocations(trimmedAudience),
  };
  const size = deriveCompanySize(trimmedAudience);
  if (size) {
    baseFilters.companyHeadcount = size;
  }
  const industries = deriveIndustries(trimmedAudience);
  if (industries.length > 0) {
    baseFilters.industries = industries;
  }

  const prompt = [
    'You are an assistant that converts plain language B2B audience descriptions into Apollo People Search filter JSON.',
    'Return strict JSON with keys "url" and "filters". The "filters" object should contain titles, locations, industries, and companyHeadcount where relevant.',
    'Always output safe filters; never include personal data or anything unrelated to business audiences.',
    'Example:',
    '{"url":"https://app.apollo.io/#/people?filters={\\"titles\\":[\\"VP Marketing\\"],\\"locations\\":[\\"San Francisco\\"]}","filters":{"titles":["VP Marketing"],"locations":["San Francisco"]}}',
    `Audience: ${trimmedAudience}`,
    'JSON:',
  ].join('\n');

  const aiResponse = (await generateOllamaJson(prompt)) as ApolloAudienceResponse | null;
  if (aiResponse && aiResponse.url && aiResponse.filters) {
    return {
      url: aiResponse.url,
      filters: aiResponse.filters,
    };
  }

  const safeFilters = Object.fromEntries(
    Object.entries(baseFilters).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return Boolean(value);
    }),
  );

  const fallbackUrl = buildApolloUrl(safeFilters);
  return {
    url: fallbackUrl,
    filters: safeFilters,
  };
}

export async function audienceToLinkedin(audience: string): Promise<LinkedinAudienceResponse> {
  const trimmedAudience = sanitize(audience);
  const titles = deriveTitles(trimmedAudience);
  const locations = deriveLocations(trimmedAudience);
  const industries = deriveIndustries(trimmedAudience);

  const queryParts: string[] = [];
  if (titles.length > 0) {
    queryParts.push(`(title:${titles.map((title) => `"${title}"`).join(' OR ')})`);
  }
  if (locations.length > 0) {
    queryParts.push(`(location:${locations.map((loc) => `"${loc}"`).join(' OR ')})`);
  }
  if (industries.length > 0) {
    queryParts.push(`(industry:${industries.map((industry) => `"${industry}"`).join(' OR ')})`);
  }

  const baseQuery = queryParts.length > 0 ? queryParts.join(' AND ') : trimmedAudience;
  const linkedinQuery = `site:linkedin.com/in ${baseQuery}`.trim();

  const prompt = [
    'Create a concise boolean search string for LinkedIn or Google based on the given B2B audience.',
    'Respond with JSON keys "query" and "rationale".',
    `Audience: ${trimmedAudience}`,
    'JSON:',
  ].join('\n');

  const aiResponse = (await generateOllamaJson(prompt)) as LinkedinAudienceResponse | null;
  if (aiResponse && aiResponse.query) {
    return aiResponse;
  }

  return {
    query: linkedinQuery,
    rationale: 'Generated from rule-based parsing of titles, locations, and industries.',
  };
}
