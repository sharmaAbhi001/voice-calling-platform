import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { callLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { callsController } from './calls.controller.js';
import { callIdSchema, createCallSchema, listCallsSchema } from './calls.validation.js';

export const callsRoutes = Router();

callsRoutes.use(requireAuth);

callsRoutes.get('/stats', asyncHandler(callsController.stats));
callsRoutes.get('/', validate({ query: listCallsSchema }), asyncHandler(callsController.list));
callsRoutes.post(
  '/',
  callLimiter,
  validate({ body: createCallSchema }),
  asyncHandler(callsController.create),
);
callsRoutes.get('/:id', validate({ params: callIdSchema }), asyncHandler(callsController.getById));
callsRoutes.post(
  '/:id/end',
  validate({ params: callIdSchema }),
  asyncHandler(callsController.end),
);
callsRoutes.get(
  '/:id/recording',
  validate({ params: callIdSchema }),
  asyncHandler(callsController.recording),
);
