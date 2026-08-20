import type { NextFunction, Request, Response } from 'express';
import { envRaw } from '../config';
import { HttpError } from './errors';

/**
 * Response headers applied to everything this server sends. None of them are a
 * substitute for the checks in the routes — they close off the ways a browser
 * can be talked into misusing a response it was legitimately given.
 *
 * A Content-Security-Policy is deliberately not set here. Nearly every element
 * in this app carries an inline `style` attribute, so a useful policy needs
 * either `unsafe-inline` (which buys close to nothing) or a real styling
 * refactor. That is its own change, not a header added in passing.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Never let a browser guess a type other than the one we declared. Uploads set
  // this too; here it covers every JSON response as well.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Nothing here should be framed: it would only ever be to overlay it.
  res.setHeader('X-Frame-Options', 'DENY');
  // Reset links and upload URLs travel in the address bar. Don't leak them to
  // whatever the user clicks through to next.
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Cut the window.opener link, so a page we open cannot reach back into ours.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Refuse to be embedded as a subresource by another site — including the
  // uploaded documents and invoice PDFs served from /api/uploads.
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), display-capture=()',
  );
  // Client data and session cookies: no shared cache should hold any of it, and
  // "back" should not resurrect a previous account's screen after sign-out.
  res.setHeader('Cache-Control', 'no-store');

  // Only meaningful over TLS, and a wrong Max-Age on a plain-HTTP dev server
  // would lock the developer's browser out of localhost.
  if (isHttps(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses state-changing requests that another site caused the browser to make.
 *
 * The session cookie is `SameSite=Lax`, which already blocks cross-site POSTs
 * from a page — but Lax is a cookie policy, not a request policy: it says
 * nothing about `same-site` sibling subdomains, and it cannot be relied on as
 * the only defence when the cookie has to stay Lax for the Google sign-in
 * redirect to work (a Strict cookie is withheld on the cross-site navigation
 * that lands the user back here, which would leave them looking signed out).
 *
 * So the origin is checked directly. A browser sends `Origin` on every unsafe
 * request, including form posts and `multipart/form-data` uploads, which are
 * exactly the requests that need no CORS preflight and would otherwise slip
 * through. Absent both `Origin` and `Sec-Fetch-Site` the caller is not a
 * browser — curl, a script, the test suite — and there is no cross-site
 * context to forge, so the request is allowed and the routes' own
 * authentication does the work.
 */
export function rejectCrossSiteWrites(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const site = req.get('sec-fetch-site');
  // Chromium and Firefox tell us directly. `none` means the user themselves
  // started it (typed URL, bookmark); `same-origin` is our own page.
  if (site && site !== 'same-origin' && site !== 'none') {
    return next(new HttpError(403, 'Cross-site requests are not allowed.'));
  }

  const origin = req.get('origin');
  if (!origin) return next();
  if (!allowedOrigins(req).has(normalizeOrigin(origin))) {
    return next(new HttpError(403, 'Cross-site requests are not allowed.'));
  }
  next();
}

/**
 * The origins whose pages may drive this API: whatever the deployment declares,
 * plus the origin this very request was addressed to.
 *
 * The second one is what makes a single-origin deployment work with no
 * configuration at all. It is not a hole: a victim's browser derives Host from
 * the URL it was pointed at, so a page on evil.example can send
 * `Origin: https://evil.example` but can never make the Host say the same.
 */
function allowedOrigins(req: Request): Set<string> {
  const allowed = new Set<string>();
  for (const value of [appUrl(), ...(envRaw('APP_ORIGINS') ?? '').split(',')]) {
    const normalized = value ? normalizeOrigin(value.trim()) : '';
    if (normalized) allowed.add(normalized);
  }
  const host = req.get('host');
  if (host) allowed.add(`${isHttps(req) ? 'https' : 'http'}://${host}`);
  return allowed;
}

/**
 * Where the front end is served from. In development that is Vite on :5173,
 * which proxies /api here — the proxy rewrites Host to the API's port but passes
 * the browser's Origin through unchanged, so the two never match on their own
 * and the app would 403 against itself without this default. Production has to
 * say so explicitly, because guessing a localhost origin there would be a hole.
 */
function appUrl(): string | undefined {
  const configured = envRaw('APP_URL');
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173';
}

function normalizeOrigin(value: string): string {
  if (!value) return '';
  try {
    // Drops any path, trailing slash and default port, so a configured
    // "https://ops.example.com/" matches the browser's "https://ops.example.com".
    return new URL(value).origin;
  } catch {
    return '';
  }
}

/**
 * Whether the browser reached us over TLS. `X-Forwarded-Proto` is only believed
 * when the deployment says it sits behind a proxy — otherwise a client could
 * set the header itself and, for instance, talk us into an HSTS response.
 */
function isHttps(req: Request): boolean {
  if (req.protocol === 'https') return true;
  if (!envRaw('TRUST_PROXY')) return false;
  const forwarded = req.get('x-forwarded-proto');
  return !!forwarded && forwarded.split(',')[0].trim() === 'https';
}
