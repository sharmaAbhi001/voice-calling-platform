import type { Request, Response } from 'express';
import { contactsService } from './contacts.service.js';
import type {
  CreateContactInput,
  ImportContactsInput,
  ListContactsQuery,
  UpdateContactInput,
} from './contacts.validation.js';

export const contactsController = {
  async list(req: Request, res: Response): Promise<void> {
    const filters = req.validated?.query as ListContactsQuery;
    res.status(200).json(await contactsService.list(filters));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    res.status(200).json(await contactsService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as CreateContactInput;
    res.status(201).json(await contactsService.create(body));
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.validated?.params as { id: string };
    const body = req.validated?.body as UpdateContactInput;
    res.status(200).json(await contactsService.update(id, body));
  },

  async importCsv(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as ImportContactsInput;
    res.status(200).json(await contactsService.importCsv(body.csv));
  },
};
