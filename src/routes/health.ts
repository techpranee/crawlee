import { Router } from 'express';

import { appConfig } from '../config/env';

export function createHealthRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      version: appConfig.version,
    });
  });

  return router;
}
