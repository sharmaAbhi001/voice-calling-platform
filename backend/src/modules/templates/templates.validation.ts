import { z } from 'zod';
import { AGENT_LANGUAGE, BACKGROUND_AUDIO, LLM_PROVIDER, VOICE_PROVIDER } from '@voiceops/shared';

const variableSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, digits and underscores, e.g. first_name'),
  label: z.string().trim().min(1).max(80),
  required: z.boolean().default(false),
  example: z.string().trim().max(120).optional(),
});

const baseTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  objective: z.string().trim().min(1, 'Objective is required').max(500),
  openingScript: z.string().trim().min(1, 'Opening script is required').max(2000),
  systemPrompt: z.string().trim().min(1, 'System prompt is required').max(6000),
  closingScript: z.string().trim().min(1, 'Closing script is required').max(2000),
  tone: z.string().trim().min(1).max(120).default('Professional and friendly'),
  language: z.enum(AGENT_LANGUAGE).default('EN'),
  voiceProvider: z.enum(VOICE_PROVIDER).default('OPENAI'),
  llmProvider: z.enum(LLM_PROVIDER).default('OPENAI'),
  // Null keeps the provider default rather than pinning a voice name.
  voiceName: z.string().trim().max(60).nullable().optional(),
  backgroundAudio: z.enum(BACKGROUND_AUDIO).default('NONE'),
  qualificationQuestions: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  variableSchema: z.array(variableSchema).max(20).default([]),
  knowledgeBaseId: z.string().uuid('Invalid knowledge base id').nullable().optional(),
});

export const createTemplateSchema = baseTemplateSchema;
export const updateTemplateSchema = baseTemplateSchema.partial();

export const templateIdSchema = z.object({ id: z.string().uuid('Invalid template id') });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
