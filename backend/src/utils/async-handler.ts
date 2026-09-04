import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Forwards rejected promises to the express error middleware. */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
