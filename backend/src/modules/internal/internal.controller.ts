import type { Request, Response } from 'express';
import { retrievalService } from '../knowledge-base/retrieval.service.js';
import { internalService } from './internal.service.js';
import type {
  CallEventInput,
  CallResultInput,
  RetrieveInput,
} from './internal.validation.js';

export const internalController = {
  async callContext(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await internalService.getCallContext(id));
  },

  /** Query analysis (classification + step-back) and retrieval in one round trip. */
  async retrieve(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as RetrieveInput;
    const result = await retrievalService.retrieve(body);
    res.status(200).json({
      grounded: result.grounded,
      passages: result.passages,
      context: retrievalService.formatPassages(result.passages),
      analysis: result.analysis,
    });
  },

  async saveResult(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as CallResultInput;
    res.status(200).json(await internalService.saveResult(id, body));
  },

  async recordEvent(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as CallEventInput;
    await internalService.recordEvent(id, body);
    res.status(202).json({ accepted: true });
  },
};
