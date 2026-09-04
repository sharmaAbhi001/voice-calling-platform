import type { Request, Response } from 'express';
import { callsService } from './calls.service.js';
import type { CreateCallInput, ListCallsQuery } from './calls.validation.js';

export const callsController = {
  async list(req: Request, res: Response): Promise<void> {
    const filters = req.validated?.query as ListCallsQuery;
    res.status(200).json(await callsService.list(filters));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await callsService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as CreateCallInput;
    res.status(201).json(await callsService.createCall(body, req.user?.id ?? null));
  },

  async end(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await callsService.endCall(id, req.user?.id ?? null));
  },

  async recording(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await callsService.getRecordingUrl(id));
  },

  async stats(_req: Request, res: Response): Promise<void> {
    res.status(200).json(await callsService.stats());
  },
};
