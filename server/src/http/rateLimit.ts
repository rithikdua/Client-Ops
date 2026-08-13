import type { Request } from 'express';

/**
 * Throttling for authentication endpoints.
 *
 * Without it, a password can simply be guessed until it works: scrypt makes each
 * attempt cost ~100ms, which slows an attacker down but does not stop one.
 *
 * Limits are held in this process's memory. That is honest for a single-instance
 * deployment and useless across several — behind a load balancer, move this to
 * Redis (or the like) so every instance shares one counter. The interface below
 * is deliberately small so that swap is contained.
 */

interface Attempt {
  failures: number;
  /** Epoch ms after which the key may try again. */
  blockedUntil: number;
  /** Epoch ms of the last failure, used to expire idle entries. */
  lastFailure: number;
}

export interface RateLimitPolicy {
  /** Failures allowed before blocking starts. */
  freeAttempts: number;
  /** First block length; doubles with each further failure. */
  baseBlockMs: number;
  /** Ceiling on the block, so a legitimate user is never locked out for hours. */
  maxBlockMs: number;
  /** Idle time after which the counter resets on its own. */
  windowMs: number;
}

export const LOGIN_POLICY: RateLimitPolicy = {
  freeAttempts: 5,
  baseBlockMs: 30_000,
  maxBlockMs: 15 * 60_000,
  windowMs: 60 * 60_000,
};

/**
 * Stricter, because one address hammering the server is more likely an attack
 * than a person mistyping.
 */
export const IP_POLICY: RateLimitPolicy = {
  freeAttempts: 20,
  baseBlockMs: 60_000,
  maxBlockMs: 60 * 60_000,
  windowMs: 60 * 60_000,
};

export class RateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  constructor(private readonly policy: RateLimitPolicy) {}

  /** Seconds the caller must wait, or 0 when it may proceed. */
  retryAfter(key: string, now = Date.now()): number {
    const entry = this.attempts.get(key);
    if (!entry) return 0;
    if (now - entry.lastFailure > this.policy.windowMs) {
      this.attempts.delete(key);
      return 0;
    }
    if (entry.blockedUntil > now) return Math.ceil((entry.blockedUntil - now) / 1000);
    return 0;
  }

  /** Records a failed attempt and returns the seconds now owed. */
  recordFailure(key: string, now = Date.now()): number {
    const existing = this.attempts.get(key);
    const stale = existing && now - existing.lastFailure > this.policy.windowMs;
    const failures = (stale ? 0 : (existing?.failures ?? 0)) + 1;

    let blockedUntil = 0;
    if (failures > this.policy.freeAttempts) {
      const over = failures - this.policy.freeAttempts - 1;
      const block = Math.min(this.policy.baseBlockMs * 2 ** over, this.policy.maxBlockMs);
      blockedUntil = now + block;
    }

    this.attempts.set(key, { failures, blockedUntil, lastFailure: now });
    return blockedUntil ? Math.ceil((blockedUntil - now) / 1000) : 0;
  }

  /** Called after a success, so one good sign-in clears the slate. */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /** Drops entries nobody has touched inside the window. */
  prune(now = Date.now()): void {
    for (const [key, entry] of this.attempts) {
      if (now - entry.lastFailure > this.policy.windowMs) this.attempts.delete(key);
    }
  }

  /** Test/diagnostic helper. */
  get size(): number {
    return this.attempts.size;
  }
}

/**
 * The caller's address.
 *
 * `X-Forwarded-For` is only consulted when TRUST_PROXY is set, because a header
 * the client controls makes per-IP limiting worthless: an attacker would simply
 * send a different one each attempt. Set TRUST_PROXY only when a reverse proxy
 * you control is rewriting it.
 */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first?.trim()) return first.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}
