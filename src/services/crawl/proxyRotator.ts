/**
 * Proxy Rotation Service
 * 
 * Manages rotation of residential/datacenter proxies for anti-detection
 * Tracks proxy health and failures
 */

import { logger } from '../../utils/logger';
import { appConfig } from '../../config/env';

interface ProxyState {
  url: string;
  successCount: number;
  failureCount: number;
  lastUsed: number;
  lastFailure: number | null;
  consecutiveFailures: number;
  isHealthy: boolean;
}

class ProxyRotator {
  private proxies: ProxyState[] = [];
  private currentIndex = 0;
  private readonly maxConsecutiveFailures = 3;
  private readonly unhealthyTimeout = 30 * 60 * 1000; // 30 minutes before retry

  constructor() {
    this.initializeProxies();
  }

  private initializeProxies(): void {
    const proxyUrls = appConfig.proxyUrls || (appConfig.proxyUrl ? [appConfig.proxyUrl] : []);
    
    if (proxyUrls.length === 0) {
      logger.info('No proxies configured, will use direct connection');
      return;
    }

    this.proxies = proxyUrls.map(url => ({
      url,
      successCount: 0,
      failureCount: 0,
      lastUsed: 0,
      lastFailure: null,
      consecutiveFailures: 0,
      isHealthy: true,
    }));

    logger.info({ 
      proxyCount: this.proxies.length,
      rotation: appConfig.proxyRotation 
    }, 'Initialized proxy rotation');
  }

  /**
   * Get next proxy URL based on rotation strategy
   */
  getNextProxy(): string | undefined {
    if (this.proxies.length === 0) {
      return undefined;
    }

    // Filter healthy proxies
    const healthyProxies = this.getHealthyProxies();
    
    if (healthyProxies.length === 0) {
      logger.warn('No healthy proxies available, using direct connection');
      return undefined;
    }

    let selectedProxy: ProxyState;

    if (appConfig.proxyRotation === 'round-robin') {
      // Round-robin: cycle through healthy proxies
      this.currentIndex = this.currentIndex % healthyProxies.length;
      selectedProxy = healthyProxies[this.currentIndex];
      this.currentIndex++;
    } else {
      // Random: pick random healthy proxy
      const randomIndex = Math.floor(Math.random() * healthyProxies.length);
      selectedProxy = healthyProxies[randomIndex];
    }

    selectedProxy.lastUsed = Date.now();
    
    logger.info({ 
      proxyUrl: this.maskProxyUrl(selectedProxy.url),
      strategy: appConfig.proxyRotation,
      healthyCount: healthyProxies.length,
      totalCount: this.proxies.length,
    }, 'Selected proxy for request');

    return selectedProxy.url;
  }

  /**
   * Get list of healthy proxies (not in cooldown period)
   */
  private getHealthyProxies(): ProxyState[] {
    const now = Date.now();
    
    return this.proxies.filter(proxy => {
      // If proxy is marked unhealthy, check if cooldown period has passed
      if (!proxy.isHealthy && proxy.lastFailure) {
        const timeSinceFailure = now - proxy.lastFailure;
        if (timeSinceFailure > this.unhealthyTimeout) {
          // Reset proxy health after cooldown
          proxy.isHealthy = true;
          proxy.consecutiveFailures = 0;
          logger.info({ 
            proxyUrl: this.maskProxyUrl(proxy.url) 
          }, 'Proxy health restored after cooldown');
          return true;
        }
        return false;
      }
      
      return proxy.isHealthy;
    });
  }

  /**
   * Record successful request through proxy
   */
  recordSuccess(proxyUrl: string): void {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (!proxy) return;

    proxy.successCount++;
    proxy.consecutiveFailures = 0;
    proxy.isHealthy = true;

    logger.debug({ 
      proxyUrl: this.maskProxyUrl(proxyUrl),
      successCount: proxy.successCount 
    }, 'Proxy request succeeded');
  }

  /**
   * Record failed request through proxy
   */
  recordFailure(proxyUrl: string, reason?: string): void {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (!proxy) return;

    proxy.failureCount++;
    proxy.consecutiveFailures++;
    proxy.lastFailure = Date.now();

    if (proxy.consecutiveFailures >= this.maxConsecutiveFailures) {
      proxy.isHealthy = false;
      logger.warn({ 
        proxyUrl: this.maskProxyUrl(proxyUrl),
        consecutiveFailures: proxy.consecutiveFailures,
        reason,
        cooldownMinutes: this.unhealthyTimeout / 60000,
      }, 'Proxy marked as unhealthy');
    } else {
      logger.warn({ 
        proxyUrl: this.maskProxyUrl(proxyUrl),
        consecutiveFailures: proxy.consecutiveFailures,
        reason,
      }, 'Proxy request failed');
    }
  }

  /**
   * Mask proxy URL for logging (hide credentials)
   */
  private maskProxyUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.username || urlObj.password) {
        return `${urlObj.protocol}//${urlObj.username ? '***:***@' : ''}${urlObj.host}`;
      }
      return url;
    } catch {
      return 'invalid-url';
    }
  }

  /**
   * Get stats for all proxies
   */
  getStats() {
    return {
      totalProxies: this.proxies.length,
      healthyProxies: this.getHealthyProxies().length,
      rotation: appConfig.proxyRotation,
      proxies: this.proxies.map(proxy => ({
        url: this.maskProxyUrl(proxy.url),
        isHealthy: proxy.isHealthy,
        successCount: proxy.successCount,
        failureCount: proxy.failureCount,
        consecutiveFailures: proxy.consecutiveFailures,
        lastUsed: proxy.lastUsed > 0 ? new Date(proxy.lastUsed).toISOString() : null,
        lastFailure: proxy.lastFailure ? new Date(proxy.lastFailure).toISOString() : null,
      })),
    };
  }

  /**
   * Reset proxy state (for testing/admin)
   */
  reset(proxyUrl?: string): void {
    if (proxyUrl) {
      const proxy = this.proxies.find(p => p.url === proxyUrl);
      if (proxy) {
        proxy.successCount = 0;
        proxy.failureCount = 0;
        proxy.consecutiveFailures = 0;
        proxy.isHealthy = true;
        proxy.lastFailure = null;
        logger.info({ proxyUrl: this.maskProxyUrl(proxyUrl) }, 'Proxy state reset');
      }
    } else {
      this.initializeProxies();
      logger.info('All proxy states reset');
    }
  }
}

// Singleton instance
export const proxyRotator = new ProxyRotator();
