import { resolveMx } from 'node:dns/promises';

interface EmailEnrichInput {
  first: string;
  last: string;
  domain: string;
}

interface EmailEnrichOutput {
  guesses: string[];
  status: 'valid' | 'invalid' | 'unknown';
}

const domainCache = new Map<string, { status: 'valid' | 'invalid' | 'unknown'; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function sanitizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
}

function generatePatterns(first: string, last: string, domain: string): string[] {
  const safeFirst = first.replace(/[^a-z]/gi, '').toLowerCase();
  const safeLast = last.replace(/[^a-z]/gi, '').toLowerCase();
  const initials = safeFirst.charAt(0);
  const patterns = new Set<string>();

  if (safeFirst && safeLast) {
    patterns.add(`${safeFirst}.${safeLast}@${domain}`);
    patterns.add(`${safeFirst}${safeLast}@${domain}`);
    patterns.add(`${initials}${safeLast}@${domain}`);
    patterns.add(`${safeFirst}${safeLast.charAt(0)}@${domain}`);
  }
  if (safeFirst) {
    patterns.add(`${safeFirst}@${domain}`);
  }
  if (safeLast) {
    patterns.add(`${safeLast}@${domain}`);
  }

  return Array.from(patterns);
}

async function lookupDomain(domain: string): Promise<'valid' | 'invalid' | 'unknown'> {
  const cached = domainCache.get(domain);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.status;
  }

  try {
    const records = await resolveMx(domain);
    const status = records && records.length > 0 ? 'unknown' : 'invalid';
    domainCache.set(domain, { status, expiresAt: now + CACHE_TTL_MS });
    return status;
  } catch (error) {
    const status: 'valid' | 'invalid' | 'unknown' =
      (error as NodeJS.ErrnoException).code === 'ENOTFOUND' ? 'invalid' : 'unknown';
    domainCache.set(domain, { status, expiresAt: now + CACHE_TTL_MS });
    return status;
  }
}

export async function enrichEmail({ first, last, domain }: EmailEnrichInput): Promise<EmailEnrichOutput> {
  const sanitizedDomain = sanitizeDomain(domain);
  if (!sanitizedDomain) {
    return { guesses: [], status: 'invalid' };
  }

  const guesses = generatePatterns(first, last, sanitizedDomain);
  const status = await lookupDomain(sanitizedDomain);

  return {
    guesses,
    status,
  };
}
