import type {
  DocumentStatus,
  KbCategory,
  KbPassage,
  KnowledgeBase,
  KnowledgeDocument,
} from '@voiceops/shared';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../database/client.js';
import { toVectorLiteral } from '../../services/ai/embedding.service.js';

interface KbRow {
  id: string;
  name: string;
  description: string | null;
  document_count?: number;
  created_at: Date;
  updated_at: Date;
}

interface DocumentRow {
  id: string;
  knowledge_base_id: string;
  title: string;
  category: KbCategory;
  content: string;
  status: DocumentStatus;
  version: number;
  chunk_count?: number;
  created_at: Date;
  updated_at: Date;
}

interface PassageRow {
  document_id: string;
  document_title: string;
  category: KbCategory;
  content: string;
  similarity: number;
}

const toKnowledgeBase = (row: KbRow): KnowledgeBase => ({
  id: row.id,
  name: row.name,
  description: row.description,
  documentCount: row.document_count,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const toDocument = (row: DocumentRow): KnowledgeDocument => ({
  id: row.id,
  knowledgeBaseId: row.knowledge_base_id,
  title: row.title,
  category: row.category,
  content: row.content,
  status: row.status,
  version: row.version,
  chunkCount: row.chunk_count,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const DOC_COLUMNS =
  'id, knowledge_base_id, title, category, content, status, version, created_at, updated_at';

export interface SearchOptions {
  knowledgeBaseId: string;
  /** One embedding per query variant (literal question, step-back question, ...). */
  embeddings: number[][];
  /** Raw text of the same variants, used for the lexical arm of the search. */
  texts: string[];
  categories: KbCategory[];
  limit: number;
}

export const knowledgeBaseRepository = {
  async listBases(): Promise<KnowledgeBase[]> {
    const { rows } = await query<KbRow>(
      `SELECT kb.id, kb.name, kb.description, kb.created_at, kb.updated_at,
              count(d.id)::int AS document_count
       FROM knowledge_bases kb
       LEFT JOIN knowledge_documents d ON d.knowledge_base_id = kb.id AND d.status = 'PUBLISHED'
       GROUP BY kb.id
       ORDER BY kb.created_at DESC`,
    );
    return rows.map(toKnowledgeBase);
  },

  async findBaseById(id: string): Promise<KnowledgeBase | null> {
    const { rows } = await query<KbRow>(
      `SELECT id, name, description, created_at, updated_at FROM knowledge_bases WHERE id = $1`,
      [id],
    );
    return rows[0] ? toKnowledgeBase(rows[0]) : null;
  },

  async createBase(input: { name: string; description: string | null }): Promise<KnowledgeBase> {
    const { rows } = await query<KbRow>(
      `INSERT INTO knowledge_bases (name, description) VALUES ($1, $2)
       RETURNING id, name, description, created_at, updated_at`,
      [input.name, input.description],
    );
    return toKnowledgeBase(rows[0] as KbRow);
  },

  async updateBase(
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<KnowledgeBase | null> {
    const { rows } = await query<KbRow>(
      `UPDATE knowledge_bases
       SET name = COALESCE($2, name), description = COALESCE($3, description)
       WHERE id = $1
       RETURNING id, name, description, created_at, updated_at`,
      [id, input.name ?? null, input.description ?? null],
    );
    return rows[0] ? toKnowledgeBase(rows[0]) : null;
  },

  async listDocuments(
    knowledgeBaseId: string,
    filters: { search?: string; category?: KbCategory; status?: DocumentStatus },
  ): Promise<KnowledgeDocument[]> {
    const params: unknown[] = [knowledgeBaseId];
    const conditions = ['d.knowledge_base_id = $1'];

    if (filters.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`(lower(d.title) LIKE $${params.length} OR lower(d.content) LIKE $${params.length})`);
    }
    if (filters.category) {
      params.push(filters.category);
      conditions.push(`d.category = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`d.status = $${params.length}`);
    }

    const { rows } = await query<DocumentRow>(
      `SELECT d.id, d.knowledge_base_id, d.title, d.category, d.content, d.status, d.version,
              d.created_at, d.updated_at, count(c.id)::int AS chunk_count
       FROM knowledge_documents d
       LEFT JOIN knowledge_chunks c ON c.document_id = d.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY d.id
       ORDER BY d.updated_at DESC`,
      params,
    );
    return rows.map(toDocument);
  },

  async findDocument(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<KnowledgeDocument | null> {
    const { rows } = await query<DocumentRow>(
      `SELECT ${DOC_COLUMNS} FROM knowledge_documents WHERE id = $1 AND knowledge_base_id = $2`,
      [documentId, knowledgeBaseId],
    );
    return rows[0] ? toDocument(rows[0]) : null;
  },

  /**
   * A document and its chunks are written together: a half-indexed document
   * would let the agent answer from stale text.
   */
  async createDocumentWithChunks(input: {
    knowledgeBaseId: string;
    title: string;
    category: KbCategory;
    content: string;
    status: DocumentStatus;
    chunks: Array<{ content: string; embedding: number[] | null }>;
  }): Promise<KnowledgeDocument> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<DocumentRow>(
        `INSERT INTO knowledge_documents (knowledge_base_id, title, category, content, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${DOC_COLUMNS}`,
        [input.knowledgeBaseId, input.title, input.category, input.content, input.status],
      );
      const document = rows[0] as DocumentRow;
      await insertChunks(client, {
        documentId: document.id,
        knowledgeBaseId: input.knowledgeBaseId,
        category: input.category,
        chunks: input.chunks,
      });
      return toDocument(document);
    });
  },

  async updateDocumentWithChunks(input: {
    knowledgeBaseId: string;
    documentId: string;
    title?: string;
    category?: KbCategory;
    content?: string;
    status?: DocumentStatus;
    /** null means "content unchanged, keep the existing chunks". */
    chunks: Array<{ content: string; embedding: number[] | null }> | null;
  }): Promise<KnowledgeDocument | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<DocumentRow>(
        `UPDATE knowledge_documents
         SET title = COALESCE($3, title),
             category = COALESCE($4, category),
             content = COALESCE($5, content),
             status = COALESCE($6, status),
             version = version + 1
         WHERE id = $1 AND knowledge_base_id = $2
         RETURNING ${DOC_COLUMNS}`,
        [
          input.documentId,
          input.knowledgeBaseId,
          input.title ?? null,
          input.category ?? null,
          input.content ?? null,
          input.status ?? null,
        ],
      );
      const document = rows[0];
      if (!document) return null;

      if (input.chunks) {
        await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [document.id]);
        await insertChunks(client, {
          documentId: document.id,
          knowledgeBaseId: input.knowledgeBaseId,
          category: document.category,
          chunks: input.chunks,
        });
      } else if (input.category) {
        await client.query('UPDATE knowledge_chunks SET category = $2 WHERE document_id = $1', [
          document.id,
          document.category,
        ]);
      }

      return toDocument(document);
    });
  },

  async deleteDocument(knowledgeBaseId: string, documentId: string): Promise<boolean> {
    const { rowCount } = await query(
      'DELETE FROM knowledge_documents WHERE id = $1 AND knowledge_base_id = $2',
      [documentId, knowledgeBaseId],
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * Hybrid retrieval: cosine similarity over every query variant plus a lexical
   * arm, best score per chunk wins. The lexical arm is what keeps retrieval
   * working for exact tokens (SKU codes, plan names) that embeddings blur.
   */
  async search(options: SearchOptions): Promise<KbPassage[]> {
    const params: unknown[] = [options.knowledgeBaseId];
    const scoreExpressions: string[] = [];

    for (const embedding of options.embeddings) {
      params.push(toVectorLiteral(embedding));
      scoreExpressions.push(`1 - (c.embedding <=> $${params.length}::vector)`);
    }
    for (const text of options.texts) {
      params.push(text);
      // The spoken question is turned into an OR of its lexemes: a caller says
      // "what does the growth plan cost", the document says "Growth: 999 per user",
      // and an AND query (websearch_to_tsquery) would match neither. Normalisation
      // flag 32 divides the rank by itself + 1, putting the score in 0..1 so it can
      // share a floor with cosine similarity. NULLIF keeps a stopword-only query
      // from being an invalid tsquery; the rank then comes back NULL and is ignored.
      scoreExpressions.push(
        `ts_rank_cd(
           to_tsvector('english', c.content),
           to_tsquery('english', NULLIF(array_to_string(
             tsvector_to_array(to_tsvector('english', $${params.length})), ' | '), '')),
           32)`,
      );
    }
    if (scoreExpressions.length === 0) return [];

    const conditions = ['c.knowledge_base_id = $1', "d.status = 'PUBLISHED'"];
    if (options.categories.length > 0) {
      params.push(options.categories);
      conditions.push(`c.category = ANY ($${params.length}::text[])`);
    }

    params.push(options.limit);
    const { rows } = await query<PassageRow>(
      `SELECT c.document_id, d.title AS document_title, c.category, c.content,
              GREATEST(${scoreExpressions.join(', ')}) AS similarity
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY similarity DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      documentId: row.document_id,
      documentTitle: row.document_title,
      category: row.category,
      content: row.content,
      similarity: Number(row.similarity),
    }));
  },

  /** Which categories actually hold published content - narrows the classifier. */
  async availableCategories(knowledgeBaseId: string): Promise<KbCategory[]> {
    const { rows } = await query<{ category: KbCategory }>(
      `SELECT DISTINCT c.category
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE c.knowledge_base_id = $1 AND d.status = 'PUBLISHED'`,
      [knowledgeBaseId],
    );
    return rows.map((row) => row.category);
  },

  async documentsMissingEmbeddings(knowledgeBaseId: string): Promise<number> {
    const { rows } = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM knowledge_chunks
       WHERE knowledge_base_id = $1 AND embedding IS NULL`,
      [knowledgeBaseId],
    );
    return rows[0]?.count ?? 0;
  },
};

const insertChunks = async (
  client: PoolClient,
  input: {
    documentId: string;
    knowledgeBaseId: string;
    category: KbCategory;
    chunks: Array<{ content: string; embedding: number[] | null }>;
  },
): Promise<void> => {
  let index = 0;
  for (const chunk of input.chunks) {
    await client.query(
      `INSERT INTO knowledge_chunks
         (document_id, knowledge_base_id, category, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)`,
      [
        input.documentId,
        input.knowledgeBaseId,
        input.category,
        index,
        chunk.content,
        chunk.embedding ? toVectorLiteral(chunk.embedding) : null,
      ],
    );
    index += 1;
  }
};
