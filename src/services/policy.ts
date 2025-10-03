import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { appConfig } from '../config/env';
import { logger } from '../utils/logger';

export interface RatePolicy {
  domain: string;
  maxRPS: number;
  delayMs: number;
  jitter: number;
  proxyPool: string[];
}

let cachedPolicies: Record<string, RatePolicy> | null = null;
let lastLoaded = 0;
const CACHE_TTL_MS = 60 * 1000;

async function loadPolicies(): Promise<Record<string, RatePolicy>> {
  const now = Date.now();
  if (cachedPolicies && now - lastLoaded < CACHE_TTL_MS) {
    return cachedPolicies;
  }

  try {
    if (!appConfig.policyConfigPath) {
      cachedPolicies = {
        default: { domain: 'default', maxRPS: 1, delayMs: 1000, jitter: 250, proxyPool: [] },
      };
      lastLoaded = now;
      return cachedPolicies;
    }

    const raw = await readFile(appConfig.policyConfigPath, 'utf8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const mapped: Record<string, RatePolicy> = {};
    for (const [domain, value] of Object.entries(json)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const record = value as Record<string, unknown>;
      mapped[domain] = {
        domain,
        maxRPS: Number(record.maxRPS) || 1,
        delayMs: Number(record.delayMs) || 1000,
        jitter: Number(record.jitter) || 250,
        proxyPool: Array.isArray(record.proxyPool)
          ? (record.proxyPool as string[]).map((item) => String(item))
          : [],
      };
    }
    if (!mapped.default) {
      mapped.default = {
        domain: 'default',
        maxRPS: 1,
        delayMs: 1000,
        jitter: 250,
        proxyPool: [],
      };
    }
    cachedPolicies = mapped;
    lastLoaded = now;
    return cachedPolicies;
  } catch (error) {
    logger.error({ err: error }, 'Failed to load policy config');
    cachedPolicies = {
      default: { domain: 'default', maxRPS: 1, delayMs: 1000, jitter: 250, proxyPool: [] },
    };
    return cachedPolicies;
  }
}

function extractDomain(input: string): string {
  if (!input) {
    return 'default';
  }
  try {
    if (input.includes('://')) {
      return new URL(input).hostname;
    }
    return input.toLowerCase();
  } catch (error) {
    return 'default';
  }
}

export async function getPolicy(domainOrUrl: string): Promise<RatePolicy> {
  const policies = await loadPolicies();
  const domain = extractDomain(domainOrUrl);
  const segments = domain.split('.');

  for (let i = 0; i < segments.length; i += 1) {
    const candidate = segments.slice(i).join('.');
    if (policies[candidate]) {
      return { ...policies[candidate], domain: candidate };
    }
  }

  return { ...policies.default };
}
