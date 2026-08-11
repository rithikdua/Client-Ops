import type { GstMode } from '../../src/data/types';

/**
 * All money is integer minor units (paise/cents). Keeping it integral is what
 * makes GST splits and part-payments add up exactly.
 */
export type Minor = number;

export function toMinor(majorUnits: number): Minor {
  return Math.round(majorUnits * 100);
}

export function fromMinor(minor: Minor): number {
  return minor / 100;
}

/**
 * Splits a base amount into GST and gross total, in minor units.
 *
 * - `excluded`: GST is added on top of the base, so total > base.
 * - `included`: the base already contains GST, so total === base and we work
 *   the tax back out of it.
 */
export function gstBreakdown(
  baseMinor: Minor,
  gstPercent: number,
  mode: GstMode,
): { base: Minor; gst: Minor; total: Minor } {
  const base = Math.round(baseMinor || 0);
  const pct = gstPercent || 0;

  if (mode === 'included') {
    // base = net + net*pct/100  =>  net = base * 100 / (100 + pct)
    const net = Math.round((base * 100) / (100 + pct));
    return { base, gst: base - net, total: base };
  }

  const gst = Math.round((base * pct) / 100);
  return { base, gst, total: base + gst };
}
