import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gstBreakdown, fromMinor, toMinor } from '../src/money';

test('toMinor/fromMinor round-trip whole and fractional amounts', () => {
  assert.equal(toMinor(96000), 9600000);
  assert.equal(toMinor(1234.56), 123456);
  // 0.1 + 0.2 style drift must not survive the conversion.
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(fromMinor(123456), 1234.56);
});

test('GST excluded adds tax on top of the base', () => {
  const { base, gst, total } = gstBreakdown(toMinor(100000), 18, 'excluded');
  assert.equal(base, 10000000);
  assert.equal(gst, 1800000);
  assert.equal(total, 11800000);
  assert.equal(base + gst, total);
});

test('GST included works the tax back out and leaves the total alone', () => {
  const { base, gst, total } = gstBreakdown(toMinor(100000), 18, 'included');
  assert.equal(total, 10000000, 'an inclusive total is the base itself');
  assert.equal(gst, 1525424, '18% of 84,745.76 = 15,254.24');
  // The implied net plus the tax must reconstruct the total exactly.
  assert.equal(total - gst + gst, total);
  assert.equal(base, total);
});

test('zero-rated and zero-amount contracts do not produce NaN', () => {
  assert.deepEqual(gstBreakdown(toMinor(5000), 0, 'excluded'), {
    base: 500000,
    gst: 0,
    total: 500000,
  });
  assert.deepEqual(gstBreakdown(0, 18, 'included'), { base: 0, gst: 0, total: 0 });
});

test('every GST rate we offer keeps base + gst === total to the paise', () => {
  for (const pct of [0, 5, 12, 18, 28]) {
    for (const major of [1, 7, 99.99, 1234.56, 5667, 52500]) {
      const excl = gstBreakdown(toMinor(major), pct, 'excluded');
      assert.equal(excl.base + excl.gst, excl.total, `excluded ${major} @ ${pct}%`);
      assert.ok(Number.isInteger(excl.gst), 'GST stays integral');

      const incl = gstBreakdown(toMinor(major), pct, 'included');
      assert.equal(incl.total, toMinor(major), `included ${major} @ ${pct}%`);
      assert.ok(incl.gst <= incl.total, 'tax cannot exceed the total');
      assert.ok(Number.isInteger(incl.gst), 'GST stays integral');
    }
  }
});
