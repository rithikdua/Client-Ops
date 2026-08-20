import { createHash } from 'node:crypto';
import { envFlag, envNumber } from '../config';
import { HttpError } from '../http/errors';

/**
 * What counts as an acceptable password.
 *
 * The previous rule was "at least 8 characters", which accepts `password`,
 * `12345678`, and the account holder's own name. Length alone stopped being a
 * useful proxy for strength once offline cracking became cheap: the passwords
 * that actually fall are the guessable ones, not the short ones.
 *
 * The rules below are ordered by how often they catch something real, and each
 * failure says exactly what is wrong — a policy that only says "not strong
 * enough" gets satisfied by adding an exclamation mark to the end.
 */

export const MIN_PASSWORD_LENGTH = envNumber('MIN_PASSWORD_LENGTH', 12, { min: 8, max: 200 });

/**
 * The passwords people actually choose. Not a dictionary — a list this size is
 * for catching the handful that appear in every breach corpus, plus the ones
 * specific to this product that a generic list would never contain.
 */
const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password123',
    'passw0rd',
    'p@ssword',
    'p@ssw0rd',
    'qwerty',
    'qwerty123',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    '123456',
    '1234567',
    '12345678',
    '123456789',
    '1234567890',
    '12345678910',
    '111111',
    '000000',
    'abc123',
    'abcd1234',
    'a1b2c3d4',
    'iloveyou',
    'admin',
    'admin123',
    'administrator',
    'welcome',
    'welcome1',
    'welcome123',
    'letmein',
    'letmein123',
    'monkey',
    'dragon',
    'sunshine',
    'princess',
    'football',
    'baseball',
    'superman',
    'trustno1',
    'starwars',
    'whatever',
    'changeme',
    'changeit',
    'secret',
    'default',
    'temporary',
    'temp1234',
    'test1234',
    'testing123',
    'india123',
    'bharat123',
    'mumbai123',
    'delhi123',
    // The ones a generic list will never have, and this workspace will.
    'photai',
    'photai123',
    'phot.ai',
    'clientops',
    'clientops123',
    'photaiclientops',
  ].map((p) => p.toLowerCase()),
);

/** Characters people substitute to smuggle a common word past a checker. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** `P@ssw0rd!` and `password` are the same guess. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

/** Runs like `abcdefgh` or `87654321`, in either direction. */
function isSequential(value: string): boolean {
  if (value.length < 6) return false;
  let ascending = 0;
  let descending = 0;
  for (let i = 1; i < value.length; i++) {
    const step = value.charCodeAt(i) - value.charCodeAt(i - 1);
    ascending = step === 1 ? ascending + 1 : 0;
    descending = step === -1 ? descending + 1 : 0;
    if (ascending >= 5 || descending >= 5) return true;
  }
  return false;
}

/** Words from the person's own identity, which are the first thing guessed. */
function personalTerms(identity: { email?: string; name?: string }): string[] {
  const terms: string[] = [];
  const local = identity.email?.split('@')[0] ?? '';
  const domain = identity.email?.split('@')[1]?.split('.')[0] ?? '';
  for (const part of [local, domain, identity.name ?? '']) {
    for (const word of part.split(/[^A-Za-z0-9]+/)) {
      // Two-letter fragments would reject almost everything.
      if (word.length >= 4) terms.push(normalise(word));
    }
  }
  return terms.filter(Boolean);
}

export interface PasswordIdentity {
  email?: string;
  name?: string;
}

/**
 * Returns the reason a password is unacceptable, or null if it is fine.
 * Separated from the throwing wrapper so it can be tested exhaustively and
 * reused by the CLI.
 */
export function passwordProblem(password: string, identity: PasswordIdentity = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  // Long passwords are good; unbounded ones are a hashing cost someone else
  // chooses for us.
  if (password.length > 200) {
    return 'Passwords must be 200 characters or fewer.';
  }

  const flat = normalise(password);

  if (new Set(password).size < 5) {
    return 'That password repeats too few characters to be hard to guess.';
  }
  if (isSequential(password)) {
    return 'That password is a run of sequential characters, which is among the first things guessed.';
  }
  if (COMMON_PASSWORDS.has(flat) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That is one of the most commonly used passwords, so it is tried first.';
  }
  // A common password with anything bolted on is still that password.
  for (const common of COMMON_PASSWORDS) {
    if (common.length >= 6 && flat.includes(common)) {
      return `That password contains "${common}", which is among the first things guessed.`;
    }
  }
  for (const term of personalTerms(identity)) {
    if (term.length >= 4 && flat.includes(term)) {
      return 'That password contains your own name or email address, which is public information.';
    }
  }
  return null;
}

/**
 * Optional check against Have I Been Pwned, off unless PASSWORD_BREACH_CHECK is
 * set. Only the first five characters of the SHA-1 hash ever leave this process
 * (k-anonymity), so the password itself is not disclosed — but it is still an
 * outbound request, which is a deployment decision rather than ours to make.
 *
 * Fails **open**: if the service is unreachable, the password is accepted and
 * the failure is logged. A password checker that blocks sign-in when a third
 * party is down has turned a nice-to-have into an outage.
 */
export async function breachedPasswordCount(password: string): Promise<number> {
  if (!envFlag('PASSWORD_BREACH_CHECK')) return 0;

  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'add-padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return 0;
    const body = await response.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix) return Number(count) || 0;
    }
    return 0;
  } catch (err) {
    console.warn(
      '[client-ops] breach check unavailable, password accepted without it:',
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

/** Throws a 400 naming the problem, or returns quietly. */
export function assertAcceptablePassword(password: string, identity: PasswordIdentity = {}): void {
  const problem = passwordProblem(password, identity);
  if (problem) throw new HttpError(400, problem);
}

/** The same check plus the optional breach lookup, for the request paths. */
export async function assertAcceptablePasswordAsync(
  password: string,
  identity: PasswordIdentity = {},
): Promise<void> {
  assertAcceptablePassword(password, identity);
  const breaches = await breachedPasswordCount(password);
  if (breaches > 0) {
    throw new HttpError(
      400,
      `That password has appeared in ${breaches.toLocaleString('en-US')} known data breaches. Choose one you have not used elsewhere.`,
    );
  }
}
