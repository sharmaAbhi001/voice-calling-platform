import type { CallOutcome } from '../constants/call.js';
import type { KbCategory } from '../constants/knowledge.js';
import type { AgentLanguage } from '../constants/language.js';
import type { BackgroundAudio, LlmProvider, VoiceProvider } from '../constants/voice.js';
import type { TranscriptTurn } from './api.js';

/** Everything the LiveKit agent needs to run one call. Fetched at job start. */
export interface CallContext {
  callId: string;
  phone: string;
  contact: { name: string | null; company: string | null } | null;
  template: {
    name: string;
    objective: string;
    openingScript: string;
    systemPrompt: string;
    closingScript: string;
    tone: string;
    language: AgentLanguage;
    voiceProvider: VoiceProvider;
    llmProvider: LlmProvider;
    voiceName: string | null;
    backgroundAudio: BackgroundAudio;
    qualificationQuestions: string[];
  };
  knowledgeBaseId: string | null;
  knowledgeBaseName: string | null;
  variables: Record<string, string>;
}

export interface KbRetrievalRequest {
  knowledgeBaseId: string;
  /** The customer's literal question. */
  query: string;
  /** Broader, de-contextualised question produced by step-back prompting. */
  stepBackQuery?: string;
  /** Categories chosen by the classifier; empty means search everything. */
  categories?: KbCategory[];
  topK?: number;
}

export interface KbPassage {
  documentId: string;
  documentTitle: string;
  category: KbCategory;
  content: string;
  similarity: number;
}

export interface KbRetrievalResponse {
  /** False when nothing cleared the similarity floor: agent must decline to answer. */
  grounded: boolean;
  passages: KbPassage[];
}

export interface CallResultPayload {
  transcript: TranscriptTurn[];
  summary: string | null;
  extractedRequirement: string | null;
  outcome: CallOutcome;
  agentError?: string | null;
}
