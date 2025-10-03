import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

import { Types } from 'mongoose';
// @ts-expect-error json2csv does not ship TypeScript definitions
import { Transform as CsvTransform } from 'json2csv';
// @ts-expect-error parquetjs-lite does not ship TypeScript definitions
import { ParquetSchema, ParquetWriter } from 'parquetjs-lite';
import type { Response } from 'express';

import { ContactModel } from '../../db/models/Contact';

const DEFAULT_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'title',
  'company',
  'email',
  'email_status',
  'phone',
  'linkedin_url',
  'source',
  'campaign_id',
  'created_at',
];

interface ExportFilter {
  [key: string]: string;
}

interface ExportOptions {
  tenantId: string;
  campaignId: Types.ObjectId;
  fields?: string[];
  filter?: ExportFilter;
}

function buildFilter({ tenantId, campaignId, filter }: ExportOptions) {
  const query: Record<string, unknown> = { tenantId, campaignId };
  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      query[key] = value;
    }
  }
  return query;
}

function mapDocument(doc: Record<string, unknown>, fields: string[]) {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field) {
      case 'campaign_id':
        output[field] = doc.campaignId ? String(doc.campaignId) : '';
        break;
      case 'created_at':
        output[field] = doc.createdAt ? new Date(doc.createdAt as string | number | Date).toISOString() : '';
        break;
      default:
        output[field] = doc[field] ?? '';
    }
  }
  return output;
}

export async function streamContactsAsCsv(res: Response, options: ExportOptions): Promise<void> {
  let fields = (options.fields && options.fields.length > 0 ? options.fields : DEFAULT_FIELDS).filter((field) =>
    DEFAULT_FIELDS.includes(field),
  );
  if (fields.length === 0) {
    fields = DEFAULT_FIELDS;
  }
  const query = buildFilter(options);
  const cursor = ContactModel.find(query).sort({ createdAt: 1 }).lean().cursor();

  const mapper = new Transform({
    objectMode: true,
    transform(chunk, _encoding, callback) {
      try {
        const mapped = mapDocument(chunk as Record<string, unknown>, fields);
        callback(null, mapped);
      } catch (error) {
        callback(error as Error);
      }
    },
  });

  const csv = new CsvTransform({ fields, withBOM: true });
  await pipeline(cursor, mapper, csv, res);
}

const parquetSchema = new ParquetSchema({
  full_name: { type: 'UTF8', optional: true },
  first_name: { type: 'UTF8', optional: true },
  last_name: { type: 'UTF8', optional: true },
  title: { type: 'UTF8', optional: true },
  company: { type: 'UTF8', optional: true },
  email: { type: 'UTF8', optional: true },
  email_status: { type: 'UTF8', optional: true },
  phone: { type: 'UTF8', optional: true },
  linkedin_url: { type: 'UTF8', optional: true },
  source: { type: 'UTF8', optional: true },
  campaign_id: { type: 'UTF8', optional: true },
  created_at: { type: 'UTF8', optional: true },
});

export async function streamContactsAsParquet(res: Response, options: ExportOptions): Promise<void> {
  let fields = (options.fields && options.fields.length > 0 ? options.fields : DEFAULT_FIELDS).filter((field) =>
    DEFAULT_FIELDS.includes(field),
  );
  if (fields.length === 0) {
    fields = DEFAULT_FIELDS;
  }
  const query = buildFilter(options);
  const cursor = ContactModel.find(query).sort({ createdAt: 1 }).lean().cursor();

  const writer = await ParquetWriter.openStream(parquetSchema, res);
  for await (const doc of cursor) {
    const mapped = mapDocument(doc as Record<string, unknown>, fields);
    await writer.appendRow(mapped);
  }
  await writer.close();
}

export { DEFAULT_FIELDS };
