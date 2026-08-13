import { buildCsv } from './csvText';

/** Builds a CSV blob and triggers a browser download. */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const blob = new Blob([buildCsv(header, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
