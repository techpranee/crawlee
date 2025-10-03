import { Types } from 'mongoose';

import { CompanyModel } from '../../db/models/Company';
import { ContactModel } from '../../db/models/Contact';
import type { NormalizedLead, NormalizedLeadCompany, NormalizedLeadContact } from './normalizer';

interface UpsertLeadInput {
  tenantId: string;
  campaignId?: Types.ObjectId | string;
  company: NormalizedLeadCompany | null;
  contact: NormalizedLeadContact;
}

export interface UpsertLeadResult {
  companyId: string | null;
  contactId: string;
  dedupeKey: string;
  created: boolean;
  updated: boolean;
}

function toObjectId(value?: Types.ObjectId | string): Types.ObjectId | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

export async function upsertLead({ tenantId, campaignId, company, contact }: UpsertLeadInput): Promise<UpsertLeadResult> {
  const campaignObjectId = toObjectId(campaignId);
  let companyId: Types.ObjectId | undefined;

  if (company && (company.name || company.domain || company.linkedin_url)) {
    const companyFilter: Record<string, unknown> = { tenantId };
    if (campaignObjectId) {
      companyFilter.campaignId = campaignObjectId;
    }
    if (company.domain) {
      companyFilter.domain = company.domain;
    }
    if (company.name) {
      companyFilter.name = company.name;
    }
    if (!company.domain && !company.name && company.linkedin_url) {
      companyFilter.linkedin_url = company.linkedin_url;
    }

    const hasIdentifier = Boolean(companyFilter.domain || companyFilter.name || companyFilter.linkedin_url);

    if (hasIdentifier) {
      const result = await CompanyModel.findOneAndUpdate(
        companyFilter,
        {
          $set: {
            ...company,
            tenantId,
            campaignId: campaignObjectId ?? companyFilter.campaignId,
          },
        },
        {
          upsert: true,
          new: true,
          rawResult: true,
          collation: { locale: 'en', strength: 2 },
        },
      );

      const companyDoc = result?.value ?? null;
      if (companyDoc) {
        companyId = companyDoc._id as Types.ObjectId;
      }
    }
  }

  const contactFilter: Record<string, unknown> = { tenantId };
  if (campaignObjectId) {
    contactFilter.campaignId = campaignObjectId;
  }
  let dedupeKey = '';
  if (contact.linkedin_url) {
    contactFilter.linkedin_url = contact.linkedin_url;
    dedupeKey = `linkedin:${contact.linkedin_url.toLowerCase()}`;
  } else if (contact.full_name && companyId) {
    contactFilter.full_name = contact.full_name;
    contactFilter.companyId = companyId;
    dedupeKey = `name:${contact.full_name.toLowerCase()}|company:${companyId.toString()}`;
  } else if (contact.full_name) {
    contactFilter.full_name = contact.full_name;
    dedupeKey = `name:${contact.full_name.toLowerCase()}`;
  } else {
    throw new Error('Contact must include linkedin_url or full_name for deduplication');
  }

  const result = await ContactModel.findOneAndUpdate(
    contactFilter,
    {
      $set: {
        ...contact,
        tenantId,
        companyId,
        campaignId: campaignObjectId ?? contactFilter.campaignId,
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      rawResult: true,
      collation: { locale: 'en', strength: 2 },
    },
  );

  const contactDoc = result?.value;
  if (!contactDoc) {
    throw new Error('Failed to upsert contact');
  }

  const created = Boolean(result?.lastErrorObject?.upserted);
  const updated = !created;

  return {
    companyId: contactDoc.companyId ? String(contactDoc.companyId) : companyId ? companyId.toString() : null,
    contactId: String(contactDoc._id),
    dedupeKey,
    created,
    updated,
  };
}

export type { NormalizedLead, NormalizedLeadCompany, NormalizedLeadContact, UpsertLeadInput };
