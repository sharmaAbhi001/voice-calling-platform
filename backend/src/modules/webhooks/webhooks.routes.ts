import express, { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { webhooksController } from './webhooks.controller.js';

export const webhooksRoutes = Router();

// Provider webhooks authenticate by signature, not by session, so no requireAuth.
// LiveKit signs the raw body: it must not be JSON-parsed before verification.
webhooksRoutes.post(
  '/livekit',
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(webhooksController.livekit),
);

// Carrier status callbacks. `/twilio` is kept as an alias so an existing Twilio
// console configuration keeps working after switching SIP_CARRIER.
const carrierWebhook = [
  express.urlencoded({ extended: false }),
  asyncHandler(webhooksController.carrier),
] as const;

webhooksRoutes.post('/carrier', ...carrierWebhook);
webhooksRoutes.post('/twilio', ...carrierWebhook);
