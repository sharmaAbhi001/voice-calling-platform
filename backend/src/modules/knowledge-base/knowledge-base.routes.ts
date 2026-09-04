import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { knowledgeBaseController } from './knowledge-base.controller.js';
import {
  createDocumentSchema,
  createKnowledgeBaseSchema,
  kbDocumentIdSchema,
  kbIdSchema,
  listDocumentsSchema,
  searchSchema,
  updateDocumentSchema,
  updateKnowledgeBaseSchema,
} from './knowledge-base.validation.js';

export const knowledgeBaseRoutes = Router();

knowledgeBaseRoutes.use(requireAuth);

knowledgeBaseRoutes.get('/', asyncHandler(knowledgeBaseController.list));
knowledgeBaseRoutes.post(
  '/',
  validate({ body: createKnowledgeBaseSchema }),
  asyncHandler(knowledgeBaseController.create),
);
knowledgeBaseRoutes.get(
  '/:id',
  validate({ params: kbIdSchema }),
  asyncHandler(knowledgeBaseController.getById),
);
knowledgeBaseRoutes.patch(
  '/:id',
  validate({ params: kbIdSchema, body: updateKnowledgeBaseSchema }),
  asyncHandler(knowledgeBaseController.update),
);

knowledgeBaseRoutes.get(
  '/:id/documents',
  validate({ params: kbIdSchema, query: listDocumentsSchema }),
  asyncHandler(knowledgeBaseController.listDocuments),
);
knowledgeBaseRoutes.post(
  '/:id/documents',
  validate({ params: kbIdSchema, body: createDocumentSchema }),
  asyncHandler(knowledgeBaseController.addDocument),
);
knowledgeBaseRoutes.patch(
  '/:id/documents/:documentId',
  validate({ params: kbDocumentIdSchema, body: updateDocumentSchema }),
  asyncHandler(knowledgeBaseController.updateDocument),
);
knowledgeBaseRoutes.delete(
  '/:id/documents/:documentId',
  validate({ params: kbDocumentIdSchema }),
  asyncHandler(knowledgeBaseController.deleteDocument),
);

// Retrieval preview and maintenance: what would the agent find, and is it indexed?
knowledgeBaseRoutes.post(
  '/:id/search',
  validate({ params: kbIdSchema, body: searchSchema }),
  asyncHandler(knowledgeBaseController.search),
);
knowledgeBaseRoutes.post(
  '/:id/reindex',
  validate({ params: kbIdSchema }),
  asyncHandler(knowledgeBaseController.reindex),
);
knowledgeBaseRoutes.get(
  '/:id/health',
  validate({ params: kbIdSchema }),
  asyncHandler(knowledgeBaseController.health),
);
