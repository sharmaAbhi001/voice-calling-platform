import type {
  CallContext,
  CallOutcome,
  KbPassage,
  TranscriptTurn,
} from '@voiceops/shared';
import { env } from '../config/env.js';

export interface RetrievalResult {
  grounded: boolean;
  passages: KbPassage[];
  /** Passages already formatted for the prompt. */
  context: string;
}

const request = async <T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; timeoutMs?: number },
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000);
  try {
    const response = await fetch(`${env.BACKEND_URL}${path}`, {
      method: init.method,
      headers: {
        'content-type': 'application/json',
        'x-agent-key': env.AGENT_API_KEY,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Backend ${init.method} ${path} failed (${response.status}): ${detail}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * The agent's only door to the platform. It holds no database or provider
 * credentials of its own beyond the shared agent key.
 */
export const backendClient = {
  getCallContext(callId: string): Promise<CallContext> {
    return request<CallContext>(`/internal/calls/${callId}/context`, { method: 'GET' });
  },

  /**
   * Retrieval runs in the backend so query classification, step-back rewriting
   * and the similarity floor stay in one place and cannot drift per agent build.
   */
  retrieve(input: {
    knowledgeBaseId: string;
    query: string;
    topK?: number;
  }): Promise<RetrievalResult> {
    // A voice call cannot wait: a slow lookup must fail into "I don't have that".
    return request<RetrievalResult>('/internal/knowledge/retrieve', {
      method: 'POST',
      body: input,
      timeoutMs: 6000,
    });
  },

  saveResult(
    callId: string,
    payload: {
      transcript: TranscriptTurn[];
      outcomeHint?: CallOutcome;
      capturedRequirement?: string | null;
      agentError?: string | null;
    },
  ): Promise<unknown> {
    return request(`/internal/calls/${callId}/result`, {
      method: 'POST',
      body: payload,
      timeoutMs: 20_000,
    });
  },

  recordEvent(
    callId: string,
    type: 'AGENT_STARTED' | 'AGENT_ENDED' | 'AGENT_ERROR',
    detail?: string,
  ): Promise<unknown> {
    return request(`/internal/calls/${callId}/events`, {
      method: 'POST',
      body: { type, detail },
    });
  },
};
