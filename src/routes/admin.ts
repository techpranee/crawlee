/**
 * Admin Routes
 * 
 * Monitoring and management endpoints for rate limiting and proxies
 */

import { Router } from 'express';
import { rateLimiter } from '../services/crawl/rateLimiter';
import { proxyRotator } from '../services/crawl/proxyRotator';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/admin/rate-limiter/stats?url=https://linkedin.com
 * Get rate limiter stats for a specific URL or domain
 */
router.get('/rate-limiter/stats', (req, res) => {
  const url = req.query.url as string;
  
  if (!url) {
    return res.status(400).json({ error: 'URL query parameter required' });
  }

  try {
    const stats = rateLimiter.getStats(url);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error({ error, url }, 'Failed to get rate limiter stats');
    res.status(500).json({ error: 'Failed to get rate limiter stats' });
  }
});

/**
 * POST /api/admin/rate-limiter/reset
 * Reset rate limiter state for a domain
 */
router.post('/rate-limiter/reset', (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required in request body' });
  }

  try {
    rateLimiter.reset(url);
    res.json({ success: true, message: `Rate limiter reset for ${url}` });
  } catch (error) {
    logger.error({ error, url }, 'Failed to reset rate limiter');
    res.status(500).json({ error: 'Failed to reset rate limiter' });
  }
});

/**
 * GET /api/admin/proxies/stats
 * Get proxy rotation stats
 */
router.get('/proxies/stats', (req, res) => {
  try {
    const stats = proxyRotator.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    logger.error({ error }, 'Failed to get proxy stats');
    res.status(500).json({ error: 'Failed to get proxy stats' });
  }
});

/**
 * POST /api/admin/proxies/reset
 * Reset proxy state
 */
router.post('/proxies/reset', (req, res) => {
  const { proxyUrl } = req.body;
  
  try {
    proxyRotator.reset(proxyUrl);
    res.json({ 
      success: true, 
      message: proxyUrl ? `Proxy ${proxyUrl} reset` : 'All proxies reset' 
    });
  } catch (error) {
    logger.error({ error, proxyUrl }, 'Failed to reset proxy');
    res.status(500).json({ error: 'Failed to reset proxy' });
  }
});

export default router;
