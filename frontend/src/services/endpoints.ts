import type {
  Call,
  Contact,
  CreateCallRequest,
  DashboardStats,
  KbPassage,
  KnowledgeBase,
  KnowledgeDocument,
  Paginated,
  Template,
  User,
} from '@voiceops/shared';
import { apiRequest } from './api-client.js';

export const authApi = {
  login: (body: { email: string; password: string }) =>
    apiRequest<{ token: string; user: User }>('/auth/login', { method: 'POST', body }),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
  forgotPassword: (body: { email: string }) =>
    apiRequest<{ message: string }>('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body: { token: string; password: string }) =>
    apiRequest<{ message: string }>('/auth/reset-password', { method: 'POST', body }),
  me: () => apiRequest<User>('/auth/me'),
};

export const callsApi = {
  list: (query: Record<string, string | number | undefined>) =>
    apiRequest<Paginated<Call>>('/calls', { query }),
  get: (id: string) => apiRequest<Call>(`/calls/${id}`),
  create: (body: CreateCallRequest) => apiRequest<Call>('/calls', { method: 'POST', body }),
  end: (id: string) => apiRequest<Call>(`/calls/${id}/end`, { method: 'POST' }),
  recording: (id: string) =>
    apiRequest<{ url: string | null; expiresInSeconds: number }>(`/calls/${id}/recording`),
  stats: () => apiRequest<DashboardStats>('/calls/stats'),
};

export const contactsApi = {
  list: (query: Record<string, string | number | undefined>) =>
    apiRequest<Paginated<Contact>>('/contacts', { query }),
  get: (id: string) => apiRequest<Contact>(`/contacts/${id}`),
  create: (body: Partial<Contact>) => apiRequest<Contact>('/contacts', { method: 'POST', body }),
  update: (id: string, body: Partial<Contact>) =>
    apiRequest<Contact>(`/contacts/${id}`, { method: 'PATCH', body }),
  importCsv: (csv: string) =>
    apiRequest<{ imported: number; failed: Array<{ row: number; reason: string }> }>(
      '/contacts/import',
      { method: 'POST', body: { csv } },
    ),
};

export const templatesApi = {
  list: () => apiRequest<{ data: Template[] }>('/templates'),
  get: (id: string) => apiRequest<Template>(`/templates/${id}`),
  create: (body: Partial<Template>) => apiRequest<Template>('/templates', { method: 'POST', body }),
  update: (id: string, body: Partial<Template>) =>
    apiRequest<Template>(`/templates/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => apiRequest<void>(`/templates/${id}`, { method: 'DELETE' }),
  duplicate: (id: string) => apiRequest<Template>(`/templates/${id}/duplicate`, { method: 'POST' }),
  preview: (id: string, variables: Record<string, string>) =>
    apiRequest<{ openingScript: string; systemPrompt: string; closingScript: string }>(
      `/templates/${id}/preview`,
      { method: 'POST', body: { variables } },
    ),
};

export const knowledgeApi = {
  list: () => apiRequest<{ data: KnowledgeBase[] }>('/knowledge-bases'),
  get: (id: string) => apiRequest<KnowledgeBase>(`/knowledge-bases/${id}`),
  create: (body: { name: string; description?: string }) =>
    apiRequest<KnowledgeBase>('/knowledge-bases', { method: 'POST', body }),
  documents: (id: string, query: Record<string, string | undefined> = {}) =>
    apiRequest<{ data: KnowledgeDocument[] }>(`/knowledge-bases/${id}/documents`, { query }),
  addDocument: (id: string, body: Partial<KnowledgeDocument>) =>
    apiRequest<KnowledgeDocument>(`/knowledge-bases/${id}/documents`, { method: 'POST', body }),
  updateDocument: (id: string, documentId: string, body: Partial<KnowledgeDocument>) =>
    apiRequest<KnowledgeDocument>(`/knowledge-bases/${id}/documents/${documentId}`, {
      method: 'PATCH',
      body,
    }),
  deleteDocument: (id: string, documentId: string) =>
    apiRequest<void>(`/knowledge-bases/${id}/documents/${documentId}`, { method: 'DELETE' }),
  /** Mirrors exactly what the agent's look_up_knowledge tool would receive. */
  search: (id: string, query: string) =>
    apiRequest<{
      grounded: boolean;
      passages: KbPassage[];
      analysis?: { stepBackQuestion: string; categories: string[]; isSmallTalk: boolean };
    }>(`/knowledge-bases/${id}/search`, { method: 'POST', body: { query } }),
  reindex: (id: string) =>
    apiRequest<{ documents: number }>(`/knowledge-bases/${id}/reindex`, { method: 'POST' }),
  health: (id: string) =>
    apiRequest<{ chunksMissingEmbeddings: number; embeddingsConfigured: boolean }>(
      `/knowledge-bases/${id}/health`,
    ),
};
