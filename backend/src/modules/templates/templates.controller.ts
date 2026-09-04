import type { Request, Response } from 'express';
import { templatesService } from './templates.service.js';
import type { CreateTemplateInput, UpdateTemplateInput } from './templates.validation.js';

export const templatesController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ data: await templatesService.list() });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await templatesService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as CreateTemplateInput;
    res.status(201).json(await templatesService.create(body));
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as UpdateTemplateInput;
    res.status(200).json(await templatesService.update(id, body));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    await templatesService.remove(id);
    res.status(204).send();
  },

  async duplicate(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(201).json(await templatesService.duplicate(id));
  },

  async preview(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = (req.validated?.body ?? {}) as { variables?: Record<string, string> };
    const template = await templatesService.getById(id);
    res.status(200).json(templatesService.preview(template, body.variables ?? {}));
  },
};
