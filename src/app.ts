import express from 'express';
import rateLimit from 'express-rate-limit';
import type Agenda from 'agenda';

import { idempotencyMiddleware } from './middleware/idempotency';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { createCampaignRouter } from './routes/campaigns';
import { createExportRouter } from './routes/export';
import { createHealthRouter } from './routes/health';
import { createScrapeRouter } from './routes/scrape';
import { createSvcRouter } from './routes/svc';
import { createJobRouter } from './routes/jobs';
import strategiesRouter from './routes/strategies';
import { createSettingsRouter } from './routes/settings';
import { createBrowserCaptureRouter } from './routes/browserCapture';
import { createAuthRouter } from './routes/auth';
import adminRouter from './routes/admin';
import linkedInRouter from './routes/linkedin';
import { tenantMiddleware } from './middleware/tenant';
import { httpLogger } from './utils/logger';
import { getMetricsRegistry, isReady } from './utils/metrics';

export interface AppDependencies {
  agenda: Agenda;
}

export function createApp({ agenda }: AppDependencies) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(httpLogger);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/health', createHealthRouter());

  app.get('/ready', (_req, res) => {
    if (isReady()) {
      res.json({ ok: true });
    } else {
      res.status(503).json({ ok: false });
    }
  });

  app.get('/metrics', async (_req, res, next) => {
    try {
      const registry = getMetricsRegistry();
      res.setHeader('Content-Type', registry.contentType);
      res.send(await registry.metrics());
    } catch (error) {
      next(error);
    }
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiRouter = express.Router();
  apiRouter.use(apiLimiter);
  apiRouter.use(tenantMiddleware);
  apiRouter.use(apiLimiter);
  apiRouter.use(idempotencyMiddleware);

  apiRouter.use('/campaigns', createCampaignRouter({ agenda }));
  apiRouter.use('/campaigns', createExportRouter());
  apiRouter.use('/scrape', createScrapeRouter());
  apiRouter.use('/jobs', createJobRouter({ agenda }));
  apiRouter.use('/strategies', strategiesRouter);
  apiRouter.use('/settings', createSettingsRouter());
  apiRouter.use('/browser', createBrowserCaptureRouter());
  apiRouter.use('/auth', createAuthRouter());
  apiRouter.use('/admin', adminRouter);
  apiRouter.use('/linkedin', linkedInRouter);

  app.use('/api', apiRouter);

  const svcRouter = express.Router();
  svcRouter.use(apiLimiter);
  svcRouter.use(tenantMiddleware);
  svcRouter.use(idempotencyMiddleware);
  svcRouter.use(createSvcRouter({ agenda }));

  app.use('/svc', svcRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
