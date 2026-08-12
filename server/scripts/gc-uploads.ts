/**
 * Deletes uploaded files nothing references any more — abandoned form
 * submissions, and files whose task or document has since been deleted.
 *
 *   npm run uploads:gc            # 24-hour grace period
 *   npm run uploads:gc -- --hours 1
 *
 * Safe to run on a schedule; the grace period keeps it from sweeping a file that
 * is mid-form right now.
 */
import { openDb } from '../src/db/index';
import { collectOrphanUploads } from '../src/routes/uploads';

const hoursArg = process.argv.indexOf('--hours');
const graceHours = hoursArg === -1 ? 24 : Number(process.argv[hoursArg + 1] ?? 24);

const db = openDb();
const { removed, bytes } = collectOrphanUploads(db, graceHours);
db.close();

console.log(
  `[client-ops] removed ${removed} orphaned upload(s), freeing ${(bytes / 1024 / 1024).toFixed(2)} MB ` +
    `(grace period ${graceHours}h)`,
);
