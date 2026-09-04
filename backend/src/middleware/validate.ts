import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Controllers read `req.validated`, never `req.body`, so a handler can never
 * reach unvalidated input.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validated = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
      };
      next();
    } catch (error) {
      next(error);
    }
  };

export type Infer<T extends ZodTypeAny> = z.infer<T>;
