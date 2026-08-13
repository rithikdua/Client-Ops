import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LOGIN_POLICY, RateLimiter, type RateLimitPolicy } from '../src/http/rateLimit';

const POLICY: RateLimitPolicy = {
  freeAttempts: 3,
  baseBlockMs: 1000,
  maxBlockMs: 8000,
  windowMs: 60_000,
};

describe('rate limiting', () => {
  test('allows the free attempts, then starts blocking', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;

    for (let i = 1; i <= POLICY.freeAttempts; i++) {
      assert.equal(limiter.retryAfter('a', now), 0, `attempt ${i} should be allowed`);
      assert.equal(limiter.recordFailure('a', now), 0, `attempt ${i} should not block yet`);
    }
    // The next failure crosses the line.
    assert.ok(limiter.recordFailure('a', now) > 0);
    assert.ok(limiter.retryAfter('a', now) > 0, 'now blocked');
  });

  test('each further failure doubles the wait, up to the ceiling', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;
    for (let i = 0; i < POLICY.freeAttempts; i++) limiter.recordFailure('a', now);

    assert.equal(limiter.recordFailure('a', now), 1, '1s');
    assert.equal(limiter.recordFailure('a', now), 2, 'doubles to 2s');
    assert.equal(limiter.recordFailure('a', now), 4, 'then 4s');
    assert.equal(limiter.recordFailure('a', now), 8, 'then 8s');
    assert.equal(limiter.recordFailure('a', now), 8, 'and stops at the ceiling');
  });

  test('the block expires on its own', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;
    for (let i = 0; i <= POLICY.freeAttempts; i++) limiter.recordFailure('a', now);

    assert.ok(limiter.retryAfter('a', now) > 0);
    assert.equal(limiter.retryAfter('a', now + 1500), 0, 'clear once the wait has passed');
  });

  test('keys are independent, so one account cannot block another', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;
    for (let i = 0; i <= POLICY.freeAttempts + 3; i++) limiter.recordFailure('victim', now);

    assert.ok(limiter.retryAfter('victim', now) > 0);
    assert.equal(limiter.retryAfter('someone-else', now), 0);
  });

  test('a success clears the counter', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;
    for (let i = 0; i <= POLICY.freeAttempts; i++) limiter.recordFailure('a', now);
    assert.ok(limiter.retryAfter('a', now) > 0);

    limiter.reset('a');
    assert.equal(limiter.retryAfter('a', now), 0);
    // And the escalation starts over rather than resuming where it left off.
    for (let i = 0; i < POLICY.freeAttempts; i++) {
      assert.equal(limiter.recordFailure('a', now), 0);
    }
  });

  test('an idle counter expires so a typo today is forgotten tomorrow', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;
    for (let i = 0; i < POLICY.freeAttempts; i++) limiter.recordFailure('a', now);

    const later = now + POLICY.windowMs + 1;
    assert.equal(limiter.retryAfter('a', later), 0);
    // The next failure is treated as the first, not the fourth.
    assert.equal(limiter.recordFailure('a', later), 0);
  });

  test('pruning keeps the map from growing without bound', () => {
    const limiter = new RateLimiter(POLICY);
    const now = 1_000_000;
    for (let i = 0; i < 50; i++) limiter.recordFailure('key-' + i, now);
    assert.equal(limiter.size, 50);

    limiter.prune(now + POLICY.windowMs + 1);
    assert.equal(limiter.size, 0);
  });

  test('the shipped login policy blocks well before a password could be guessed', () => {
    const limiter = new RateLimiter(LOGIN_POLICY);
    let now = 0;
    let attempts = 0;

    // Simulate an attacker always waiting exactly as long as told to.
    for (let i = 0; i < 40; i++) {
      const wait = limiter.retryAfter('target', now);
      if (wait > 0) now += wait * 1000;
      limiter.recordFailure('target', now);
      attempts++;
    }
    const elapsedHours = now / 3_600_000;
    assert.ok(attempts === 40);
    assert.ok(
      elapsedHours > 2,
      `40 guesses should cost hours, not seconds (took ${elapsedHours.toFixed(1)}h)`,
    );
  });
});
