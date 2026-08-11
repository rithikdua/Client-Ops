import type { Actor } from '../auth/permissions';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware for authenticated requests. */
      actor?: Actor;
      sessionId?: string;
    }
  }
}

export {};
