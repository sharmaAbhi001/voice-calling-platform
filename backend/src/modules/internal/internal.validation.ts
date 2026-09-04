import { z } from 'zod';
import { CALL_OUTCOME, KB_CATEGORY } from '@voiceops/shared';

export const callIdParamSchema = z.object({ id: z.string().uuid('Invalid call id') });

export const retrieveSchema = z.object({
  knowledgeBaseId: z.string().uuid('Invalid knowledge base id'),
  query: z.string().trim().min(1).max(500),
  stepBackQuery: z.string().trim().max(500).optional(),
  categories: z.array(z.enum(KB_CATEGORY)).max(4).optional(),
  topK: z.number().int().min(1).max(10).optional(),
});

export const transcriptTurnSchema = z.object({
  speaker: z.enum(['AGENT', 'CUSTOMER']),
  text: z.string().max(5000),
  at: z.string(),
});

export const callResultSchema = z.object({
  transcript: z.array(transcriptTurnSchema).max(500).default([]),
  /** The agent's own read of the outcome; the backend still verifies it. */
  outcomeHint: z.enum(CALL_OUTCOME).optional(),
  capturedRequirement: z.string().trim().max(2000).optional().nullable(),
  agentError: z.string().max(1000).optional().nullable(),
});

export const callEventSchema = z.object({
  type: z.enum(['AGENT_STARTED', 'AGENT_ENDED', 'AGENT_ERROR']),
  detail: z.string().max(500).optional(),
});

export type RetrieveInput = z.infer<typeof retrieveSchema>;
export type CallResultInput = z.infer<typeof callResultSchema>;
export type CallEventInput = z.infer<typeof callEventSchema>;
