import { z } from 'zod';
import { ELIGIBILITY_STATUS } from '@voiceops/shared';

const eligibility = z.enum(ELIGIBILITY_STATUS);

export const createContactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(6, 'Phone number is required'),
  company: z.string().trim().max(120).optional().nullable(),
  email: z.string().email('Enter a valid email address').optional().nullable(),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  // Defaults to PENDING: a freshly added number is not consented to yet.
  eligibilityStatus: eligibility.default('PENDING'),
});

export const updateContactSchema = createContactSchema.partial();

export const listContactsSchema = z.object({
  search: z.string().trim().max(120).optional(),
  eligibilityStatus: eligibility.optional(),
  tag: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const contactIdSchema = z.object({ id: z.string().uuid('Invalid contact id') });

export const importContactsSchema = z.object({
  /** Raw CSV text with a header row: name,phone,company,email,tags,eligibilityStatus */
  csv: z.string().min(1, 'CSV content is required'),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsSchema>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
