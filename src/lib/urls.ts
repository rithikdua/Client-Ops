/**
 * URL safety, shared by the browser and the API.
 *
 * Users can store links (client websites, document links, invoice and
 * deliverable files, task attachments) and other users click them. React does
 * **not** sanitise `href`, so a stored `javascript:` URL would run as script in
 * the victim's session — stored XSS, with an Owner as the likely victim.
 *
 * Everything that ends up in an `href` must go through `safeHref`, and the API
 * refuses to store anything this module rejects. Both layers matter: the input
 * check keeps the database clean, the render check protects against rows written
 * before the check existed (or by any future path that forgets it).
 */

/** The only schemes we will ever put in an href. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/** Files we host ourselves, served by the API behind an authorization check. */
const APP_PATH_PREFIX = '/api/uploads/';

function isAppHostedPath(value: string): boolean {
  // No traversal, no protocol-relative "//host" trickery.
  return (
    value.startsWith(APP_PATH_PREFIX) && !value.includes('..') && !value.startsWith('//')
  );
}

/**
 * True when `value` is safe to use as a link target.
 *
 * Rejects, among others: `javascript:`, `data:`, `vbscript:`, `file:`, relative
 * paths outside our own upload route, and anything smuggling control characters
 * or whitespace into the scheme (`java\nscript:` is parsed as `javascript:` by
 * browsers).
 */
export function isSafeUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Control characters and whitespace are stripped by browsers before parsing
  // the scheme, so they can hide a dangerous one: "java\tscript:alert(1)" is
  // read as "javascript:". Never accept them.
  if (/[\u0000-\u0020\u007f-\u00a0]/.test(trimmed)) return false;

  if (isAppHostedPath(trimmed)) return true;

  try {
    // Absolute URLs only: a bare "evil.com" or "/etc/passwd" is not a link we
    // are willing to render.
    return SAFE_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

/**
 * The value to pass to `href`, or `undefined` when the URL is not safe — an
 * anchor without an href is inert, so an unsafe link degrades to plain text
 * rather than becoming a trap.
 */
export function safeHref(value: string | null | undefined): string | undefined {
  return isSafeUrl(value) ? value!.trim() : undefined;
}

/** True for links that leave the application, which the UI marks as external. */
export function isExternalUrl(value: string | null | undefined): boolean {
  return isSafeUrl(value) && !isAppHostedPath((value ?? '').trim());
}

/** Message shown when a stored link is refused, and used by the API's validators. */
export const UNSAFE_URL_MESSAGE = 'Links must start with http:// or https://';
