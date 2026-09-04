import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getOpenAI } from './openai.client.js';

/** Must match the vector(1536) column in the migration. */
export const EMBEDDING_DIMENSIONS = 1536;

/** pgvector accepts a bracketed list as text; node-pg has no native vector type. */
export const toVectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export const embeddingService: EmbeddingService = {
  async embed(text) {
    const [first] = await this.embedMany([text]);
    return first ?? [];
  },

  async embedMany(texts) {
    if (texts.length === 0) return [];
    const response = await getOpenAI().embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: texts.map((text) => text.replace(/\s+/g, ' ').trim()),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    logger.debug({ count: texts.length }, 'Created embeddings');
    return response.data.map((item) => item.embedding);
  },
};
