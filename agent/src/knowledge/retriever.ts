import type { AgentLanguage } from '@voiceops/shared';
import { backendClient } from '../services/backend.client.js';
import { NO_INFORMATION_LINE } from '../prompts/system-prompt.js';

export interface RetrievalOutcome {
  grounded: boolean;
  /** Exactly what is injected back into the conversation as the tool result. */
  toolOutput: string;
  passageCount: number;
}

const ungroundedOutput = (language: AgentLanguage): string =>
  `NO GROUNDED INFORMATION FOUND.
You must not answer this question from your own knowledge. Say this and move on:
"${NO_INFORMATION_LINE[language]}"`;

/**
 * Per-call retrieval with a small cache. Callers repeat themselves ("sorry, how
 * much again?") and a phone call cannot afford the same round trip twice.
 */
export class KnowledgeRetriever {
  private readonly cache = new Map<string, RetrievalOutcome>();

  constructor(
    private readonly knowledgeBaseId: string | null,
    private readonly language: AgentLanguage,
  ) {}

  get isAvailable(): boolean {
    return this.knowledgeBaseId !== null;
  }

  async lookup(question: string): Promise<RetrievalOutcome> {
    if (!this.knowledgeBaseId) {
      return { grounded: false, toolOutput: ungroundedOutput(this.language), passageCount: 0 };
    }

    const key = question.trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;

    let outcome: RetrievalOutcome;
    try {
      const result = await backendClient.retrieve({
        knowledgeBaseId: this.knowledgeBaseId,
        query: question,
      });

      outcome = result.grounded
        ? {
            grounded: true,
            passageCount: result.passages.length,
            toolOutput: `GROUNDED KNOWLEDGE BASE CONTENT. Answer using only what appears below. If the specific detail the customer asked for is not in it, say you do not have that information.\n\n${result.context}`,
          }
        : { grounded: false, toolOutput: ungroundedOutput(this.language), passageCount: 0 };
    } catch {
      // A retrieval outage must degrade into a refusal, never into a guess.
      outcome = { grounded: false, toolOutput: ungroundedOutput(this.language), passageCount: 0 };
    }

    this.cache.set(key, outcome);
    return outcome;
  }
}
