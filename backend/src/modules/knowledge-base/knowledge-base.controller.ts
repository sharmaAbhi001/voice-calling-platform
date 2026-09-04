import type { Request, Response } from 'express';
import { knowledgeBaseService } from './knowledge-base.service.js';
import type {
  CreateDocumentInput,
  CreateKnowledgeBaseInput,
  ListDocumentsQuery,
  SearchInput,
  UpdateDocumentInput,
  UpdateKnowledgeBaseInput,
} from './knowledge-base.validation.js';

export const knowledgeBaseController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await knowledgeBaseService.list() });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as CreateKnowledgeBaseInput;
    res.status(201).json(await knowledgeBaseService.create(body));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await knowledgeBaseService.getById(id));
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as UpdateKnowledgeBaseInput;
    res.status(200).json(await knowledgeBaseService.update(id, body));
  },

  async listDocuments(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const filters = req.validated?.query as ListDocumentsQuery;
    res.status(200).json({ data: await knowledgeBaseService.listDocuments(id, filters) });
  },

  async addDocument(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as CreateDocumentInput;
    res.status(201).json(await knowledgeBaseService.addDocument(id, body));
  },

  async updateDocument(req: Request, res: Response): Promise<void> {
    const { id, documentId } = req.validated?.params as { id: string; documentId: string };
    const body = req.validated?.body as UpdateDocumentInput;
    res.status(200).json(await knowledgeBaseService.updateDocument(id, documentId, body));
  },

  async deleteDocument(req: Request, res: Response): Promise<void> {
    const { id, documentId } = req.validated?.params as { id: string; documentId: string };
    await knowledgeBaseService.deleteDocument(id, documentId);
    res.status(204).send();
  },

  async search(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as SearchInput;
    res.status(200).json(await knowledgeBaseService.search(id, body.query, body.topK));
  },

  async reindex(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await knowledgeBaseService.reindex(id));
  },

  async health(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await knowledgeBaseService.health(id));
  },
};
