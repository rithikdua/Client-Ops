/**
 * Creates a real account from the command line.
 *
 *   npm run create-user -- --name "Rithik Dua" --email rithik@example.com
 *   npm run create-user -- --name "Ops Bot" --email ops@x.com --permission Editor
 *
 * The password is prompted for (not echoed) so it stays out of shell history.
 * Set NEW_USER_PASSWORD to run non-interactively, e.g. in a provisioning script.
 */
import { createInterface } from 'node:readline';
import { PERMISSION_OPTIONS } from '../../src/data/options';
import type { Permission } from '../../src/data/types';
import { createUser, MIN_PASSWORD_LENGTH } from '../src/auth/accounts';
import { DB_PATH, openDb } from '../src/db/index';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
    process.stdout.write(question);
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY) stdin.setRawMode?.(true);

    const ENTER = [0x0a, 0x0d, 0x04]; // newline, carriage return, EOT
    const CTRL_C = 0x03;
    const BACKSPACE = [0x08, 0x7f];

    let value = '';
    const onData = (chunk: Buffer) => {
      const code = chunk[0];
      if (ENTER.includes(code)) {
        if (stdin.isTTY) stdin.setRawMode?.(wasRaw);
        stdin.off('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(value);
        return;
      }
      if (code === CTRL_C) {
        process.stdout.write('\n');
        process.exit(130);
      }
      if (BACKSPACE.includes(code)) {
        value = value.slice(0, -1);
        return;
      }
      value += chunk.toString('utf8');
    };
    stdin.on('data', onData);
  });
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

const name = arg('name') ?? (await ask('Full name: '));
const email = arg('email') ?? (await ask('Email: '));
const role = arg('role') ?? '';
const permission = (arg('permission') ?? 'Owner') as Permission;

if (!PERMISSION_OPTIONS.includes(permission)) {
  console.error(`--permission must be one of: ${PERMISSION_OPTIONS.join(', ')}`);
  process.exit(1);
}

let password = arg('password') ?? process.env.NEW_USER_PASSWORD ?? '';
if (!password) {
  password = await promptHidden(`Password (min ${MIN_PASSWORD_LENGTH} chars): `);
  const again = await promptHidden('Confirm password: ');
  if (password !== again) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}

const db = openDb();
try {
  createUser(db, { name, email, role, permission, password });
  console.log(`\nCreated ${permission.toLowerCase()} account for ${email}`);
  console.log(`Database: ${DB_PATH}`);
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  db.close();
}
