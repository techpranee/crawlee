import { Router } from 'express';
import { TenantModel, type TenantDocument } from '../db/models/Tenant';
import { logger } from '../utils/logger';

const router = Router();

// GET current tenant settings
router.get('/', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Return settings without sensitive auth fields
    res.json({
      name: tenant.name,
      linkedinCookie: tenant.linkedinCookie ? '***SET***' : null,
      apolloCookie: tenant.apolloCookie ? '***SET***' : null,
      zoomCookie: tenant.zoomCookie ? '***SET***' : null,
      twentyCrmApiKey: tenant.twentyCrmApiKey ? '***SET***' : null,
      twentyCrmApiBaseUrl: tenant.twentyCrmApiBaseUrl || null,
    });
  } catch (error) {
    logger.error('Failed to fetch settings');
    next(error);
  }
});

// PATCH update tenant settings
router.patch('/', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { linkedinCookie, apolloCookie, zoomCookie, twentyCrmApiKey, twentyCrmApiBaseUrl } = req.body;

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const updateFields: Record<string, string | undefined> = {};
    
    if (linkedinCookie !== undefined) {
      updateFields.linkedinCookie = linkedinCookie || undefined;
    }
    if (apolloCookie !== undefined) {
      updateFields.apolloCookie = apolloCookie || undefined;
    }
    if (zoomCookie !== undefined) {
      updateFields.zoomCookie = zoomCookie || undefined;
    }
    if (twentyCrmApiKey !== undefined) {
      updateFields.twentyCrmApiKey = twentyCrmApiKey || undefined;
    }
    if (twentyCrmApiBaseUrl !== undefined) {
      updateFields.twentyCrmApiBaseUrl = twentyCrmApiBaseUrl || undefined;
    }

    const tenantDoc = await TenantModel.findOneAndUpdate(
      { _id: tenant._id },
      { $set: updateFields },
      { new: true }
    );

    if (!tenantDoc) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    logger.info('Updated tenant settings');

    res.json({
      name: tenantDoc.name,
      linkedinCookie: tenantDoc.linkedinCookie ? '***SET***' : null,
      apolloCookie: tenantDoc.apolloCookie ? '***SET***' : null,
      zoomCookie: tenantDoc.zoomCookie ? '***SET***' : null,
      twentyCrmApiKey: tenantDoc.twentyCrmApiKey ? '***SET***' : null,
      twentyCrmApiBaseUrl: tenantDoc.twentyCrmApiBaseUrl || null,
    });
  } catch (error) {
    logger.error('Failed to update settings');
    next(error);
  }
});

export function createSettingsRouter() {
  return router;
}
