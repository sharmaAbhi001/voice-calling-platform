import type { Contact, EligibilityStatus } from '@voiceops/shared';
import { query } from '../../database/client.js';

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  email: string | null;
  tags: string[];
  eligibility_status: EligibilityStatus;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS =
  'id, name, phone, company, email, tags, eligibility_status, created_at, updated_at';

export const toContact = (row: ContactRow): Contact => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  company: row.company,
  email: row.email,
  tags: row.tags,
  eligibilityStatus: row.eligibility_status,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export interface ContactFilters {
  search?: string;
  eligibilityStatus?: EligibilityStatus;
  tag?: string;
  limit: number;
  offset: number;
}

export interface ContactWrite {
  name: string;
  phone: string;
  company: string | null;
  email: string | null;
  tags: string[];
  eligibilityStatus: EligibilityStatus;
}

export const contactsRepository = {
  async list(filters: ContactFilters): Promise<{ items: Contact[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`(lower(name) LIKE $${params.length} OR phone LIKE $${params.length})`);
    }
    if (filters.eligibilityStatus) {
      params.push(filters.eligibilityStatus);
      conditions.push(`eligibility_status = $${params.length}`);
    }
    if (filters.tag) {
      params.push(filters.tag);
      conditions.push(`$${params.length} = ANY (tags)`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalResult = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM contacts ${where}`,
      params,
    );

    params.push(filters.limit, filters.offset);
    const { rows } = await query<ContactRow>(
      `SELECT ${COLUMNS} FROM contacts ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { items: rows.map(toContact), total: totalResult.rows[0]?.count ?? 0 };
  },

  async findById(id: string): Promise<Contact | null> {
    const { rows } = await query<ContactRow>(
      `SELECT ${COLUMNS} FROM contacts WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? toContact(rows[0]) : null;
  },

  async findByPhone(phone: string): Promise<Contact | null> {
    const { rows } = await query<ContactRow>(
      `SELECT ${COLUMNS} FROM contacts WHERE phone = $1 LIMIT 1`,
      [phone],
    );
    return rows[0] ? toContact(rows[0]) : null;
  },

  async create(input: ContactWrite): Promise<Contact> {
    const { rows } = await query<ContactRow>(
      `INSERT INTO contacts (name, phone, company, email, tags, eligibility_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.phone,
        input.company,
        input.email,
        input.tags,
        input.eligibilityStatus,
      ],
    );
    return toContact(rows[0] as ContactRow);
  },

  /** Used by CSV import: last write wins on an existing phone number. */
  async upsertByPhone(input: ContactWrite): Promise<Contact> {
    const { rows } = await query<ContactRow>(
      `INSERT INTO contacts (name, phone, company, email, tags, eligibility_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name,
         company = COALESCE(EXCLUDED.company, contacts.company),
         email = COALESCE(EXCLUDED.email, contacts.email),
         tags = EXCLUDED.tags,
         eligibility_status = EXCLUDED.eligibility_status
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.phone,
        input.company,
        input.email,
        input.tags,
        input.eligibilityStatus,
      ],
    );
    return toContact(rows[0] as ContactRow);
  },

  async update(id: string, input: Partial<ContactWrite>): Promise<Contact | null> {
    const columnByField: Record<keyof ContactWrite, string> = {
      name: 'name',
      phone: 'phone',
      company: 'company',
      email: 'email',
      tags: 'tags',
      eligibilityStatus: 'eligibility_status',
    };

    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(columnByField) as Array<
      [keyof ContactWrite, string]
    >) {
      const value = input[field];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (assignments.length === 0) return this.findById(id);

    params.push(id);
    const { rows } = await query<ContactRow>(
      `UPDATE contacts SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0] ? toContact(rows[0]) : null;
  },
};
