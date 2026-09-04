import OpenAI from 'openai';
import { capabilities, env } from '../../config/env.js';
import { serviceUnavailable } from '../../utils/errors.js';

let client: OpenAI | null = null;

/** Lazily constructed so the app still boots (in a degraded mode) without a key. */
export const getOpenAI = (): OpenAI => {
  if (!capabilities.embeddings) {
    throw serviceUnavailable(
      'OPENAI_API_KEY is not configured, so AI features are unavailable',
    );
  }
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
};
