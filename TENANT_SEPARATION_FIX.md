# Tenant Separation & Twenty CRM UI Fixes

## Issues Fixed

### 1. Tenant Separation Issue in LinkedIn Routes
**Problem**: The `linkedin.ts` route file was directly accessing `res.locals.tenant as TenantDocument` without a proper helper function, which could lead to inconsistent tenant context handling and potential data leakage between tenants.

**Solution**:
- Added `getTenant()` and `getTenantOrThrow()` helper functions to `src/routes/linkedin.ts` (similar to the pattern used in `campaigns.ts`)
- Replaced all 18+ instances of direct `res.locals.tenant` access with the safer `getTenantOrThrow(req)` helper
- This ensures consistent tenant validation and better error handling across all LinkedIn routes

**Files Changed**:
- `src/routes/linkedin.ts`

**Key Changes**:
```typescript
// Added helper functions
type TenantAwareRequest = Request & { tenantId?: string; tenant?: TenantDocument };

function getTenant(req: Request): TenantDocument | undefined {
  return (req as TenantAwareRequest).tenant;
}

function getTenantOrThrow(req: Request): TenantDocument {
  const tenant = getTenant(req);
  if (!tenant) {
    throw new Error('Tenant not found in request context');
  }
  return tenant;
}

// Updated all route handlers to use:
const tenant = getTenantOrThrow(req);
// instead of:
// const tenant = res.locals.tenant as TenantDocument;
```

### 2. Missing Twenty CRM Configuration UI
**Problem**: There was no user interface to configure Twenty CRM API credentials (API key and base URL) even though the backend had partial support for `twentyCrmApiKey`.

**Solution**:
1. **Backend Schema Update** (`src/db/models/Tenant.ts`):
   - Added `twentyCrmApiBaseUrl` field to Tenant schema (complementing existing `twentyCrmApiKey`)
   
2. **Backend API Update** (`src/routes/settings.ts`):
   - Updated GET `/api/settings` to return `twentyCrmApiKey` (masked as `***SET***`) and `twentyCrmApiBaseUrl`
   - Updated PATCH `/api/settings` to accept and save both Twenty CRM fields
   
3. **Frontend UI Update** (`insight-scrape-flow/src/pages/Settings.tsx`):
   - Added new "Twenty CRM Configuration" card section
   - Added input field for Twenty CRM API Key (password type for security)
   - Added input field for Twenty CRM API Base URL
   - Updated settings state interface and form submission logic
   - Updated save button to be disabled when no changes are made

**Files Changed**:
- `src/db/models/Tenant.ts`
- `src/routes/settings.ts`
- `insight-scrape-flow/src/pages/Settings.tsx`

## Testing Recommendations

### 1. Test Tenant Separation
To verify tenant isolation is working correctly:

```bash
# Create two test tenants with different API keys
# Tenant 1
curl -X POST http://localhost:3011/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tenant 1",
    "apiKey": "tenant1-key",
    "basicAuthUser": "tenant1",
    "basicAuthPass": "pass1"
  }'

# Tenant 2
curl -X POST http://localhost:3011/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tenant 2",
    "apiKey": "tenant2-key",
    "basicAuthUser": "tenant2",
    "basicAuthPass": "pass2"
  }'

# Create campaigns for each tenant and verify data isolation
# Using Tenant 1 credentials
curl -X GET http://localhost:3011/api/linkedin/campaigns \
  -H "Authorization: Basic $(echo -n 'tenant1:pass1' | base64)" \
  -H "X-Api-Key: tenant1-key"

# Using Tenant 2 credentials
curl -X GET http://localhost:3011/api/linkedin/campaigns \
  -H "Authorization: Basic $(echo -n 'tenant2:pass2' | base64)" \
  -H "X-Api-Key: tenant2-key"

# Should return different campaign lists for each tenant
```

### 2. Test Twenty CRM Configuration
1. Navigate to Settings page in the UI
2. Scroll to "Twenty CRM Configuration" section
3. Enter API Key and Base URL
4. Click "Save Tokens"
5. Refresh page and verify fields show "✓ Currently set"
6. Check that the API key is masked in the UI for security

## Benefits

1. **Improved Security**: Tenant helper functions provide consistent validation and error handling
2. **Better Maintainability**: Centralized tenant access logic reduces code duplication
3. **Complete Feature**: Twenty CRM integration now has full UI support for configuration
4. **User Experience**: Users can now easily configure Twenty CRM without manual database updates

## Database Schema Changes

The Tenant collection now includes:
```typescript
{
  name: string;
  apiKey: string;
  basicAuthUser: string;
  basicAuthPass: string;
  apolloCookie?: string;
  zoomCookie?: string;
  linkedinCookie?: string;
  twentyCrmApiKey?: string;      // Already existed
  twentyCrmApiBaseUrl?: string;  // NEW FIELD
  createdAt: Date;
  updatedAt: Date;
}
```

## Migration Notes

No migration script needed - the new `twentyCrmApiBaseUrl` field is optional and will default to `undefined` for existing tenant documents.

## Related Files

- `src/middleware/tenant.ts` - Tenant middleware (unchanged but works with improved routes)
- `src/services/twentyCrm.ts` - Twenty CRM service that uses these credentials
- All database models with `tenantId` field - Properly indexed for tenant isolation
