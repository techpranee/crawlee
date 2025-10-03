/**
 * Rate Limiting Service for LinkedIn Scraping
 * 
 * Tracks requests per domain/tenant to avoid HTTP 429 blocks
 * Implements exponential backoff and request throttling
 */

import { logger } from '../../utils/logger';

interface RequestRecord {
  url: string;
  timestamp: number;
  status: 'success' | 'rate_limited' | 'error';
}

interface DomainState {
  requests: RequestRecord[];
  lastRequestTime: number;
  consecutiveRateLimits: number;
  backoffUntil: number | null;
}

class RateLimiter {
  private domainStates = new Map<string, DomainState>();
  
  // Configuration per domain
  private readonly configs = {
    'linkedin.com': {
      minDelayMs: 10 * 60 * 1000,      // 10 minutes minimum between requests
      maxDelayMs: 60 * 60 * 1000,      // 60 minutes maximum delay
      jitterMs: 5 * 60 * 1000,         // ±5 minutes random jitter
      backoffMultiplier: 2,            // Double delay on each 429
      maxConsecutiveRateLimits: 3,    // After 3x 429, stop for extended period
      extendedBackoffMs: 2 * 60 * 60 * 1000, // 2 hours extended backoff
      requestWindowMs: 60 * 60 * 1000, // Track requests in 1 hour window
      maxRequestsPerWindow: 10,        // Max 10 requests per hour
    },
    default: {
      minDelayMs: 1000,                // 1 second minimum
      maxDelayMs: 10000,               // 10 seconds maximum
      jitterMs: 500,                   // ±500ms jitter
      backoffMultiplier: 1.5,
      maxConsecutiveRateLimits: 5,
      extendedBackoffMs: 30 * 60 * 1000, // 30 minutes
      requestWindowMs: 60 * 1000,      // 1 minute window
      maxRequestsPerWindow: 30,        // 30 requests per minute
    },
  };

  private getDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  private getConfig(domain: string) {
    if (domain.includes('linkedin.com')) {
      return this.configs['linkedin.com'];
    }
    return this.configs.default;
  }

  private getState(domain: string): DomainState {
    if (!this.domainStates.has(domain)) {
      this.domainStates.set(domain, {
        requests: [],
        lastRequestTime: 0,
        consecutiveRateLimits: 0,
        backoffUntil: null,
      });
    }
    return this.domainStates.get(domain)!;
  }

  /**
   * Calculate required delay before next request
   */
  async calculateDelay(url: string): Promise<number> {
    const domain = this.getDomain(url);
    const config = this.getConfig(domain);
    const state = this.getState(domain);
    const now = Date.now();

    // Check if in extended backoff period
    if (state.backoffUntil && now < state.backoffUntil) {
      const waitMs = state.backoffUntil - now;
      logger.warn({
        domain,
        waitSeconds: Math.round(waitMs / 1000),
        reason: 'extended_backoff',
      }, 'Domain is in extended backoff period');
      return waitMs;
    }

    // Clean old requests from tracking window
    const windowStart = now - config.requestWindowMs;
    state.requests = state.requests.filter(r => r.timestamp > windowStart);

    // Check request count in window
    if (state.requests.length >= config.maxRequestsPerWindow) {
      const oldestRequest = state.requests[0];
      const waitMs = oldestRequest.timestamp + config.requestWindowMs - now;
      logger.warn({
        domain,
        requestsInWindow: state.requests.length,
        maxRequests: config.maxRequestsPerWindow,
        waitSeconds: Math.round(waitMs / 1000),
      }, 'Request window limit reached');
      return Math.max(0, waitMs);
    }

    // Calculate delay based on last request + exponential backoff
    let baseDelay = config.minDelayMs;
    
    if (state.consecutiveRateLimits > 0) {
      // Apply exponential backoff
      baseDelay = Math.min(
        config.maxDelayMs,
        config.minDelayMs * Math.pow(config.backoffMultiplier, state.consecutiveRateLimits)
      );
      logger.info({
        domain,
        consecutiveRateLimits: state.consecutiveRateLimits,
        baseDelaySeconds: Math.round(baseDelay / 1000),
      }, 'Applying exponential backoff');
    }

    // Add random jitter
    const jitter = Math.random() * config.jitterMs * 2 - config.jitterMs;
    const totalDelay = baseDelay + jitter;

    // Calculate time since last request
    const timeSinceLastRequest = now - state.lastRequestTime;
    const requiredWait = Math.max(0, totalDelay - timeSinceLastRequest);

    if (requiredWait > 0) {
      logger.info({
        domain,
        requiredWaitSeconds: Math.round(requiredWait / 1000),
        timeSinceLastSeconds: Math.round(timeSinceLastRequest / 1000),
      }, 'Rate limiting delay required');
    }

    return requiredWait;
  }

  /**
   * Wait before making request (enforces rate limits)
   */
  async waitBeforeRequest(url: string): Promise<void> {
    const delayMs = await this.calculateDelay(url);
    
    if (delayMs > 0) {
      const domain = this.getDomain(url);
      logger.info({
        domain,
        url,
        delaySeconds: Math.round(delayMs / 1000),
      }, 'Waiting before request due to rate limiting');
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(url: string): void {
    const domain = this.getDomain(url);
    const state = this.getState(domain);
    const now = Date.now();

    state.requests.push({
      url,
      timestamp: now,
      status: 'success',
    });
    state.lastRequestTime = now;
    
    // Reset consecutive rate limits on success
    if (state.consecutiveRateLimits > 0) {
      logger.info({
        domain,
        previousRateLimits: state.consecutiveRateLimits,
      }, 'Request succeeded, resetting rate limit counter');
      state.consecutiveRateLimits = 0;
      state.backoffUntil = null;
    }
  }

  /**
   * Record rate limit hit (HTTP 429)
   */
  recordRateLimit(url: string): void {
    const domain = this.getDomain(url);
    const config = this.getConfig(domain);
    const state = this.getState(domain);
    const now = Date.now();

    state.requests.push({
      url,
      timestamp: now,
      status: 'rate_limited',
    });
    state.lastRequestTime = now;
    state.consecutiveRateLimits += 1;

    logger.warn({
      domain,
      url,
      consecutiveRateLimits: state.consecutiveRateLimits,
      maxConsecutive: config.maxConsecutiveRateLimits,
    }, 'Rate limit hit recorded');

    // If too many consecutive rate limits, enter extended backoff
    if (state.consecutiveRateLimits >= config.maxConsecutiveRateLimits) {
      state.backoffUntil = now + config.extendedBackoffMs;
      logger.error({
        domain,
        backoffMinutes: Math.round(config.extendedBackoffMs / 60000),
        backoffUntil: new Date(state.backoffUntil).toISOString(),
      }, 'Too many consecutive rate limits, entering extended backoff');
    }
  }

  /**
   * Record request error (non-rate-limit)
   */
  recordError(url: string): void {
    const domain = this.getDomain(url);
    const state = this.getState(domain);
    const now = Date.now();

    state.requests.push({
      url,
      timestamp: now,
      status: 'error',
    });
    state.lastRequestTime = now;
  }

  /**
   * Check if domain is currently blocked (in backoff)
   */
  isBlocked(url: string): boolean {
    const domain = this.getDomain(url);
    const state = this.getState(domain);
    const now = Date.now();

    return !!(state.backoffUntil && now < state.backoffUntil);
  }

  /**
   * Get current state for monitoring/debugging
   */
  getStats(url: string) {
    const domain = this.getDomain(url);
    const config = this.getConfig(domain);
    const state = this.getState(domain);
    const now = Date.now();

    const windowStart = now - config.requestWindowMs;
    const recentRequests = state.requests.filter(r => r.timestamp > windowStart);

    return {
      domain,
      requestsInWindow: recentRequests.length,
      maxRequestsPerWindow: config.maxRequestsPerWindow,
      consecutiveRateLimits: state.consecutiveRateLimits,
      isBlocked: this.isBlocked(url),
      backoffUntil: state.backoffUntil ? new Date(state.backoffUntil).toISOString() : null,
      minDelaySeconds: Math.round(config.minDelayMs / 1000),
      timeSinceLastRequestSeconds: state.lastRequestTime > 0 
        ? Math.round((now - state.lastRequestTime) / 1000)
        : null,
    };
  }

  /**
   * Reset state for a domain (for testing/admin purposes)
   */
  reset(url: string): void {
    const domain = this.getDomain(url);
    this.domainStates.delete(domain);
    logger.info({ domain }, 'Rate limiter state reset');
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
