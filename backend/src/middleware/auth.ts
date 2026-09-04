import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { authService } from '../modules/auth/auth.service.js';

const readToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req.cookies as Record<string, string> | undefined)?.voiceops_token;
  return cookie ?? null;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = readToken(req);
    if (!token) throw unauthorized();
    req.user = authService.verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole =
  (...roles: Array<'ADMIN' | 'OPERATOR'>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/**
 * Machine authentication for the LiveKit agent process. The agent is not a user:
 * it presents a shared secret and may only reach the /internal routes.
 */
export const requireAgentKey = (req: Request, _res: Response, next: NextFunction): void => {
  const provided = req.header('x-agent-key');
  if (!provided || provided !== env.AGENT_API_KEY) {
    return next(unauthorized('Invalid agent key'));
  }
  req.isAgent = true;
  next();
};
