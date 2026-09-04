import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

const schema = z.object({
  LIVEKIT_URL: z.string().min(1, 'LIVEKIT_URL is required'),
  LIVEKIT_API_KEY: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  LIVEKIT_API_SECRET: z.string().min(1, 'LIVEKIT_API_SECRET is required'),

  BACKEND_URL: z.string().default('http://localhost:4000'),
  AGENT_API_KEY: z.string().min(8, 'AGENT_API_KEY is required'),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_LLM_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  OPENAI_TTS_VOICE: z.string().default('alloy'),

  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_STT_MODEL: z.string().default('nova-3'),
  DEEPGRAM_TTS_MODEL: z.string().default('aura-2-asteria-en'),

  SARVAM_API_KEY: z.string().optional(),
  SARVAM_TTS_SPEAKER: z.string().default('ritu'),
  SARVAM_BASE_URL: z.string().default('https://api.sarvam.ai/v1'),
  SARVAM_LLM_MODEL: z.string().default('sarvam-105b-conversations'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid agent environment:\n${issues.join('\n')}`);
}

export const env = parsed.data;

/** Deepgram is preferred for streaming STT; OpenAI is the fallback when absent. */
export const useDeepgram = Boolean(env.DEEPGRAM_API_KEY);

/**
 * A template can ask for Sarvam, but only if a key is configured. Without one the
 * pipeline falls back rather than failing the call - a template edited by someone
 * who does not manage the keys should not take calls down.
 */
export const useSarvam = Boolean(env.SARVAM_API_KEY);

