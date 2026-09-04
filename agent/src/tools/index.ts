import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { CallOutcome } from '@voiceops/shared';
import type { KnowledgeRetriever } from '../knowledge/retriever.js';

/** Mutable state the tools write into; read back when the call ends. */
export interface CallState {
  capturedRequirement: string | null;
  outcomeHint: CallOutcome | null;
  endRequested: boolean;
  endReason: string | null;
  lookupCount: number;
  ungroundedCount: number;
}

export const createCallState = (): CallState => ({
  capturedRequirement: null,
  outcomeHint: null,
  endRequested: false,
  endReason: null,
  lookupCount: 0,
  ungroundedCount: 0,
});

export const buildTools = (retriever: KnowledgeRetriever, state: CallState) => ({
  /**
   * The only sanctioned source of facts. The description is written to be read by
   * the model at decision time, so it repeats the rule rather than assuming the
   * system prompt is still in view.
   */
  look_up_knowledge: llm.tool({
    description: [
      'Look up company, product, pricing, feature, policy or support facts in the',
      'approved knowledge base. You MUST call this before stating any such fact,',
      'every time, even if you think you know the answer. If it reports that no',
      'grounded information was found, you must tell the customer you do not have',
      'that information instead of answering.',
    ].join(' '),
    parameters: z.object({
      question: z
        .string()
        .describe(
          'The customer question, in full and in plain words. Include what they are asking about, not just a keyword.',
        ),
    }),
    execute: async ({ question }) => {
      const result = await retriever.lookup(question);
      state.lookupCount += 1;
      if (!result.grounded) state.ungroundedCount += 1;
      return result.toolOutput;
    },
  }),

  /** Records what the customer actually said they need, in their own terms. */
  capture_requirement: llm.tool({
    description:
      'Record what the customer said they need or are looking for. Call this once, as soon as they state a requirement. Use their words, not a sales interpretation.',
    parameters: z.object({
      requirement: z
        .string()
        .describe('One or two factual sentences describing what the customer needs.'),
    }),
    execute: async ({ requirement }) => {
      state.capturedRequirement = requirement.trim();
      return 'Requirement recorded. Continue the conversation naturally.';
    },
  }),

  /**
   * The model reports what it observed; the backend still re-derives the outcome
   * from the transcript, so this is a hint and not the final word.
   */
  end_call: llm.tool({
    description:
      'End the call. Call this after you have delivered the closing line, or immediately if the customer asks you to stop calling.',
    parameters: z.object({
      outcome: z
        .enum(['CONNECTED', 'INTERESTED', 'NOT_INTERESTED', 'CONVERTED', 'ENDED'])
        .describe(
          'INTERESTED: asked for a demo, details or a callback. NOT_INTERESTED: declined or asked not to be contacted. CONVERTED: explicitly agreed to buy or sign up. CONNECTED: spoke but expressed no position. ENDED: wrong number, voicemail or no real conversation.',
        ),
      reason: z.string().describe('One short sentence on why the call is ending.'),
    }),
    execute: async ({ outcome, reason }) => {
      state.outcomeHint = outcome as CallOutcome;
      state.endReason = reason;
      state.endRequested = true;
      return 'Call is ending. Say nothing further.';
    },
  }),
});
