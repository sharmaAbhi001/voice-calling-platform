import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  authLimiter,
  passwordResetRequestLimiter,
  passwordResetSubmitLimiter,
} from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { authController } from './auth.controller.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from './auth.validation.js';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);
authRoutes.post(
  '/forgot-password',
  passwordResetRequestLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);
authRoutes.post(
  '/reset-password',
  passwordResetSubmitLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);
authRoutes.post('/logout', asyncHandler(authController.logout));
authRoutes.get('/me', requireAuth, asyncHandler(authController.me));
