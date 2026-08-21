import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MIN_PASSWORD_LENGTH,
  passwordProblem,
  assertAcceptablePassword,
} from '../src/auth/passwordPolicy';

describe('H-10 the password policy rejects what is actually guessed', () => {
  test('the minimum is longer than the old eight characters', () => {
    assert.ok(MIN_PASSWORD_LENGTH >= 12);
    assert.ok(passwordProblem('short1!')?.includes(`${MIN_PASSWORD_LENGTH} characters`));
  });

  test('the passwords that top every breach list are refused', () => {
    for (const bad of [
      'password',
      'password123',
      'Password1234',
      'qwertyuiop12',
      'letmein12345',
      'welcome12345',
      'iloveyou1234',
      'changeme1234',
      'admin1234567',
    ]) {
      assert.ok(passwordProblem(bad), `${bad} should be refused`);
    }
  });

  test('character substitution does not smuggle a common word past', () => {
    // The whole point of a blacklist is defeated if P@ssw0rd walks through it.
    for (const bad of ['P@ssw0rd!!!!', 'p4ssw0rd1234', 'L3tm31n12345', 'Adm1n1234567']) {
      const problem = passwordProblem(bad);
      assert.ok(problem, `${bad} should be refused`);
    }
  });

  test('this workspace has its own guessable words', () => {
    // A generic list has never heard of these, and they are the first thing an
    // attacker who knows where they are tries.
    assert.ok(passwordProblem('photai-2026!!'));
    assert.ok(passwordProblem('ClientOps2026'));
  });

  test('a password made of the account holder is refused', () => {
    const identity = { email: 'priya.shah@northwind.example', name: 'Priya Shah' };
    assert.match(
      passwordProblem('PriyaShah2026!', identity) ?? '',
      /your own name or email/,
    );
    assert.match(
      passwordProblem('priya-shah-1234', identity) ?? '',
      /your own name or email/,
    );
    // The same password is fine for somebody else.
    assert.equal(passwordProblem('PriyaShah2026!', { email: 'raj@example.com', name: 'Raj' }), null);
  });

  test('runs and repeats are refused however long they are', () => {
    assert.match(passwordProblem('abcdefghijklmnop') ?? '', /sequential/);
    assert.match(passwordProblem('9876543210987654') ?? '', /sequential/);
    assert.match(passwordProblem('aaaaaaaaaaaaaaaa') ?? '', /repeats too few/);
    assert.match(passwordProblem('ababababababab') ?? '', /repeats too few/);
  });

  test('good passwords are accepted, including passphrases with spaces', () => {
    for (const good of [
      'correct horse battery staple',
      'Tr0ub4dor&3xkcd',
      'demo-pass-2026!',
      'ferry-lantern-oak-92',
      'मेरा-पासवर्ड-२०२६', // non-ASCII should not be punished
    ]) {
      assert.equal(passwordProblem(good), null, `${good} should be accepted`);
    }
  });

  test('the reason is specific, so the fix is obvious', () => {
    // "Not strong enough" gets answered with an exclamation mark on the end.
    assert.match(passwordProblem('password1234') ?? '', /commonly used|contains "password"/);
    assert.match(passwordProblem('abc') ?? '', /at least \d+ characters/);
  });

  test('an unreasonably long password is refused rather than hashed', () => {
    assert.match(passwordProblem('x9k2m'.repeat(60)) ?? '', /200 characters or fewer/);
  });

  test('the throwing wrapper reports 400, not 500', () => {
    assert.throws(() => assertAcceptablePassword('password'), { status: 400 });
    assert.doesNotThrow(() => assertAcceptablePassword('ferry-lantern-oak-92'));
  });
});
