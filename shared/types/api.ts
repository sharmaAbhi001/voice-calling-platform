import type { CallDirection, CallOutcome, CallStatus } from '../constants/call.js';
import type { EligibilityStatus } from '../constants/contact.js';
import type { DocumentStatus, KbCategory } from '../constants/knowledge.js';
import type { AgentLanguage } from '../constants/language.js';
import type { BackgroundAudio, LlmProvider, VoiceProvider } from '../constants/voice.js';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  email: string | null;
  tags: string[];
  eligibilityStatus: EligibilityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
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
  variableSchema: TemplateVariable[];
  knowledgeBaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  required: boolean;
  example?: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  documentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  category: KbCategory;
  content: string;
  status: DocumentStatus;
  version: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptTurn {
  speaker: 'AGENT' | 'CUSTOMER';
  text: string;
  at: string;
}

export interface Call {
  id: string;
  contactId: string | null;
  contactName: string | null;
  templateId: string | null;
  templateName: string | null;
  knowledgeBaseId: string | null;
  phone: string;
  providerCallId: string | null;
  roomName: string | null;
  direction: CallDirection;
  status: CallStatus;
  outcome: CallOutcome;
  failureReason: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  transcript: TranscriptTurn[] | null;
  summary: string | null;
  extractedRequirement: string | null;
  createdAt: string;
}

export interface CreateCallRequest {
  phone?: string;
  contactId?: string;
  templateId: string;
  variables?: Record<string, string>;
}

export interface DashboardStats {
  callsToday: number;
  connected: number;
  interested: number;
  converted: number;
  averageDurationSeconds: number;
  liveCalls: number;
}
