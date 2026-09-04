import type { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getOpenAI } from './openai.client.js';

export interface JsonCompletionOptions<T extends z.ZodTypeAny> {
  system: string;
  user: string;
  schema: T;
  /** Returned when the model errors or answers with something the schema rejects. */
  fallback: z.infer<T>;
  temperature?: number;
  maxTokens?: number;
}

export const llmService = {
  /**
   * JSON-mode completion validated against a zod schema. Retrieval and outcome
   * classification both depend on structure, so an unparseable answer degrades to
   * the caller's fallback instead of throwing into a live call.
   */
  async completeJson<T extends z.ZodTypeAny>(options: JsonCompletionOptions<T>): Promise<z.infer<T>> {
    try {
      const response = await getOpenAI().chat.completions.create({
        model: env.OPENAI_LLM_MODEL,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return options.fallback;

      const parsed = options.schema.safeParse(JSON.parse(content));
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues }, 'LLM JSON failed schema validation');
        return options.fallback;
      }
      return parsed.data;
    } catch (error) {
      logger.warn({ err: error }, 'LLM JSON completion failed, using fallback');
      return options.fallback;
    }
  },

  async completeText(system: string, user: string, maxTokens = 600): Promise<string | null> {
    try {
      const response = await getOpenAI().chat.completions.create({
        model: env.OPENAI_LLM_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch (error) {
      logger.warn({ err: error }, 'LLM text completion failed');
      return null;
    }
  },
};
