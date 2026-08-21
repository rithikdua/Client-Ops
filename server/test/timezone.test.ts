import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

/**
 * These run under whatever TZ the suite was started with. The interesting cases
 * are the ones where the host zone and the workspace zone disagree, so each test
 * states both explicitly rather than relying on the machine's setting.
 */

/** The old frontend implementation, kept here as the thing being guarded against. */
function brokenTodayISO(now: Date): string {
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return localMidnight.toISOString().slice(0, 10);
}

function todayISOIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

describe('M-01 a calendar day is not a UTC conversion', () => {
  test('the old implementation returned yesterday east of Greenwich', () => {
    // 20 August, 10:00 in Kolkata — unambiguously the 20th for that team.
    const instant = new Date('2026-08-20T04:30:00Z');
    assert.equal(todayISOIn('Asia/Kolkata', instant), '2026-08-20');

    // What the form default used to produce for a browser set to IST: local
    // midnight (2026-08-20T00:00+05:30) is 2026-08-19T18:30Z, and slicing the
    // ISO string takes the UTC date.
    const istMidnightAsUtc = new Date('2026-08-19T18:30:00Z');
    assert.equal(istMidnightAsUtc.toISOString().slice(0, 10), '2026-08-19');
    assert.notEqual(
      istMidnightAsUtc.toISOString().slice(0, 10),
      todayISOIn('Asia/Kolkata', instant),
      'the default date on every form was a day behind',
    );
  });

  test('every zone ahead of UTC lost a day at its own midnight', () => {
    // For each zone, the instant that *is* local midnight on 20 August. The old
    // code produced exactly this string, and every one of them is the 19th.
    for (const [zone, midnightUtc] of [
      ['Asia/Kolkata', '2026-08-19T18:30:00Z'],
      ['Asia/Tokyo', '2026-08-19T15:00:00Z'],
      ['Australia/Sydney', '2026-08-19T14:00:00Z'],
      ['Europe/Berlin', '2026-08-19T22:00:00Z'],
    ] as const) {
      const instant = new Date(midnightUtc);
      assert.equal(todayISOIn(zone, instant), '2026-08-20', `${zone} is on the 20th`);
      assert.equal(
        instant.toISOString().slice(0, 10),
        '2026-08-19',
        `${zone}: the old conversion reports the 19th`,
      );
    }
    // West of UTC the same code is right, which is why this survived review by
    // anyone working in the Americas.
    const nycMidnight = new Date('2026-08-20T04:00:00Z');
    assert.equal(todayISOIn('America/New_York', nycMidnight), '2026-08-20');
    assert.equal(nycMidnight.toISOString().slice(0, 10), '2026-08-20');
  });

  test('every hour of a UTC day maps to the right IST date', () => {
    for (let hour = 0; hour < 24; hour++) {
      const instant = new Date(Date.UTC(2026, 7, 20, hour, 0, 0));
      // IST is UTC+5:30, so 18:30 UTC onward is already tomorrow in Kolkata.
      const expected = hour < 19 ? '2026-08-20' : '2026-08-21';
      assert.equal(todayISOIn('Asia/Kolkata', instant), expected, `${hour}:00 UTC`);
    }
  });

  test('the old implementation is wrong whenever the host is east of UTC', () => {
    const sample = new Date(2026, 7, 20);
    const eastOfUtc = sample.getTimezoneOffset() < 0;
    // Stated either way, so the test says something under every TZ the suite
    // might run in rather than silently skipping.
    assert.equal(
      brokenTodayISO(sample) === '2026-08-20',
      !eastOfUtc,
      eastOfUtc
        ? 'east of UTC the old code must lose a day — that is the bug'
        : 'west of or at UTC the old code happened to be right',
    );
  });
});

describe('M-02 the server and the browser measure the same day', () => {
  test('the server stamps activity in the workspace zone, not the host zone', async () => {
    process.env.WORKSPACE_TIMEZONE = 'Asia/Kolkata';
    const { todayISO, WORKSPACE_TIMEZONE } = await import('../src/domain/activity');
    assert.equal(WORKSPACE_TIMEZONE, 'Asia/Kolkata');
    // Whatever the host is set to, this is the Kolkata date.
    assert.equal(todayISO(), todayISOIn('Asia/Kolkata', new Date()));
  });

  test('an impossible timezone stops the process instead of silently defaulting', async () => {
    const { envTimezone } = await import('../src/config');
    process.env.CLIENT_OPS_TZ_TEST = 'Mars/Olympus_Mons';
    assert.throws(() => envTimezone('CLIENT_OPS_TZ_TEST', 'Asia/Kolkata'), {
      message: /must be an IANA timezone/,
    });
    delete process.env.CLIENT_OPS_TZ_TEST;
  });

  test('the snapshot carries the timezone so the browser can adopt it', async () => {
    const { openDb } = await import('../src/db/index');
    const { seedDemoWorkspace } = await import('../src/db/seed');
    const { buildActor } = await import('../src/auth/permissions');
    const { buildSnapshot } = await import('../src/domain/snapshot');

    const db = openDb(':memory:');
    seedDemoWorkspace(db, { password: 'demo-pass-2026!' });
    const owner = db.prepare("SELECT id FROM users WHERE email = 'priya@phot.ai'").get() as {
      id: string;
    };
    const snapshot = buildSnapshot(db, buildActor(db, owner.id, null)!);
    assert.equal(snapshot.workspace.timezone, 'Asia/Kolkata');
    db.close();
  });
});
