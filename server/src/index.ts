import { createApp } from './app';
import { DB_PATH, openDb } from './db/index';
import { isSeeded, seedDatabase } from './db/seed';

const PORT = Number(process.env.PORT ?? 8787);

const db = openDb();
const freshDatabase = !isSeeded(db);
seedDatabase(db);

const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`[client-ops] API listening on http://localhost:${PORT}`);
  console.log(`[client-ops] database: ${DB_PATH}`);
  if (freshDatabase) {
    console.log(
      '[client-ops] seeded demo accounts (password "demo1234" unless SEED_PASSWORD was set):',
    );
    console.log('[client-ops]   priya@phot.ai  Owner  · full access');
    console.log('[client-ops]   daniel@phot.ai Editor · no invoice access');
    console.log('[client-ops]   maya@phot.ai   Editor · no documents/follow-ups');
    console.log('[client-ops]   tom@phot.ai    Viewer · read-only');
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
