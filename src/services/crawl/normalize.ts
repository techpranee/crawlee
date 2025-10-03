import type { Types } from 'mongoose';

import type { CampaignDocument } from '../../db/models/Campaign';
import type { RawExtraction } from './extractors';

export interface CompanyUpsert {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
}

export interface ContactUpsert {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: 'valid' | 'invalid' | 'unknown';
  phone?: string | null;
  linkedin_url?: string | null;
  source: string;
  company?: string | null;
}

export interface NormalizedRecord {
  company: CompanyUpsert | null;
  contact: ContactUpsert;
}

function sanitize(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function deriveNames(fullName: string | null): { first: string | null; last: string | null } {
  if (!fullName) {
    return { first: null, last: null };
  }
  const segments = fullName.split(/\s+/);
  if (segments.length === 1) {
    return { first: segments[0], last: null };
  }
  return {
    first: segments[0],
    last: segments.slice(1).join(' '),
  };
}

const contactFieldAliases: Record<keyof ContactUpsert, string[]> = {
  full_name: ['full_name', 'fullName', 'name'],
  first_name: ['first_name', 'firstName', 'given_name'],
  last_name: ['last_name', 'lastName', 'surname'],
  title: ['title', 'job_title', 'jobTitle', 'role'],
  email: ['email', 'email_address', 'emailAddress'],
  email_status: ['email_status', 'emailStatus'],
  phone: ['phone', 'phone_number', 'phoneNumber'],
  linkedin_url: ['linkedin_url', 'linkedinUrl', 'linkedin'],
  source: ['source'],
  company: ['company', 'company_name', 'companyName'],
};

const companyFieldAliases: Record<keyof CompanyUpsert, string[]> = {
  name: ['name', 'company', 'company_name', 'companyName'],
  domain: ['domain', 'company_domain', 'companyDomain'],
  website: ['website', 'url', 'company_url', 'companyUrl'],
  industry: ['industry'],
  size: ['size', 'company_size', 'companySize'],
  location: ['location', 'company_location', 'companyLocation'],
  linkedin_url: ['linkedin_url', 'company_linkedin', 'companyLinkedin'],
};

function pickByAliases<T extends Record<string, unknown>>(
  data: Record<string, unknown>,
  aliases: Record<string, string[]>,
): T {
  const result: Record<string, unknown> = {};
  for (const [field, keys] of Object.entries(aliases)) {
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null) {
        result[field] = data[key];
        break;
      }
    }
  }
  return result as T;
}

export function normalizeExtraction(
  campaign: CampaignDocument & { _id: Types.ObjectId },
  extraction: RawExtraction,
): NormalizedRecord | null {
  const mappedContact = pickByAliases<Partial<ContactUpsert>>(extraction.data, contactFieldAliases);
  const mappedCompany = pickByAliases<Partial<CompanyUpsert>>(extraction.data, companyFieldAliases);

  const fullName = sanitize(mappedContact.full_name ?? null);
  const companyName = sanitize(mappedContact.company ?? mappedCompany.name ?? null);

  let firstName = sanitize(mappedContact.first_name ?? null);
  let lastName = sanitize(mappedContact.last_name ?? null);

  if (!firstName && !lastName && fullName) {
    const derived = deriveNames(fullName);
    firstName = sanitize(derived.first);
    lastName = sanitize(derived.last);
  }

  const linkedinUrl = sanitize(mappedContact.linkedin_url ?? null);
  if (!fullName && !linkedinUrl) {
    return null;
  }

  const contact: ContactUpsert = {
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    title: sanitize(mappedContact.title ?? null),
    email: sanitize(mappedContact.email ?? null),
    email_status: (mappedContact.email_status as ContactUpsert['email_status']) ?? 'unknown',
    phone: sanitize(mappedContact.phone ?? null),
    linkedin_url: linkedinUrl,
    source: campaign.source,
    company: companyName,
  };

  const company: CompanyUpsert | null = companyName
    ? {
        name: companyName,
        domain: sanitize((mappedCompany.domain as string | null) ?? null),
        website:
          sanitize((mappedCompany.website as string | null) ?? null) ??
          sanitize(extraction.metadata.canonicalUrl ?? null),
        industry: sanitize((mappedCompany.industry as string | null) ?? null),
        size: sanitize((mappedCompany.size as string | null) ?? null),
        location: sanitize((mappedCompany.location as string | null) ?? null),
        linkedin_url: sanitize((mappedCompany.linkedin_url as string | null) ?? null),
      }
    : null;

  return {
    company,
    contact,
  };
}
