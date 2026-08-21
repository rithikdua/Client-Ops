/**
 * Empties the database. Destructive — development use only.
 *
 *   npm run db:reset          # wipe, leaving an empty workspace (first-run setup)
 *   npm run db:demo           # wipe and load the sample workspace
 */
import { DB_PATH, openDb } from '../src/db/index';
import { resetDatabase, seedDemoWorkspace } from '../src/db/seed';

const withDemo = process.argv.includes('--demo');

if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DB_RESET) {
  console.error('Refusing to reset a production database. Set ALLOW_DB_RESET=1 to override.');
  process.exit(1);
}

const db = openDb();
resetDatabase(db);
if (withDemo) seedDemoWorkspace(db);
db.close();

console.log(`[client-ops] database emptied: ${DB_PATH}`);
console.log(
  withDemo
    ? '[client-ops] sample workspace loaded — sign in as priya@phot.ai / demo-pass-2026!'
    : '[client-ops] open the app to create your account, or run: npm run create-user',
);
