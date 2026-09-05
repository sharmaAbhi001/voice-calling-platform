import type {
  DocumentStatus,
  KbCategory,
  KbPassage,
  KnowledgeBase,
  KnowledgeDocument,
} from '@voiceops/shared';
import { Prisma } from '@prisma/client';
import { prisma, withTransaction } from '../../database/client.js';
import { toVectorLiteral } from '../../services/ai/embedding.service.js';

type KbRow = { id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date };

type DocumentRow = {
  id: string;
  knowledgeBaseId: string;
  title: string;
  category: string;
  content: string;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

interface PassageRow {
  document_id: string;
  document_title: string;
  category: KbCategory;
  content: string;
  similarity: number;
}

const toKnowledgeBase = (row: KbRow, documentCount?: number): KnowledgeBase => ({
  id: row.id,
  name: row.name,
  description: row.description,
  documentCount,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toDocument = (row: DocumentRow, chunkCount?: number): KnowledgeDocument => ({
  id: row.id,
  knowledgeBaseId: row.knowledgeBaseId,
  title: row.title,
  category: row.category as KbCategory,
  content: row.content,
  status: row.status as DocumentStatus,
  version: row.version,
  chunkCount,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

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
    const rows = await prisma.knowledgeBase.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: { where: { status: 'PUBLISHED' } } } } },
    });
    return rows.map((row) => toKnowledgeBase(row, row._count.documents));
  },

  async findBaseById(id: string): Promise<KnowledgeBase | null> {
    const row = await prisma.knowledgeBase.findUnique({ where: { id } });
    return row ? toKnowledgeBase(row) : null;
  },

  async createBase(input: { name: string; description: string | null }): Promise<KnowledgeBase> {
    return toKnowledgeBase(await prisma.knowledgeBase.create({ data: input }));
  },

  async updateBase(
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<KnowledgeBase | null> {
    const data: Prisma.KnowledgeBaseUncheckedUpdateManyInput = {};
    if (input.name != null) data.name = input.name;
    if (input.description != null) data.description = input.description;

    const { count } = await prisma.knowledgeBase.updateMany({ where: { id }, data });
    if (count === 0) return null;
    return this.findBaseById(id);
  },

  async listDocuments(
    knowledgeBaseId: string,
    filters: { search?: string; category?: KbCategory; status?: DocumentStatus },
  ): Promise<KnowledgeDocument[]> {
    const where: Prisma.KnowledgeDocumentWhereInput = { knowledgeBaseId };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;

    const rows = await prisma.knowledgeDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
    return rows.map((row) => toDocument(row, row._count.chunks));
  },

  async findDocument(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<KnowledgeDocument | null> {
    const row = await prisma.knowledgeDocument.findFirst({
      where: { id: documentId, knowledgeBaseId },
    });
    return row ? toDocument(row) : null;
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
    return withTransaction(async (tx) => {
      const document = await tx.knowledgeDocument.create({
        data: {
          knowledgeBaseId: input.knowledgeBaseId,
          title: input.title,
          category: input.category,
          content: input.content,
          status: input.status,
        },
      });
      await insertChunks(tx, {
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
    return withTransaction(async (tx) => {
      const data: Prisma.KnowledgeDocumentUncheckedUpdateManyInput = { version: { increment: 1 } };
      if (input.title != null) data.title = input.title;
      if (input.category != null) data.category = input.category;
      if (input.content != null) data.content = input.content;
      if (input.status != null) data.status = input.status;

      const { count } = await tx.knowledgeDocument.updateMany({
        where: { id: input.documentId, knowledgeBaseId: input.knowledgeBaseId },
        data,
      });
      if (count === 0) return null;

      const document = await tx.knowledgeDocument.findUniqueOrThrow({
        where: { id: input.documentId },
      });

      if (input.chunks) {
        await tx.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
        await insertChunks(tx, {
          documentId: document.id,
          knowledgeBaseId: input.knowledgeBaseId,
          category: document.category as KbCategory,
          chunks: input.chunks,
        });
      } else if (input.category) {
        await tx.knowledgeChunk.updateMany({
          where: { documentId: document.id },
          data: { category: document.category },
        });
      }

      return toDocument(document);
    });
  },

  async deleteDocument(knowledgeBaseId: string, documentId: string): Promise<boolean> {
    const { count } = await prisma.knowledgeDocument.deleteMany({
      where: { id: documentId, knowledgeBaseId },
    });
    return count > 0;
  },

  /**
   * Hybrid retrieval: cosine similarity over every query variant plus a lexical
   * arm, best score per chunk wins. The lexical arm is what keeps retrieval
   * working for exact tokens (SKU codes, plan names) that embeddings blur.
   *
   * Raw SQL by necessity: the number of score expressions depends on how many
   * query variants were generated, and `embedding` is a pgvector column that
   * Prisma Client cannot reference.
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

    // Prisma binds every parameter as text, so the uuid and text[] comparisons
    // below need an explicit cast that the pg driver used to apply for us.
    const conditions = ['c.knowledge_base_id = $1::uuid', "d.status = 'PUBLISHED'"];
    if (options.categories.length > 0) {
      params.push(options.categories);
      conditions.push(`c.category = ANY ($${params.length}::text[])`);
    }

    params.push(options.limit);
    const rows = await prisma.$queryRawUnsafe<PassageRow[]>(
      `SELECT c.document_id, d.title AS document_title, c.category, c.content,
              GREATEST(${scoreExpressions.join(', ')})::float8 AS similarity
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY similarity DESC
       LIMIT $${params.length}`,
      ...params,
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
    // SELECT DISTINCT in the database: Prisma's `distinct` would pull every chunk
    // row back to Node just to throw the duplicates away.
    const rows = await prisma.$queryRaw<Array<{ category: KbCategory }>>`
      SELECT DISTINCT c.category
      FROM knowledge_chunks c
      JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.knowledge_base_id = ${knowledgeBaseId}::uuid AND d.status = 'PUBLISHED'`;
    return rows.map((row) => row.category);
  },

  async documentsMissingEmbeddings(knowledgeBaseId: string): Promise<number> {
    // `embedding` is an Unsupported column, so it can only be filtered in SQL.
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM knowledge_chunks
      WHERE knowledge_base_id = ${knowledgeBaseId}::uuid AND embedding IS NULL`;
    return rows[0]?.count ?? 0;
  },
};

const insertChunks = async (
  tx: Prisma.TransactionClient,
  input: {
    documentId: string;
    knowledgeBaseId: string;
    category: KbCategory;
    chunks: Array<{ content: string; embedding: number[] | null }>;
  },
): Promise<void> => {
  let index = 0;
  for (const chunk of input.chunks) {
    const embedding = chunk.embedding ? toVectorLiteral(chunk.embedding) : null;
    await tx.$executeRaw`
      INSERT INTO knowledge_chunks
        (document_id, knowledge_base_id, category, chunk_index, content, embedding)
      VALUES (${input.documentId}::uuid, ${input.knowledgeBaseId}::uuid, ${input.category},
              ${index}, ${chunk.content}, ${embedding}::vector)`;
    index += 1;
  }
};
