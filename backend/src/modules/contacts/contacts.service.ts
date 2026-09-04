import type { Contact, EligibilityStatus, Paginated } from '@voiceops/shared';
import { ELIGIBILITY_STATUS } from '@voiceops/shared';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { toE164 } from '../../utils/phone.js';
import { contactsRepository } from './contacts.repository.js';
import type {
  CreateContactInput,
  ListContactsQuery,
  UpdateContactInput,
} from './contacts.validation.js';

const parseTags = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(/[;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const parseEligibility = (raw: string | undefined): EligibilityStatus => {
  const value = (raw ?? '').trim().toUpperCase();
  return (ELIGIBILITY_STATUS as readonly string[]).includes(value)
    ? (value as EligibilityStatus)
    : 'PENDING';
};

/** Minimal CSV reader: handles quoted fields and embedded commas, no external dep. */
const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
};

export const contactsService = {
  async list(filters: ListContactsQuery): Promise<Paginated<Contact>> {
    const { items, total } = await contactsRepository.list({
      search: filters.search,
      eligibilityStatus: filters.eligibilityStatus,
      tag: filters.tag,
      limit: filters.pageSize,
      offset: (filters.page - 1) * filters.pageSize,
    });
    return { data: items, page: filters.page, pageSize: filters.pageSize, total };
  },

  async getById(id: string): Promise<Contact> {
    const contact = await contactsRepository.findById(id);
    if (!contact) throw notFound('Contact');
    return contact;
  },

  async create(input: CreateContactInput): Promise<Contact> {
    const phone = toE164(input.phone);
    const existing = await contactsRepository.findByPhone(phone);
    if (existing) throw conflict('A contact with this phone number already exists');

    return contactsRepository.create({
      name: input.name,
      phone,
      company: input.company ?? null,
      email: input.email ?? null,
      tags: input.tags,
      eligibilityStatus: input.eligibilityStatus,
    });
  },

  async update(id: string, input: UpdateContactInput): Promise<Contact> {
    await this.getById(id);
    const phone = input.phone ? toE164(input.phone) : undefined;
    if (phone) {
      const clash = await contactsRepository.findByPhone(phone);
      if (clash && clash.id !== id) {
        throw conflict('Another contact already uses this phone number');
      }
    }

    const updated = await contactsRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(input.company !== undefined ? { company: input.company ?? null } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.eligibilityStatus !== undefined
        ? { eligibilityStatus: input.eligibilityStatus }
        : {}),
    });
    if (!updated) throw notFound('Contact');
    return updated;
  },

  /**
   * CSV import. Every row is validated on its own so one bad line does not
   * discard the file; the caller gets a per-row error report.
   */
  async importCsv(csv: string): Promise<{
    imported: number;
    failed: Array<{ row: number; reason: string }>;
  }> {
    const rows = parseCsv(csv);
    if (rows.length < 2) throw badRequest('CSV must contain a header row and at least one contact');

    const header = (rows[0] as string[]).map((cell) => cell.trim().toLowerCase());
    const columnIndex = (name: string) => header.indexOf(name);
    const nameIdx = columnIndex('name');
    const phoneIdx = columnIndex('phone');
    if (nameIdx === -1 || phoneIdx === -1) {
      throw badRequest('CSV header must include at least "name" and "phone" columns');
    }

    const failed: Array<{ row: number; reason: string }> = [];
    let imported = 0;

    for (let i = 1; i < rows.length; i += 1) {
      const cells = rows[i] as string[];
      const cell = (index: number) => (index >= 0 ? cells[index]?.trim() : undefined);
      try {
        const name = cell(nameIdx);
        const rawPhone = cell(phoneIdx);
        if (!name) throw new Error('Missing name');
        if (!rawPhone) throw new Error('Missing phone');

        await contactsRepository.upsertByPhone({
          name,
          phone: toE164(rawPhone),
          company: cell(columnIndex('company')) ?? null,
          email: cell(columnIndex('email')) ?? null,
          tags: parseTags(cell(columnIndex('tags'))),
          eligibilityStatus: parseEligibility(cell(columnIndex('eligibilitystatus'))),
        });
        imported += 1;
      } catch (error) {
        failed.push({ row: i + 1, reason: (error as Error).message });
      }
    }

    return { imported, failed };
  },
};
