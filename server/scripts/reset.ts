/** Drops every row and re-seeds. Destructive — development use only. */
import { DB_PATH, openDb } from '../src/db/index';
import { resetDatabase, seedDatabase } from '../src/db/seed';

if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DB_RESET) {
  console.error('Refusing to reset a production database. Set ALLOW_DB_RESET=1 to override.');
  process.exit(1);
}

const db = openDb();
resetDatabase(db);
seedDatabase(db);
db.close();
console.log(`[client-ops] database reset and re-seeded: ${DB_PATH}`);
