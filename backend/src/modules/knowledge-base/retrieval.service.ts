import { z } from 'zod';
import {
  KB_CATEGORY,
  KB_MIN_SIMILARITY,
  KB_TOP_K,
  type KbCategory,
  type KbPassage,
  type KbRetrievalResponse,
} from '@voiceops/shared';
import { capabilities } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { embeddingService } from '../../services/ai/embedding.service.js';
import { llmService } from '../../services/ai/llm.service.js';
import { knowledgeBaseRepository } from './knowledge-base.repository.js';

/**
 * Query understanding for retrieval, in one LLM call:
 *
 * 1. CLASSIFICATION - which knowledge categories could hold the answer. Searching
 *    only PRICING chunks for a pricing question keeps a features paragraph from
 *    out-ranking the actual price list.
 * 2. STEP-BACK PROMPTING - rewrite the caller's narrow, conversational question
 *    into the broader question it is an instance of. "Is it cheaper if we take 40
 *    seats?" is a spoken instance of "How is the product priced, and are there
 *    volume discounts?", and the second phrasing is what the KB was written in.
 *
 * Both variants are searched together and the best score per chunk wins, so the
 * step-back query can only add recall, never displace an exact hit.
 */
const analysisSchema = z.object({
  stepBackQuestion: z.string().min(3).max(300),
  categories: z.array(z.enum(KB_CATEGORY)).max(4),
  isSmallTalk: z.boolean(),
});

export type QueryAnalysis = z.infer<typeof analysisSchema>;

const buildAnalysisPrompt = (available: KbCategory[]): string => `
You prepare search queries for a company knowledge base used by a phone sales agent.
You never answer the customer. You only restructure their question for retrieval.

Available knowledge categories: ${available.join(', ') || 'none'}.

Return JSON with exactly these keys:
- "stepBackQuestion": the broader, general question that the customer's specific
  question is an instance of. Strip names, seat counts, dates and other specifics.
  Phrase it the way internal documentation would phrase it.
- "categories": 1-3 categories from the available list that most likely contain the
  answer. Use an empty array only when the question could touch anything.
- "isSmallTalk": true when the utterance is a greeting, filler, or a question about
  the call itself rather than a request for company or product facts.

Examples:
Customer: "so for like 40 of my sales guys would it come down a bit?"
{"stepBackQuestion":"How is the product priced and are volume discounts available for larger teams?","categories":["PRICING"],"isSmallTalk":false}

Customer: "what happens to my data if we stop paying"
{"stepBackQuestion":"What is the data retention and account cancellation policy?","categories":["POLICY","SUPPORT"],"isSmallTalk":false}

Customer: "yeah hi, sorry, who is this again?"
{"stepBackQuestion":"What company is calling and what do they do?","categories":["COMPANY"],"isSmallTalk":true}
`.trim();

export const retrievalService = {
  /** Step 1 of retrieval. Falls back to "search everything" if the LLM is unavailable. */
  async analyseQuery(knowledgeBaseId: string, question: string): Promise<QueryAnalysis> {
    const available = await knowledgeBaseRepository.availableCategories(knowledgeBaseId);
    const fallback: QueryAnalysis = {
      stepBackQuestion: question,
      categories: [],
      isSmallTalk: false,
    };
    if (!capabilities.embeddings) return fallback;

    const analysis = await llmService.completeJson({
      system: buildAnalysisPrompt(available),
      user: `Customer said: "${question}"`,
      schema: analysisSchema,
      fallback,
      maxTokens: 200,
    });

    // Never search a category that holds no published content.
    const categories =
      available.length > 0
        ? analysis.categories.filter((category) => available.includes(category))
        : [];
    return { ...analysis, categories };
  },

  /**
   * Full retrieval pass. `grounded: false` is a first-class answer: it tells the
   * agent it must say it does not have the information rather than improvise.
   */
  async retrieve(input: {
    knowledgeBaseId: string;
    query: string;
    stepBackQuery?: string;
    categories?: KbCategory[];
    topK?: number;
  }): Promise<KbRetrievalResponse & { analysis?: QueryAnalysis }> {
    const topK = input.topK ?? KB_TOP_K;

    // Callers may pass a pre-computed analysis (the agent does, to save a round trip).
    const analysis =
      input.stepBackQuery || input.categories
        ? undefined
        : await this.analyseQuery(input.knowledgeBaseId, input.query);

    const stepBackQuery = input.stepBackQuery ?? analysis?.stepBackQuestion;
    const categories = input.categories ?? analysis?.categories ?? [];

    const texts = [input.query, ...(stepBackQuery && stepBackQuery !== input.query ? [stepBackQuery] : [])];

    let embeddings: number[][] = [];
    if (capabilities.embeddings) {
      try {
        embeddings = await embeddingService.embedMany(texts);
      } catch (error) {
        // Lexical search alone still beats answering from thin air.
        logger.warn({ err: error }, 'Embedding failed, falling back to lexical retrieval');
      }
    }

    const search = (searchCategories: KbCategory[]) =>
      knowledgeBaseRepository.search({
        knowledgeBaseId: input.knowledgeBaseId,
        embeddings,
        texts,
        categories: searchCategories,
        limit: topK,
      });

    const aboveFloor = (passages: KbPassage[]) =>
      passages.filter((passage) => passage.similarity >= KB_MIN_SIMILARITY);

    let relevant = aboveFloor(await search(categories));

    // A wrong category guess must not look like "we have no information". The
    // search always returns its top K, so an empty result is not the signal to
    // widen - the signal is that nothing cleared the similarity floor. Retrying
    // across every category costs one query and rescues the common case where the
    // answer sits in a neighbouring category (a language question answered in the
    // FAQ rather than under FEATURES).
    if (relevant.length === 0 && categories.length > 0) {
      relevant = aboveFloor(await search([]));
    }

    return {
      grounded: relevant.length > 0,
      passages: relevant,
      ...(analysis ? { analysis } : {}),
    };
  },

  /** Renders passages into the block the agent is allowed to speak from. */
  formatPassages(passages: KbPassage[]): string {
    if (passages.length === 0) return 'NO MATCHING KNOWLEDGE BASE CONTENT.';
    return passages
      .map(
        (passage, index) =>
          `[${index + 1}] ${passage.documentTitle} (${passage.category})\n${passage.content}`,
      )
      .join('\n\n');
  },
};
