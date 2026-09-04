import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { webhooksService } from './webhooks.service.js';

export const webhooksController = {
  async livekit(req: Request, res: Response): Promise<void> {
    // express.raw() gives the exact bytes LiveKit signed.
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    await webhooksService.handleLiveKit(rawBody, req.header('authorization'));
    // Always 200 once handled: retries would only replay work we already did.
    res.status(200).json({ received: true });
  },

  async carrier(req: Request, res: Response): Promise<void> {
    const params = (req.body ?? {}) as Record<string, unknown>;
    await webhooksService.handleCarrier({
      signature: req.header('x-twilio-signature') ?? req.header('x-plivo-signature-v3'),
      url: `${env.BACKEND_URL}${req.originalUrl}`,
      params,
      rawBody: new URLSearchParams(params as Record<string, string>).toString(),
    });
    // Carriers that expect TwiML-style XML are satisfied by an empty response.
    res.status(200).type('text/xml').send('<Response/>');
  },
};
