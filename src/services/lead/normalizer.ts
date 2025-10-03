interface NormalizedLeadCompany {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  [key: string]: unknown;
}

interface NormalizedLeadContact {
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
  [key: string]: unknown;
}

export interface NormalizedLead {
  company: NormalizedLeadCompany | null;
  contact: NormalizedLeadContact;
}

const contactFieldAliases: Record<keyof Omit<NormalizedLeadContact, 'source'>, string[]> = {
  full_name: ['full_name', 'fullName', 'name'],
  first_name: ['first_name', 'firstName', 'given_name'],
  last_name: ['last_name', 'lastName', 'surname'],
  title: ['title', 'job_title', 'jobTitle', 'role'],
  email: ['email', 'email_address', 'emailAddress'],
  email_status: ['email_status', 'emailStatus'],
  phone: ['phone', 'phone_number', 'phoneNumber'],
  linkedin_url: ['linkedin_url', 'linkedinUrl', 'linkedin'],
  company: ['company', 'company_name', 'companyName'],
};

const companyFieldAliases: Record<keyof NormalizedLeadCompany, string[]> = {
  name: ['company', 'company_name', 'name'],
  domain: ['domain', 'company_domain', 'websiteDomain'],
  website: ['website', 'company_website', 'url'],
  industry: ['industry'],
  size: ['size', 'company_size'],
  location: ['location', 'company_location', 'hqLocation'],
  linkedin_url: ['company_linkedin', 'linkedin_url', 'linkedinCompany'],
};

function sanitize(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function pick<T extends Record<string, unknown>>(
  raw: Record<string, unknown>,
  aliases: Record<string, string[]>,
): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [field, keys] of Object.entries(aliases)) {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null) {
        output[field] = raw[key];
        break;
      }
    }
  }
  return output as Partial<T>;
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

export function normalizeLead(
  sourceName: string,
  raw: Record<string, unknown>,
): NormalizedLead | null {
  const mappedContact = pick<NormalizedLeadContact>(raw, contactFieldAliases);
  const mappedCompany = pick<NormalizedLeadCompany>(raw, companyFieldAliases);

  const fullName = sanitize(mappedContact.full_name ?? null);
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

  const companyName = sanitize(mappedContact.company ?? mappedCompany.name ?? null);

  const contact: NormalizedLeadContact = {
    source: sourceName,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    title: sanitize(mappedContact.title ?? null),
    email: sanitize(mappedContact.email ?? null),
    email_status: (mappedContact.email_status as NormalizedLeadContact['email_status']) ?? 'unknown',
    phone: sanitize(mappedContact.phone ?? null),
    linkedin_url: linkedinUrl,
    company: companyName,
  };

  const company: NormalizedLeadCompany | null = companyName
    ? {
        name: companyName,
        domain: sanitize(mappedCompany.domain ?? null),
        website: sanitize(mappedCompany.website ?? null),
        industry: sanitize(mappedCompany.industry ?? null),
        size: sanitize(mappedCompany.size ?? null),
        location: sanitize(mappedCompany.location ?? null),
        linkedin_url: sanitize(mappedCompany.linkedin_url ?? null),
      }
    : null;

  return { company, contact };
}

export type { NormalizedLeadCompany, NormalizedLeadContact };
