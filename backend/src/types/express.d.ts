import type { AuthenticatedUser } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by the validate() middleware. */
      validated?: { body?: unknown; query?: unknown; params?: unknown };
      /** Populated by requireAuth(). */
      user?: AuthenticatedUser;
      /** Populated by requireAgentKey() for machine-to-machine calls. */
      isAgent?: boolean;
    }
  }
}

export {};
