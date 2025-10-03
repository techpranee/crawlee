import 'express-serve-static-core';
import type { TenantDocument } from '../db/models/Tenant';

declare module 'express-serve-static-core' {
  interface Request {
    tenantId?: string;
    tenant?: TenantDocument;
    idempotencyKey?: string;
  }
}
