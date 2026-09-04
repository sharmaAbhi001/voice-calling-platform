import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// One .env at the repo root is shared by backend and agent.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  BACKEND_URL: z.string().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  AGENT_API_KEY: z.string().min(8, 'AGENT_API_KEY must be at least 8 characters'),

  // Which PSTN carrier terminates the SIP leg. Dialling always goes through
  // LiveKit, so this only selects webhook verification and carrier lookups.
  SIP_CARRIER: z.enum(['twilio', 'exotel', 'plivo', 'telnyx', 'none']).default('none'),
  // Caller ID presented to the customer. Informational here: the number that is
  // actually used is the one on the LiveKit trunk.
  SIP_CALLER_ID: z.string().optional(),

  // Twilio only. Webhook signatures are computed with the account Auth Token,
  // so an API key SID/secret pair will not work here.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),

  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_SIP_TRUNK_ID: z.string().optional(),

  // Email (Resend). Without a key the forgot-password flow still works but logs
  // the reset link instead of mailing it - development only.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('VoiceOps <onboarding@resend.dev>'),
  PASSWORD_RESET_URL: z.string().optional(),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_LLM_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  ALLOWED_DESTINATION_PREFIXES: z.string().default('+91'),
  DESTINATION_ALLOWLIST: z.string().optional(),
  MAX_CALLS_PER_DAY: z.coerce.number().default(50),
  MAX_CONCURRENT_CALLS: z.coerce.number().default(3),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./data/recordings'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

const firstOrigin = raw.FRONTEND_ORIGIN.split(',')[0]?.trim() ?? 'http://localhost:5173';

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  allowedDestinationPrefixes: csv(raw.ALLOWED_DESTINATION_PREFIXES),
  destinationAllowlist: csv(raw.DESTINATION_ALLOWLIST),
  // Where the emailed reset link points. Defaults to the primary frontend origin
  // so a standard deployment needs no extra configuration.
  passwordResetUrl:
    raw.PASSWORD_RESET_URL?.trim() || `${firstOrigin.replace(/\/$/, '')}/reset-password`,
};

/** Feature gates so the app boots (and the UI explains itself) without providers. */
export const capabilities = {
  livekit: Boolean(raw.LIVEKIT_URL && raw.LIVEKIT_API_KEY && raw.LIVEKIT_API_SECRET),
  sip: Boolean(raw.LIVEKIT_SIP_TRUNK_ID),
  carrier: raw.SIP_CARRIER,
  embeddings: Boolean(raw.OPENAI_API_KEY),
  email: Boolean(raw.RESEND_API_KEY),
};

export type Env = typeof env;
