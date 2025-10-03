import { NextFunction, Request, Response } from 'express';

import { Schema, Types } from 'mongoose';

import { appConfig } from '../config/env';
import { TenantModel, type TenantDocument } from '../db/models/Tenant';

function decodeBasicCredentials(header: string): { username: string; password: string } | null {
  const token = header.split(' ')[1];
  if (!token) {
    return null;
  }
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
    if (!username || password === undefined) {
      return null;
    }
    return { username, password };
  } catch (error) {
    return null;
  }
}

function createObjectId(value?: string): Schema.Types.ObjectId {
  if (value && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value) as unknown as Schema.Types.ObjectId;
  }
  return new Types.ObjectId('000000000000000000000000') as unknown as Schema.Types.ObjectId;
}

const fallbackTenant = {
  _id: createObjectId(process.env.DISABLE_AUTH_TENANT_ID),
  name: process.env.DISABLE_AUTH_TENANT_NAME ?? 'Development Tenant',
  apiKey: process.env.DISABLE_AUTH_TENANT_KEY ?? 'development-token',
  basicAuthUser: process.env.BASIC_AUTH_USER ?? 'dev-user',
  basicAuthPass: process.env.BASIC_AUTH_PASS ?? 'dev-pass',
  apolloCookie: process.env.APOLLO_COOKIE,
  zoomCookie: process.env.ZOOM_COOKIE,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as TenantDocument;

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin ?? '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.header('Access-Control-Request-Headers') ?? 'Content-Type, Authorization, X-Api-Key',
    );
    res.sendStatus(204);
    return;
  }

  if (appConfig.authDisabled) {
    try {
      const tenantDoc = (await TenantModel.findOne().exec()) as TenantDocument | null;
      const tenant = tenantDoc ?? fallbackTenant;
      const augmentedReq = req as Request & { tenantId?: string; tenant?: TenantDocument };
      augmentedReq.tenantId = tenant._id.toString();
      augmentedReq.tenant = tenant;
      res.locals.tenant = tenant;
      const origin = req.headers.origin ?? '*';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const apiKey = req.header('x-api-key') ?? req.header('X-Api-Key');

  if (!apiKey) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Crawlee"');
    return res.status(401).json({ error: 'Missing API key' });
  }

  try {
    const tenantDoc = (await TenantModel.findOne({ apiKey })) as TenantDocument | null;
    if (!tenantDoc) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Crawlee"');
      return res.status(403).json({ error: 'Invalid API key' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Crawlee"');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const credentials = decodeBasicCredentials(authHeader);
    if (
      !credentials ||
      credentials.username !== tenantDoc.basicAuthUser ||
      credentials.password !== tenantDoc.basicAuthPass
    ) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Crawlee"');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const augmentedReq = req as Request & { tenantId?: string; tenant?: TenantDocument };
    augmentedReq.tenantId = tenantDoc._id.toString();
    augmentedReq.tenant = tenantDoc;
    res.locals.tenant = tenantDoc;
    const origin = req.headers.origin ?? '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return next();
  } catch (error) {
    return next(error);
  }
}
