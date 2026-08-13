import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { envFlag, envNumber, envRaw, envString } from '../src/config';

const NAME = 'CLIENT_OPS_TEST_VALUE';

afterEach(() => {
  delete process.env[NAME];
});

describe('H-05 configuration is validated, and blank means unset', () => {
  test('a blank value falls back to the documented default', () => {
    // The footgun: .env.example ships several values blank as documentation, and
    // `Number(process.env.X ?? default)` never sees the default because '' is not
    // nullish. Number('') is 0, so a copied example file set the upload limit to
    // zero bytes and the reset-link lifetime to zero milliseconds.
    process.env[NAME] = '';
    assert.equal(envNumber(NAME, 10_485_760, { min: 1 }), 10_485_760);
    assert.equal(envString(NAME, 'fallback'), 'fallback');
    assert.equal(envRaw(NAME), undefined);
    assert.equal(envFlag(NAME), false);
  });

  test('whitespace is blank too', () => {
    process.env[NAME] = '   ';
    assert.equal(envNumber(NAME, 42), 42);
    assert.equal(envString(NAME, 'fallback'), 'fallback');
  });

  test('a real value is used, and trimmed', () => {
    process.env[NAME] = ' 2048 ';
    assert.equal(envNumber(NAME, 42), 2048);
    process.env[NAME] = '  /srv/uploads  ';
    assert.equal(envString(NAME, '/tmp'), '/srv/uploads');
  });

  test('an unparseable number stops the process instead of becoming zero', () => {
    process.env[NAME] = 'ten megabytes';
    assert.throws(() => envNumber(NAME, 10), {
      message: /CLIENT_OPS_TEST_VALUE must be a number \(got "ten megabytes"\)/,
    });
  });

  test('a value outside its bounds is refused, and the message names the variable', () => {
    process.env[NAME] = '-1';
    assert.throws(() => envNumber(NAME, 10), { message: /must be between/ });

    process.env[NAME] = '500';
    assert.throws(() => envNumber(NAME, 10 * 1024 * 1024, { min: 1024 * 1024 }), {
      message: /CLIENT_OPS_TEST_VALUE must be between 1048576/,
    });
  });

  test('flags accept the spellings people actually write', () => {
    for (const yes of ['1', 'true', 'TRUE', 'yes', 'on']) {
      process.env[NAME] = yes;
      assert.equal(envFlag(NAME), true, yes);
    }
    for (const no of ['0', 'false', 'no', 'off']) {
      process.env[NAME] = no;
      assert.equal(envFlag(NAME), false, no);
    }
    process.env[NAME] = 'maybe';
    assert.throws(() => envFlag(NAME), { message: /must be true or false/ });
  });

  test('the real settings survive a .env copied straight from the example', async () => {
    // Every value the example file ships blank, set blank here. Importing the
    // modules that read them must produce the documented defaults, not zeros.
    for (const name of [
      'MAX_UPLOAD_BYTES',
      'MAX_UPLOAD_BYTES_PER_USER',
      'MAX_UPLOAD_BYTES_TOTAL',
      'PASSWORD_RESET_TTL_MS',
      'SETUP_TOKEN',
      'SEED_DEMO_DATA',
      'SEED_PASSWORD',
      'APP_ORIGINS',
      'TRUST_PROXY',
    ]) {
      process.env[name] = '';
    }

    const { setupToken } = await import('../src/auth/accounts');
    assert.equal(setupToken(), null, 'a blank SETUP_TOKEN is no token, not an empty one');

    // The reset TTL is a module constant, so read it back through a real grant.
    const { openDb } = await import('../src/db/index');
    const { createUser, createPasswordReset } = await import('../src/auth/accounts');
    const db = openDb(':memory:');
    const id = createUser(db, {
      name: 'Config Check',
      email: 'config-check@phot.ai',
      role: '',
      permission: 'Owner',
      password: 'password-123',
    });
    const grant = createPasswordReset(db, id, id);
    const lifetimeMs = new Date(grant.expiresAt).getTime() - Date.now();
    assert.ok(
      lifetimeMs > 55 * 60_000,
      `a blank PASSWORD_RESET_TTL_MS must mean an hour, got ${Math.round(lifetimeMs / 1000)}s`,
    );
    db.close();

    for (const name of ['MAX_UPLOAD_BYTES', 'MAX_UPLOAD_BYTES_PER_USER', 'MAX_UPLOAD_BYTES_TOTAL']) {
      delete process.env[name];
    }
  });
});
