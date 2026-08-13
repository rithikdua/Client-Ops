import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { buildActor, requireAuth, requirePasswordSettled } from './auth/permissions';
import { getSession, parseCookie, SESSION_COOKIE } from './auth/sessions';
import type { Db } from './db/index';
import { errorHandler, HttpError } from './http/errors';
import { activityRoutes } from './routes/activity';
import { authRoutes } from './routes/auth';
import { clientRoutes } from './routes/clients';
import { contactRoutes, globalContactRoutes } from './routes/contacts';
import { deliverableRoutes } from './routes/deliverables';
import { documentRoutes } from './routes/documents';
import { followUpRoutes } from './routes/followups';
import { invoiceRoutes } from './routes/invoices';
import { taskRoutes } from './routes/tasks';
import { teamRoutes } from './routes/team';
import { uploadDownloadRoutes, uploadRoutes } from './routes/uploads';

export function createApp(db: Db): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Resolve the session once per request; everything downstream reads req.actor.
  app.use((req, _res, next) => {
    const sessionId = parseCookie(req.cookies?.[SESSION_COOKIE]);
    if (!sessionId) return next();
    const session = getSession(db, sessionId);
    if (!session) return next();
    const actor = buildActor(db, session.user_id, session.preview_as_id);
    if (!actor) return next();
    req.sessionId = session.id;
    req.actor = actor;
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes(db));

  // Downloads are authorized per file against the account it belongs to — a URL
  // is not a capability. Uploading happens under the client it belongs to.
  app.use('/api/uploads', uploadDownloadRoutes(db));

  // Everything below needs a settled password as well as a session. /api/auth is
  // deliberately above this line so signing out and setting a password still work.
  const gate = [requireAuth, requirePasswordSettled];

  app.use('/api/clients', gate, clientRoutes(db));
  app.use('/api/clients/:clientId/contacts', gate, contactRoutes(db));
  app.use('/api/clients/:clientId/invoices', gate, invoiceRoutes(db));
  app.use('/api/clients/:clientId/deliverables', gate, deliverableRoutes(db));
  app.use('/api/clients/:clientId/documents', gate, documentRoutes(db));
  app.use('/api/clients/:clientId/activity', gate, activityRoutes(db));
  app.use('/api/clients/:clientId/tasks', gate, taskRoutes(db));
  app.use('/api/clients/:clientId/uploads', gate, uploadRoutes(db));
  app.use('/api/contacts', gate, globalContactRoutes(db));
  app.use('/api/team', gate, teamRoutes(db));
  app.use('/api/followups', gate, followUpRoutes(db));

  app.use('/api', (_req, _res, next) => {
    next(new HttpError(404, 'Unknown endpoint.'));
  });

  app.use(errorHandler);

  return app;
}
