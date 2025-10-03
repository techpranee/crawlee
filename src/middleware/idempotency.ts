import { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';

import { IdempotencyKeyModel } from '../db/models/IdempotencyKey';
import { appConfig } from '../config/env';
import { logger } from '../utils/logger';

type AugmentedRequest = Request & {
  tenantId?: string;
  idempotencyKey?: string;
};

function hashRequest(req: Request): string {
  const payload = {
    method: req.method,
    path: req.originalUrl,
    body: req.body,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function idempotencyMiddleware(req: AugmentedRequest, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key || !req.tenantId) {
    return next();
  }

  req.idempotencyKey = key;
  const requestHash = hashRequest(req);

  IdempotencyKeyModel.findOne({ key, tenantId: req.tenantId })
    .then((existing) => {
      if (existing) {
        if (existing.requestHash !== requestHash) {
          res.status(409).json({ error: 'Idempotency key conflict' });
          return null;
        }
        res.status(existing.statusCode).json(existing.responseBody);
        return null;
      }

      const originalJson = res.json.bind(res);
      res.json = (body?: unknown) => {
        const statusCode = res.statusCode;
        const expiresAt = new Date(Date.now() + appConfig.idempotencyTtlSeconds * 1000);
        IdempotencyKeyModel.create({
          key,
          tenantId: req.tenantId,
          requestHash,
          responseBody: body,
          statusCode,
          expiresAt,
        }).catch((error) => {
          logger.error({ err: error, key }, 'Failed to persist idempotency record');
        });

        return originalJson(body);
      };

      return next();
    })
    .catch((error) => {
      logger.error({ err: error, key }, 'Idempotency middleware error');
      next(error);
    });
}
