/**
 * Turning data into CSV text, with no browser involved — the download plumbing
 * lives in `csv.ts`. Kept separate so the escaping can be tested directly under
 * Node, which is where it belongs: this is the part that has to be right.
 */

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than text.
 * `|` is included because older Excel builds parse `|command` as DDE, and the
 * control characters because they are stripped before evaluation, so a cell can
 * hide its own leading `=`.
 */
const FORMULA_START = /^[=+\-@|\t\r]/;

/** A cell that is plainly a number, which no spreadsheet will misread. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Escapes one cell for CSV, and stops a spreadsheet from executing it.
 *
 * Quoting alone does not help: Excel and Sheets happily evaluate `"=1+1"`, and
 * `=HYPERLINK`, `=WEBSERVICE` and DDE payloads have all been used to exfiltrate
 * data or run commands from an innocent-looking export. The values here are not
 * ours — a client name, an invoice number — so a colleague opening the file is
 * the one who pays for trusting them.
 *
 * The fix is a leading apostrophe, which both applications consume when they
 * display the cell: the reader sees the original text, and nothing evaluates.
 * Genuine numbers are left alone so the export stays usable for sums, and
 * negative numbers are not mistaken for formulas.
 */
export function csvCell(value: string | number): string {
  const raw = String(value);
  // Leading whitespace is trimmed before evaluation, so test the trimmed value
  // but keep the original.
  const looksLikeFormula =
    FORMULA_START.test(raw.replace(/^[\s\u00a0]+/, '')) && !PLAIN_NUMBER.test(raw.trim());
  const body = looksLikeFormula ? `'${raw}` : raw;
  return '"' + body.replace(/"/g, '""') + '"';
}

/**
 * The complete file contents. CRLF line endings and a leading byte-order mark
 * are what make Excel open this as UTF-8 without mangling a ₹ or an accent.
 */
export function buildCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header.map(csvCell).join(',')].concat(rows.map((r) => r.map(csvCell).join(',')));
  return '\ufeff' + lines.join('\r\n');
}
