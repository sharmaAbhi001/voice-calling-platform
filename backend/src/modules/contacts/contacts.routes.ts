import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { contactsController } from './contacts.controller.js';
import {
  contactIdSchema,
  createContactSchema,
  importContactsSchema,
  listContactsSchema,
  updateContactSchema,
} from './contacts.validation.js';

export const contactsRoutes = Router();

contactsRoutes.use(requireAuth);

contactsRoutes.get(
  '/',
  validate({ query: listContactsSchema }),
  asyncHandler(contactsController.list),
);
contactsRoutes.post(
  '/',
  validate({ body: createContactSchema }),
  asyncHandler(contactsController.create),
);
contactsRoutes.post(
  '/import',
  validate({ body: importContactsSchema }),
  asyncHandler(contactsController.importCsv),
);
contactsRoutes.get(
  '/:id',
  validate({ params: contactIdSchema }),
  asyncHandler(contactsController.getById),
);
contactsRoutes.patch(
  '/:id',
  validate({ params: contactIdSchema, body: updateContactSchema }),
  asyncHandler(contactsController.update),
);
