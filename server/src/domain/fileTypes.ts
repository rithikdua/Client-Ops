/**
 * What a file actually *is*, decided from its bytes.
 *
 * `Content-Type` on an upload is supplied by the client and can say anything, and
 * the extension comes from a filename the client also chose. Neither is evidence.
 * Everything we accept is confirmed by its signature, so a script cannot arrive
 * labelled `image/png` and later be served back as something a browser will run.
 */

export interface AllowedType {
  mime: string;
  extension: string;
  /** True when these bytes really are this format. */
  matches: (bytes: Buffer) => boolean;
  /** Images are safe to render inline; everything else downloads. */
  inline: boolean;
}

const startsWith = (bytes: Buffer, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte);

/** ZIP container — the outer format of .docx and .xlsx. */
const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);

/**
 * Text with no NUL bytes that decodes cleanly as UTF-8. CSV has no signature, so
 * this is the closest thing to proof available; the NUL check is what keeps a
 * binary payload from passing as text.
 */
function isProbablyText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return !decoded.includes('�');
}

export const ALLOWED_TYPES: AllowedType[] = [
  {
    mime: 'image/png',
    extension: '.png',
    inline: true,
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: 'image/jpeg',
    extension: '.jpg',
    inline: true,
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    mime: 'image/gif',
    extension: '.gif',
    inline: true,
    matches: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
  },
  {
    mime: 'image/webp',
    extension: '.webp',
    inline: true,
    // "RIFF" .... "WEBP"
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  {
    mime: 'application/pdf',
    extension: '.pdf',
    inline: false,
    matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), // "%PDF-"
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
    inline: false,
    matches: isZip,
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
    inline: false,
    matches: isZip,
  },
  { mime: 'text/csv', extension: '.csv', inline: false, matches: isProbablyText },
];

export const ALLOWED_SUMMARY = 'PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX or CSV';

/** Claims we treat as "no claim at all", where sniffing alone decides. */
const VAGUE_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/**
 * Identifies the file from its bytes.
 *
 * The claimed type is used only to *narrow* the answer, never to widen it: a
 * .docx and an .xlsx are both ZIPs, so the claim breaks that tie. A claim that
 * the bytes contradict is a rejection, not an invitation to find some other type
 * that happens to fit — otherwise a shell script announced as `image/png` would
 * be quietly stored as a CSV rather than refused.
 */
export function detectType(bytes: Buffer, claimedMime: string): AllowedType | null {
  const candidates = ALLOWED_TYPES.filter((t) => t.matches(bytes));
  if (candidates.length === 0) return null;

  const claim = (claimedMime ?? '').toLowerCase().split(';')[0].trim();
  if (VAGUE_MIMES.has(claim)) return candidates[0];

  // The claim must be a type we allow *and* be borne out by the bytes.
  return candidates.find((t) => t.mime === claim) ?? null;
}
