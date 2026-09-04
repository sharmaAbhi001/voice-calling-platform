import type { KnowledgeBase, KnowledgeDocument } from '@voiceops/shared';
import { capabilities } from '../../config/env.js';
import { conflict, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { embeddingService } from '../../services/ai/embedding.service.js';
import { chunkDocument } from './knowledge-base.chunker.js';
import { knowledgeBaseRepository } from './knowledge-base.repository.js';
import { retrievalService } from './retrieval.service.js';
import type {
  CreateDocumentInput,
  CreateKnowledgeBaseInput,
  ListDocumentsQuery,
  UpdateDocumentInput,
  UpdateKnowledgeBaseInput,
} from './knowledge-base.validation.js';

/**
 * Builds the chunk rows for a document. Embedding failures are tolerated: the
 * chunk is still stored and remains findable lexically, and /reindex can fill
 * the vector in later.
 */
const buildChunks = async (
  title: string,
  content: string,
): Promise<Array<{ content: string; embedding: number[] | null }>> => {
  const texts = chunkDocument(title, content);
  if (!capabilities.embeddings) {
    logger.warn('OPENAI_API_KEY missing: indexing document without embeddings');
    return texts.map((text) => ({ content: text, embedding: null }));
  }
  try {
    const embeddings = await embeddingService.embedMany(texts);
    return texts.map((text, index) => ({ content: text, embedding: embeddings[index] ?? null }));
  } catch (error) {
    logger.error({ err: error }, 'Embedding failed while indexing document');
    return texts.map((text) => ({ content: text, embedding: null }));
  }
};

export const knowledgeBaseService = {
  list(): Promise<KnowledgeBase[]> {
    return knowledgeBaseRepository.listBases();
  },

  async getById(id: string): Promise<KnowledgeBase> {
    const base = await knowledgeBaseRepository.findBaseById(id);
    if (!base) throw notFound('Knowledge base');
    return base;
  },

  async create(input: CreateKnowledgeBaseInput): Promise<KnowledgeBase> {
    try {
      return await knowledgeBaseRepository.createBase({
        name: input.name,
        description: input.description ?? null,
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw conflict('A knowledge base with this name already exists');
      }
      throw error;
    }
  },

  async update(id: string, input: UpdateKnowledgeBaseInput): Promise<KnowledgeBase> {
    const updated = await knowledgeBaseRepository.updateBase(id, {
      name: input.name,
      description: input.description ?? undefined,
    });
    if (!updated) throw notFound('Knowledge base');
    return updated;
  },

  async listDocuments(
    knowledgeBaseId: string,
    filters: ListDocumentsQuery,
  ): Promise<KnowledgeDocument[]> {
    await this.getById(knowledgeBaseId);
    return knowledgeBaseRepository.listDocuments(knowledgeBaseId, filters);
  },

  async addDocument(
    knowledgeBaseId: string,
    input: CreateDocumentInput,
  ): Promise<KnowledgeDocument> {
    await this.getById(knowledgeBaseId);
    const chunks = await buildChunks(input.title, input.content);
    return knowledgeBaseRepository.createDocumentWithChunks({
      knowledgeBaseId,
      title: input.title,
      category: input.category,
      content: input.content,
      status: input.status,
      chunks,
    });
  },

  async updateDocument(
    knowledgeBaseId: string,
    documentId: string,
    input: UpdateDocumentInput,
  ): Promise<KnowledgeDocument> {
    const existing = await knowledgeBaseRepository.findDocument(knowledgeBaseId, documentId);
    if (!existing) throw notFound('Document');

    // Re-chunk only when the text the agent reads actually changed.
    const contentChanged = input.content !== undefined && input.content !== existing.content;
    const titleChanged = input.title !== undefined && input.title !== existing.title;
    const chunks =
      contentChanged || titleChanged
        ? await buildChunks(input.title ?? existing.title, input.content ?? existing.content)
        : null;

    const updated = await knowledgeBaseRepository.updateDocumentWithChunks({
      knowledgeBaseId,
      documentId,
      title: input.title,
      category: input.category,
      content: input.content,
      status: input.status,
      chunks,
    });
    if (!updated) throw notFound('Document');
    return updated;
  },

  async deleteDocument(knowledgeBaseId: string, documentId: string): Promise<void> {
    const deleted = await knowledgeBaseRepository.deleteDocument(knowledgeBaseId, documentId);
    if (!deleted) throw notFound('Document');
  },

  /** Rebuilds every chunk of every document, e.g. after adding an API key. */
  async reindex(knowledgeBaseId: string): Promise<{ documents: number }> {
    await this.getById(knowledgeBaseId);
    const documents = await knowledgeBaseRepository.listDocuments(knowledgeBaseId, {});
    for (const document of documents) {
      const chunks = await buildChunks(document.title, document.content);
      await knowledgeBaseRepository.updateDocumentWithChunks({
        knowledgeBaseId,
        documentId: document.id,
        chunks,
      });
    }
    return { documents: documents.length };
  },

  /** Admin preview of exactly what the agent would retrieve for a question. */
  async search(knowledgeBaseId: string, question: string, topK?: number) {
    await this.getById(knowledgeBaseId);
    return retrievalService.retrieve({ knowledgeBaseId, query: question, topK });
  },

  async health(knowledgeBaseId: string) {
    await this.getById(knowledgeBaseId);
    return {
      chunksMissingEmbeddings:
        await knowledgeBaseRepository.documentsMissingEmbeddings(knowledgeBaseId),
      embeddingsConfigured: capabilities.embeddings,
    };
  },
};
