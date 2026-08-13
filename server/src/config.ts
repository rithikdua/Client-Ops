/**
 * Reading configuration out of the environment, with the empty string treated as
 * "not set" and anything unparseable treated as a deployment error.
 *
 * The bug this exists to prevent was in this repository's own `.env.example`,
 * which ships several values blank as documentation:
 *
 *   MAX_UPLOAD_BYTES=
 *   PASSWORD_RESET_TTL_MS=
 *
 * `Number(process.env.X ?? default)` does not see a default there — an empty
 * string is not nullish, and `Number('')` is **0**. So copying the example file,
 * exactly as instructed, silently set the upload limit to zero bytes (no file can
 * ever be attached) and the password-reset lifetime to zero milliseconds (every
 * reset link expired the instant it was minted). Both would have looked like
 * application bugs, not configuration.
 *
 * A wrong value now stops the process at startup with a message naming the
 * variable, which is the only moment anyone is watching.
 */

class ConfigError extends Error {
  constructor(message: string) {
    super(`[client-ops] configuration error: ${message}`);
    this.name = 'ConfigError';
  }
}

/** The raw value, trimmed, with blank and whitespace-only treated as unset. */
export function envRaw(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function envString(name: string, fallback: string): string {
  return envRaw(name) ?? fallback;
}

/**
 * A number, or the fallback when unset. Refuses anything that is not a finite
 * number, and anything outside the given bounds — a negative size limit or a
 * zero-length token lifetime is a mistake, not a configuration choice.
 */
export function envNumber(
  name: string,
  fallback: number,
  opts: { min?: number; max?: number } = {},
): number {
  const raw = envRaw(name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be a number (got "${raw}")`);
  }
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = opts;
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max} (got ${value})`);
  }
  return value;
}

/** True for 1/true/yes, false for 0/false/no or unset. Anything else is an error. */
export function envFlag(name: string): boolean {
  const raw = envRaw(name)?.toLowerCase();
  if (raw === undefined) return false;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new ConfigError(`${name} must be true or false (got "${raw}")`);
}
