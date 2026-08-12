import { createApp } from './app';
import { needsSetup } from './auth/accounts';
import { DB_PATH, openDb } from './db/index';
import { seedDemoWorkspace } from './db/seed';

const PORT = Number(process.env.PORT ?? 8787);
/** Demo data is opt-in; a real deployment starts empty. */
const WANT_DEMO_DATA = /^(1|true|yes)$/i.test(process.env.SEED_DEMO_DATA ?? '');

const db = openDb();
if (WANT_DEMO_DATA) seedDemoWorkspace(db);

const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`[client-ops] API listening on http://localhost:${PORT}`);
  console.log(`[client-ops] database: ${DB_PATH}`);

  if (needsSetup(db)) {
    console.log('[client-ops] no accounts yet — open the app to create the first Owner account,');
    console.log('[client-ops] or run: npm run create-user');
    console.log('[client-ops] (to explore the sample workspace instead: npm run db:demo)');
  } else if (WANT_DEMO_DATA) {
    console.log(
      `[client-ops] demo workspace loaded — sign in as priya@phot.ai with the password "${
        process.env.SEED_PASSWORD ?? 'demo1234'
      }"`,
    );
  }
});

function shutdown(signal: string) {
  console.log(`[client-ops] ${signal} received, closing.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
