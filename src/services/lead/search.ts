import { FilterQuery } from 'mongoose';

import { ContactModel, type ContactDocument } from '../../db/models/Contact';

interface ContactSearchFilters {
  titles?: string[];
  locations?: string[];
  industries?: string[];
  companyHeadcount?: string | string[];
  query?: string;
}

interface ContactSearchParams {
  tenantId: string;
  filters?: ContactSearchFilters;
  page?: number;
  size?: number;
}

export interface ContactSearchResult {
  leads: Array<{
    id: string;
    name: string | null;
    title: string | null;
    company: string | null;
    linkedin_url: string | null;
    email_status: string | null;
  }>;
  pagination: {
    page: number;
    size: number;
    hasNext: boolean;
  };
}

function buildFilter({ tenantId, filters }: { tenantId: string; filters?: ContactSearchFilters }): FilterQuery<ContactDocument> {
  const query: FilterQuery<ContactDocument> = { tenantId };
  if (!filters) {
    return query;
  }

  if (filters.titles && filters.titles.length > 0) {
    query.title = { $in: filters.titles.map((title) => new RegExp(title, 'i')) };
  }
  if (filters.locations && filters.locations.length > 0) {
    query.company = { $in: filters.locations.map((loc) => new RegExp(loc, 'i')) };
  }
  if (filters.industries && filters.industries.length > 0) {
    query.source = { $in: filters.industries.map((industry) => new RegExp(industry, 'i')) };
  }
  if (filters.query) {
    const regex = new RegExp(filters.query, 'i');
    query.$or = [{ full_name: regex }, { title: regex }, { company: regex }];
  }

  return query;
}

function mapLead(doc: Partial<ContactDocument> & { _id: unknown }) {
  return {
    id: String(doc._id),
    name: doc.full_name ?? null,
    title: doc.title ?? null,
    company: doc.company ?? null,
    linkedin_url: doc.linkedin_url ?? null,
    email_status: doc.email_status ?? null,
  };
}

export async function searchContacts({ tenantId, filters, page = 1, size = 25 }: ContactSearchParams): Promise<ContactSearchResult> {
  const perPage = Math.min(Math.max(size, 1), 100);
  const currentPage = Math.max(page, 1);
  const skip = (currentPage - 1) * perPage;

  const query = buildFilter({ tenantId, filters });

  const docs = await ContactModel.find(query)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(perPage + 1)
    .lean();

  const hasNext = docs.length > perPage;
  const items = hasNext ? docs.slice(0, perPage) : docs;

  return {
    leads: items.map((doc) => mapLead(doc as Partial<ContactDocument> & { _id: unknown })),
    pagination: {
      page: currentPage,
      size: perPage,
      hasNext,
    },
  };
}
