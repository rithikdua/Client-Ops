import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildCsv, csvCell } from '../../src/lib/csvText';

describe('M-07 CSV formula injection', () => {
  test('a cell that would be evaluated is prefixed', () => {
    // Quoting is not protection: Excel evaluates "=1+1" as a formula.
    assert.equal(csvCell('=1+1'), `"'=1+1"`);
    assert.equal(csvCell('=HYPERLINK("https://evil.example","Click")'), `"'=HYPERLINK(""https://evil.example"",""Click"")"`);
    assert.equal(csvCell('+SUM(A1)'), `"'+SUM(A1)"`);
    assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
    assert.equal(csvCell('-2+3'), `"'-2+3"`);
    // DDE in older Excel builds.
    assert.equal(csvCell('|cmd|/c calc'), `"'|cmd|/c calc"`);
  });

  test('leading whitespace does not smuggle a formula through', () => {
    // The spreadsheet trims before deciding, so the check has to as well.
    assert.equal(csvCell('   =1+1'), `"'   =1+1"`);
    assert.equal(csvCell('\t=1+1'), `"'\t=1+1"`);
  });

  test('a client name is exported as typed', () => {
    // The realistic case: a name someone put in the workspace.
    assert.equal(csvCell('=cmd|" /C calc"!A0'), `"'=cmd|"" /C calc""!A0"`);
    assert.equal(csvCell('Northwind Logistics'), '"Northwind Logistics"');
    assert.equal(csvCell('Fernandes & Co.'), '"Fernandes & Co."');
  });

  test('ordinary values are untouched', () => {
    assert.equal(csvCell('INV-2026-014'), '"INV-2026-014"');
    assert.equal(csvCell('Aug 6, 2026'), '"Aug 6, 2026"');
    assert.equal(csvCell('Partially Paid'), '"Partially Paid"');
    assert.equal(csvCell('₹1,18,000'), '"₹1,18,000"');
  });

  test('numbers stay numbers, so the export is still summable', () => {
    assert.equal(csvCell(118000), '"118000"');
    assert.equal(csvCell(-500), '"-500"');
    assert.equal(csvCell('-500'), '"-500"');
    assert.equal(csvCell('-500.25'), '"-500.25"');
    assert.equal(csvCell(0), '"0"');
  });

  test('quotes are still doubled', () => {
    assert.equal(csvCell('He said "hello"'), '"He said ""hello"""');
  });

  test('the file opens as UTF-8 in Excel', () => {
    const csv = buildCsv(['Client', 'Amount'], [['Fernandes & Co.', '₹1,18,000']]);
    assert.ok(csv.startsWith('\ufeff'), 'a BOM is what stops Excel mangling the currency symbol');
    assert.equal(csv.split('\r\n').length, 2);
    assert.match(csv, /"Fernandes & Co\.","₹1,18,000"/);
  });
});
