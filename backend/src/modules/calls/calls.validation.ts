import { z } from 'zod';
import { CALL_OUTCOME, CALL_STATUS } from '@voiceops/shared';

export const createCallSchema = z
  .object({
    phone: z.string().trim().min(6).optional(),
    contactId: z.string().uuid('Invalid contact id').optional(),
    templateId: z.string().uuid('Select a call template'),
    variables: z.record(z.string()).default({}),
  })
  .refine((value) => Boolean(value.phone || value.contactId), {
    message: 'Provide either a phone number or a contact',
    path: ['phone'],
  });

export const listCallsSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(CALL_STATUS).optional(),
  outcome: z.enum(CALL_OUTCOME).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const callIdSchema = z.object({ id: z.string().uuid('Invalid call id') });

export type CreateCallInput = z.infer<typeof createCallSchema>;
export type ListCallsQuery = z.infer<typeof listCallsSchema>;
