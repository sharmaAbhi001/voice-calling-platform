import type { Contact, EligibilityStatus } from '@voiceops/shared';
import type { Contact as ContactRow, Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';

export const toContact = (row: ContactRow): Contact => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  company: row.company,
  email: row.email,
  tags: row.tags,
  eligibilityStatus: row.eligibilityStatus as EligibilityStatus,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
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

const buildWhere = (filters: ContactFilters): Prisma.ContactWhereInput => {
  const where: Prisma.ContactWhereInput = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
    ];
  }
  if (filters.eligibilityStatus) where.eligibilityStatus = filters.eligibilityStatus;
  if (filters.tag) where.tags = { has: filters.tag };
  return where;
};

export const contactsRepository = {
  async list(filters: ContactFilters): Promise<{ items: Contact[]; total: number }> {
    const where = buildWhere(filters);
    const [rows, total] = await prisma.$transaction([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      prisma.contact.count({ where }),
    ]);
    return { items: rows.map(toContact), total };
  },

  async findById(id: string): Promise<Contact | null> {
    const row = await prisma.contact.findUnique({ where: { id } });
    return row ? toContact(row) : null;
  },

  async findByPhone(phone: string): Promise<Contact | null> {
    const row = await prisma.contact.findUnique({ where: { phone } });
    return row ? toContact(row) : null;
  },

  async create(input: ContactWrite): Promise<Contact> {
    return toContact(await prisma.contact.create({ data: input }));
  },

  /** Used by CSV import: last write wins on an existing phone number. */
  async upsertByPhone(input: ContactWrite): Promise<Contact> {
    const row = await prisma.contact.upsert({
      where: { phone: input.phone },
      create: input,
      // A blank column in the CSV must not wipe a value that is already there,
      // so company/email are only written when the import supplied them.
      update: {
        name: input.name,
        ...(input.company === null ? {} : { company: input.company }),
        ...(input.email === null ? {} : { email: input.email }),
        tags: input.tags,
        eligibilityStatus: input.eligibilityStatus,
      },
    });
    return toContact(row);
  },

  async update(id: string, input: Partial<ContactWrite>): Promise<Contact | null> {
    const data: Prisma.ContactUncheckedUpdateManyInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.company !== undefined) data.company = input.company;
    if (input.email !== undefined) data.email = input.email;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.eligibilityStatus !== undefined) data.eligibilityStatus = input.eligibilityStatus;
    if (Object.keys(data).length === 0) return this.findById(id);

    // updateMany rather than update so a missing row is null, not a thrown P2025.
    const { count } = await prisma.contact.updateMany({ where: { id }, data });
    return count > 0 ? this.findById(id) : null;
  },
};
