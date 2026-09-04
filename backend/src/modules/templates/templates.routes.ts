import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { templatesController } from './templates.controller.js';
import {
  createTemplateSchema,
  templateIdSchema,
  updateTemplateSchema,
} from './templates.validation.js';

const previewSchema = z.object({ variables: z.record(z.string()).default({}) });

export const templatesRoutes = Router();

templatesRoutes.use(requireAuth);

templatesRoutes.get('/', asyncHandler(templatesController.list));
templatesRoutes.post(
  '/',
  validate({ body: createTemplateSchema }),
  asyncHandler(templatesController.create),
);
templatesRoutes.get(
  '/:id',
  validate({ params: templateIdSchema }),
  asyncHandler(templatesController.getById),
);
templatesRoutes.patch(
  '/:id',
  validate({ params: templateIdSchema, body: updateTemplateSchema }),
  asyncHandler(templatesController.update),
);
templatesRoutes.delete(
  '/:id',
  validate({ params: templateIdSchema }),
  asyncHandler(templatesController.remove),
);
templatesRoutes.post(
  '/:id/duplicate',
  validate({ params: templateIdSchema }),
  asyncHandler(templatesController.duplicate),
);
templatesRoutes.post(
  '/:id/preview',
  validate({ params: templateIdSchema, body: previewSchema }),
  asyncHandler(templatesController.preview),
);
