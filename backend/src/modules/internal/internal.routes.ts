import { Router } from 'express';
import { requireAgentKey } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { internalController } from './internal.controller.js';
import {
  callEventSchema,
  callIdParamSchema,
  callResultSchema,
  retrieveSchema,
} from './internal.validation.js';

/**
 * Machine-to-machine surface for the LiveKit agent process. Never exposed to the
 * browser: it is authenticated with AGENT_API_KEY and should not be reachable
 * from the public internet in production.
 */
export const internalRoutes = Router();

internalRoutes.use(requireAgentKey);

internalRoutes.get(
  '/calls/:id/context',
  validate({ params: callIdParamSchema }),
  asyncHandler(internalController.callContext),
);
internalRoutes.post(
  '/calls/:id/result',
  validate({ params: callIdParamSchema, body: callResultSchema }),
  asyncHandler(internalController.saveResult),
);
internalRoutes.post(
  '/calls/:id/events',
  validate({ params: callIdParamSchema, body: callEventSchema }),
  asyncHandler(internalController.recordEvent),
);
internalRoutes.post(
  '/knowledge/retrieve',
  validate({ body: retrieveSchema }),
  asyncHandler(internalController.retrieve),
);
