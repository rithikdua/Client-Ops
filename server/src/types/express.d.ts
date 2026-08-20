import type { SectionKey } from '../../../src/data/types';
import type { Actor } from '../auth/permissions';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware for authenticated requests. */
      actor?: Actor;
      sessionId?: string;
      /** Set by the upload guard: the section that will own the file. */
      uploadSection?: SectionKey;
    }
  }
}

export {};
