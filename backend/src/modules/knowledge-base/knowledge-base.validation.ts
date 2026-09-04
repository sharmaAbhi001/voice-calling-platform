import { z } from 'zod';
import { DOCUMENT_STATUS, KB_CATEGORY } from '@voiceops/shared';

export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

export const updateKnowledgeBaseSchema = createKnowledgeBaseSchema.partial();

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  category: z.enum(KB_CATEGORY).default('OTHER'),
  content: z
    .string()
    .trim()
    .min(20, 'A document needs at least 20 characters to be useful to the agent')
    .max(100_000),
  status: z.enum(DOCUMENT_STATUS).default('PUBLISHED'),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const kbIdSchema = z.object({ id: z.string().uuid('Invalid knowledge base id') });

export const kbDocumentIdSchema = z.object({
  id: z.string().uuid('Invalid knowledge base id'),
  documentId: z.string().uuid('Invalid document id'),
});

export const listDocumentsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.enum(KB_CATEGORY).optional(),
  status: z.enum(DOCUMENT_STATUS).optional(),
});

/** Retrieval probe used by the admin UI to preview what the agent would find. */
export const searchSchema = z.object({
  query: z.string().trim().min(2, 'Enter a question to search for').max(500),
  topK: z.coerce.number().int().min(1).max(10).optional(),
});

export type CreateKnowledgeBaseInput = z.infer<typeof createKnowledgeBaseSchema>;
export type UpdateKnowledgeBaseInput = z.infer<typeof updateKnowledgeBaseSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
