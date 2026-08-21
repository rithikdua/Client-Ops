# Client Ops — B2B client management dashboard

A full-stack implementation of the `B2B Client Dashboard` design handed off from
Claude Design (claude.ai/design). The original design bundle is preserved:

- `project/B2B Client Dashboard.dc.html` — the design prototype (source of truth for the UI)
- `project/_ds/…` — the Phot.AI design system (tokens, components, icons)
- `chats/` — the design conversations that produced it
- `HANDOFF.md` — the handoff instructions that shipped with the bundle

## Running it

```bash
npm install
cp .env.example .env     # optional in development
npm run dev              # API on :8787, web on :5173 (proxied)
```

Open http://localhost:5173. The database starts **empty**, so the app shows
first-run setup: enter your name, work email and a password, and that first
account becomes the workspace **Owner** with full access. You are signed in
immediately and can start adding real clients.

Prefer the terminal, or need a second Owner later?

```bash
npm run create-user -- --name "Your Name" --email you@company.com
# password is prompted for, not echoed; --permission Owner|Editor|Viewer
```

Everyone after the first account is created by an Owner from the **Team** screen
(or the CLI). There is deliberately **no open sign-up** — the setup endpoint
closes permanently as soon as one account exists.

> **Deploying anywhere public?** Set `SETUP_TOKEN` to a random string first. The
> setup screen then asks for it, so a stranger who finds the URL before you
> cannot claim the Owner account. The server refuses to run open setup at all
> when `NODE_ENV=production` and no token is set.

Each person can change their own password from **Password** in the sidebar; doing
so signs out their other sessions.

When an Owner creates an account they choose a temporary password, so **the new
person is required to replace it before the workspace opens** — until they do, an
administrator knows their credentials, and the server refuses every data endpoint
for that account rather than relying on the UI to insist.

**Forgotten password?** An Owner clicks *Reset* on the Team screen, which mints a
**one-time link** to pass on directly (chat, in person — there is no email
delivery here, see Known gaps). The link expires in an hour, works once, is
cancelled by issuing another, and is stored only as a hash so a database dump
yields nothing usable. Redeeming it signs the person in and drops every other
session on that account — including any held by whoever locked them out.

### Google sign-in (optional)

Blank credentials mean the button never appears, so this is entirely opt-in.

1. **Google Cloud Console** → *APIs & Services* → *Credentials* → *Create
   credentials* → *OAuth client ID* → **Web application**.
2. Under **Authorised redirect URIs**, add exactly:
   `http://localhost:5173/api/auth/google/callback`
   (and your real domain for production — it must match `GOOGLE_REDIRECT_URI`).
3. Put the client ID and secret in `.env`:

```env
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
GOOGLE_ALLOWED_DOMAINS=yourcompany.com   # optional but recommended
```

Restart and **Continue with Google** appears on the sign-in and setup screens.

**A Google sign-in never creates an account by itself.** Everyone on earth has a
Google account, so treating a successful Google login as permission to enter
would hand the workspace to the internet. A Google identity can only attach to an
account an Owner already created, matched on verified email — with one exception:
on a completely empty workspace it stands in for first-run setup and becomes the
Owner. Anyone else gets *"There is no Client Ops account for …; ask a workspace
Owner to add you first."* Setting `GOOGLE_ALLOWED_DOMAINS` adds a second gate
before that check even runs.

### Want the sample data instead?

To explore the design with six pre-populated client accounts and four teammates
whose permissions differ:

```bash
npm run db:demo   # DESTRUCTIVE: wipes the database, then loads the sample workspace
```

That gives you these logins, all with the password `demo-pass-2026!`:

| Email | Permission | Sees |
|---|---|---|
| priya@phot.ai | Owner | Everything, and can manage the team |
| daniel@phot.ai | Editor | No invoices or contract values |
| maya@phot.ai | Editor | No documents or follow-ups |
| tom@phot.ai | Viewer | Everything, read-only |

Signing in as more than one of them is the fastest way to see the permission
model working. Demo data is never loaded automatically; set `SEED_DEMO_DATA=1` if
you want the server to load it on an empty database at boot.

```bash
npm test           # 254 server tests (node:test)
npm run typecheck  # both tsconfigs
npm run build      # typecheck + production web build
npm start          # production API (NODE_ENV=production)
npm run create-user # create an account from the terminal
npm run db:reset   # DESTRUCTIVE: empty the database (back to first-run setup)
npm run db:demo    # DESTRUCTIVE: empty it, then load the sample workspace
npm run uploads:gc # delete uploaded files nothing references any more
npm run audit      # print the audit trail (--limit, --action 'team.*', --json)
npm run backup     # verified snapshot of the database (--list to see them)
npm run restore    # put one back:  npm run restore -- --latest
npm run maintenance # one pass: backup, verify, prune, sweep orphans
```

## Deployment

**One instance.** Not a limitation to work around later — a property of three
deliberate choices, and the app now says so at startup if it finds a second
process on the same data directory:

| What | Where it lives | What two instances would mean |
|---|---|---|
| Database | one SQLite file on local disk | two separate workspaces |
| Uploads | local filesystem | a file exists on whichever machine received it |
| Rate limits | process memory | N times as many login attempts allowed as configured |

None of that fails loudly. It quietly stops being true, which is worse. Scaling
horizontally means replacing all three — Postgres, object storage, and a shared
counter — not adding a second container.

For a workspace of this size that trade is worth taking: one file to back up,
no network hop per query, and a restore that is a file copy. The ceiling is real
and it is documented in **Known gaps** below.

```
npm run build                      # build the front end
NODE_ENV=production npm start      # serves the API *and* the app on one port
```

Behind a TLS terminator, set `TRUST_PROXY=1` so client addresses come from
`X-Forwarded-For`, and `APP_URL` to the address people actually open. Point the
health check at `/api/health/ready`, not `/api/health/live` — the first says
whether it can serve, the second only that the process exists.

## Architecture

```
src/                 React + TypeScript frontend (Vite)
  api/               typed fetch client — the only place that talks HTTP
  ds/                Phot.AI design-system components
  styles/            tokens.css (design system, verbatim) + app.css
  data/              domain types (shared with the server), option lists
  lib/               money, dates, invoice math, status colours, csv
  state/             AppState (state + actions), access, derive, modal
  components/        sidebar, preview banner, UI primitives, modals
  views/             one file per section; views/client/ holds the detail tabs

server/              Node + Express + SQLite backend (TypeScript)
  src/db/            schema.sql, connection, seed data and seeder
  src/auth/          scrypt passwords, signed-cookie sessions, permissions, Google OAuth
  src/domain/        invoice maths, snapshot builder, activity log, clock
  src/http/          error handling, Zod request schemas
  src/routes/        one router per resource
  test/              node:test suites
```

Both sides import the same domain types from `src/data/types.ts`, so a field
renamed on the server fails to compile in the UI.

### Frontend ↔ backend contract

Every endpoint returns **the whole workspace snapshot** — `{ me, clients, team,
followUps }` — filtered to what the signed-in user may see. Mutations return a
fresh snapshot rather than a patch, so the client can never drift out of sync
with the server's view of permissions or derived values. The dataset here is
small enough that this is the simplest correct thing; per-resource responses are
the obvious change if the client list grows into the thousands.

`src/state/AppState.tsx` is the only place that calls the API client, and every
view reads from its state. That keeps the seam for swapping transports in one
file.

## What it does

**Workspace sections** (left nav)

| Section | Contents |
|---|---|
| Overview | Portfolio stats, "Needs attention" feed, recent activity, upcoming follow-ups |
| Clients | Searchable/sortable account list with health, owner, stage, contract value, outstanding |
| Invoices & Payments | Cross-client roll-up: finance summary, filters (status, period, custom range, financial year), CSV export, expandable payment history |
| Deliverables | Cross-client commitments, sortable by due date / status / client / owner |
| Documents | Every contract and file across every account |
| Team | Roster, permissions, per-section access control, preview-as |
| Follow-ups | Shared outreach queue with call history + a phonebook of every contact |

**Per-client detail** — Overview, Contacts, Invoices & Payments, Deliverables,
Documents, Tasks and Activity tabs, plus a meta strip showing owner, contract
value with the next billing countdown, outstanding balance and open deliverables.

### The parts with real logic behind them

- **Money is integer minor units (paise/cents) end to end** — database, API and
  UI. Floats plus `Math.round` drift on GST splits and accumulate across
  part-payments; `toMinor`/`fmtMoney` convert only at the edges. Tested to the
  paise across every GST rate we offer.
- **Invoice status is derived, never stored** (`server/src/domain/invoices.ts`,
  mirrored in `src/lib/invoices.ts`): `Paid` once settled ≥ amount, `Partially
  Paid` above zero, else `Pending`, with `Overdue` replacing the label when it is
  past due and unpaid. An invoice therefore cannot disagree with its own payment
  history.
- **TDS withheld by the client settles the invoice** even though the cash never
  reaches the bank, so "bank cash received" and "settled" are tracked separately
  throughout.
- **GST** is entered as base + rate with an excluded/included toggle; the split
  is computed server-side and previewed live in the form using the same integer
  maths.
- **Per-client currency**, with cross-client roll-ups kept as one total *per
  currency* rather than converted — summing mixed currencies is meaningless
  without FX rates, and inventing a rate is worse than showing two numbers.
- **An assignment points at an account, not a name**
  (`server/src/domain/assignees.ts`). Every client, deliverable, task and
  follow-up stores the assignee's user id *and* their name. The id is what
  survives a rename and what "everything Maya owns" is built from; the name
  keeps history readable when an account is deleted, and holds people who never
  had a login at all — a contractor, someone who left. Display follows the
  account when there is one, so a rename does not leave a trail of stale
  spellings. A name that unambiguously matches one account is linked
  automatically; an ambiguous one is left as text rather than guessed at.
- **Billing periods** walk forward from the contract start date in whole cycles
  for "paid this quarter/month/year" and the next-billing countdown. One-time
  contracts show no recurrence.
- **Activity log** merges hand-written notes with auto-logged system events
  (invoices, payments, deliverables, documents, contacts, client edits, task and
  deliverable status changes). The `system` kind is set by the server only — a
  client that asks for it is given `note` instead.

### Security model

The design showed access control as UI that hides things. That is now enforced
where it counts:

- **Sessions** are opaque IDs in an HMAC-signed, `httpOnly`, `sameSite=lax`
  cookie, stored server-side so they can expire and be revoked. `SESSION_SECRET`
  is mandatory in production.
- **A password somebody else chose must be replaced before use.** Accounts created
  by an Owner carry `must_change_password`; while it is set, every data endpoint
  returns 403 and only the session, sign-out and set-password routes work. This is
  enforced server-side because the point is precisely that another person knows
  those credentials.
- **Password resets are one-time, hashed, expiring links** issued by an Owner.
  Setting any password — through a reset, a forced change or the sidebar — cancels
  outstanding reset links for that account and drops its other sessions, so
  regaining control genuinely locks everyone else out.
- **Passwords** are scrypt (N=2^15) with a per-user salt, compared in constant
  time. Login answers identically for a wrong password and an unknown address —
  and does the same amount of hashing either way, against a dummy hash when the
  address is unknown, so response timing cannot be used to enumerate accounts
  either. An account with no password (Google-only) can never be signed into with
  one, whatever is supplied.
- **Per-section access is default-deny** and applied to reads *and* writes.
  Crucially, the snapshot redacts **every** collection, not just money: contacts,
  invoices, deliverables, documents, tasks and the activity feed are each omitted
  unless the corresponding section is granted, and money fields are absent from
  the payload rather than merely unstyled. Guarding an endpoint with
  `requireSection` achieves nothing if the snapshot ships the same rows anyway, so
  the two are kept in agreement and tested together.
- **Overview access is a dashboard, not a master key.** It grants the client
  roster for the stats and feeds; opening an account's detail needs Clients
  access.
- **Viewers are read-only**, enforced on every mutating route. The UI hides write
  affordances to match, and the client refuses the action locally too rather than
  firing a request it knows will fail.
- **Team management and preview-as are Owner-only.**
- **First-run setup is a bootstrap, not sign-up.** `POST /api/auth/setup` works
  only while the workspace has zero accounts and always creates an Owner; once
  one exists it returns 409 forever. Everything after that is invite-by-Owner.
  The emptiness check and the insert are a single transaction, so two
  simultaneous requests cannot both create an Owner. `SETUP_TOKEN` gates the
  endpoint with a one-time code, compared in constant time, and is mandatory
  under `NODE_ENV=production`.
- **Password changes require the current password** and delete every other
  session for that user, so a borrowed session cannot be used to take an account
  over. Read-only accounts can still change their own password — that is a login
  change, not a data write — but nobody can change one while previewing as
  someone else.
- **Preview-as is recorded on the session**, so while an Owner previews Daniel,
  the Owner's *own* requests are evaluated as Daniel — including being refused
  invoice data, and becoming read-only while previewing a Viewer.
- **Authentication endpoints are rate limited.** Login, first-run setup, the
  Google callback and password change are throttled on two counters that must
  both be clear: per-account and per-IP. Per-account alone is defeated by
  spreading guesses across addresses; per-IP alone is defeated by a distributed
  attack. Blocks escalate (30s, doubling) and are capped at 15 minutes so a
  locked-out colleague is inconvenienced rather than stranded, and the 429 is
  identical whether or not the account exists. Counters live in process memory,
  which is correct for one instance and must move to a shared store behind a load
  balancer. `X-Forwarded-For` is only honoured when `TRUST_PROXY` is set, because
  a header the client controls would make per-IP limiting meaningless.
- **Google sign-in** uses the authorization-code flow with PKCE. The `state`
  parameter, the OIDC `nonce` and the PKCE verifier travel in a signed, httpOnly,
  ten-minute cookie, so a forged or replayed callback is rejected before any
  token is exchanged. The ID token is **fully verified**: the RS256 signature
  against Google's published JWKS (cached, honouring the endpoint's own
  `max-age`, re-fetched once on an unknown key id so rotation is not an outage),
  with the algorithm pinned so `alg: none` and HMAC-confusion attempts are
  refused. Issuer, audience, nonce and `email_verified` are checked, and a token
  with **no** `exp` is rejected rather than treated as valid forever. Only
  `openid email profile` is requested, and `access_type=online` means no refresh
  token is issued or stored.
- **Google accounts are linked by subject, not address.** The stable `sub` is
  stored on first use, so a later Google email change follows the same account
  rather than creating a second one.
- **An attachment is owned by the section it is attached to.** Uploading goes to
  `POST /api/clients/:id/uploads/:section` (`clients`, `invoices`, `deliverables`
  or `documents`), the section is authorized *before* the body is read, and it is
  recorded on the file so every later download asks the same question the record
  does — a finance teammate can open an invoice's own PDF without being granted
  the whole client record. Existing rows are relabelled on upgrade from whatever
  references them.
- **Uploads** are validated by their actual bytes, not the `Content-Type` the
  client supplied or the extension in its filename — both of which the client
  chooses. A claim the bytes contradict is refused rather than quietly re-labelled.
  Files are stored under generated UUID names (a traversal filename cannot
  survive), and every upload is an owned record: **downloads are authorized
  against the client the file belongs to**, because knowing a URL is not
  authorization. Non-images are served `Content-Disposition: attachment` with
  `X-Content-Type-Options: nosniff`. Per-request, per-account and per-workspace
  size limits keep one person from filling the disk, and `npm run uploads:gc`
  removes files nothing references any more.
- **Uploads stream to disk, and are bounded.** They used to be buffered whole in
  memory before any validation, so exposure was the size limit times however many
  people uploaded at once. Files now stream to a temporary name, only the first
  8 KB is read to identify the format, and at most `MAX_CONCURRENT_UPLOADS` (4)
  run at a time — the rest get a 503 with `Retry-After`. Measured: eight
  concurrent 9 MB uploads produce **no heap growth**, where buffering them would
  have been 72 MB.
- **Backups run themselves, and the restore path is real.** The server takes a
  snapshot on start and daily after that, using `VACUUM INTO` so it is consistent
  while the server keeps serving — copying the file would miss whatever is still
  in the WAL. Every snapshot is verified by opening it and counting rows, because
  a backup nobody has opened is a hypothesis. `npm run restore -- --latest` puts
  one back: it verifies before touching anything, refuses to run while the
  database is in use, and moves the current file aside instead of deleting it.
  The same pass sweeps orphaned uploads and spent idempotency keys, so
  `uploads:gc` is no longer something to remember.
- **Liveness and readiness are different questions.** `/api/health/live` checks
  nothing on purpose — a failed liveness probe means "restart me", which is the
  wrong answer to a read-only database. `/api/health/ready` (and `/api/health`,
  which now means the same) actually reads a table, opens and rolls back a write
  transaction, writes and deletes a probe file in the uploads directory, and
  reports free disk — answering **503** with the failing check named, so a load
  balancer stops sending traffic to a process that cannot serve it.
- **A Content-Security-Policy the app actually runs under.** `script-src 'self'`
  with no inline or remote script, `object-src`/`base-uri` none,
  `frame-ancestors 'none'`, `form-action 'self'`, and `connect-src 'self'` so
  injected markup cannot beacon a copy of the workspace anywhere. `style-src`
  keeps `unsafe-inline` — this app sets inline style attributes nearly
  everywhere — and that is the only concession. Verified by driving every screen
  with the console watched: zero violations.
- **The front end is served by the API in production** (`SERVE_STATIC`, on
  automatically under `NODE_ENV=production`). One origin means the policy lands
  on the document instead of only on JSON, the session cookie needs no CORS, and
  the repository can demonstrate a complete running system.
- **Fonts are self-hosted.** The design system imported Inter from
  `fonts.googleapis.com`; the same faces now ship from `/fonts`, so the policy
  needs no third-party origin, no page load reports your users to Google, and the
  app renders correctly on a network that cannot reach Google at all.
- **Passwords have to survive a guess, not just a length check.** At least 12
  characters (`MIN_PASSWORD_LENGTH`), and refused if they are a common password,
  a character-substituted version of one (`P@ssw0rd` is `password`), built from
  the account holder's own name or email, a sequential run, or too repetitive.
  Every rejection says which rule it broke, since "not strong enough" is
  answered by adding an exclamation mark. An optional Have I Been Pwned check
  (`PASSWORD_BREACH_CHECK=1`) uses k-anonymity and fails open.
- **A payment cannot predate its invoice.** Each date was valid on its own and
  never compared, so a payment dated 1 August against an invoice issued on the
  20th was accepted and quietly wrong — it lands in the previous month's cash and
  moves figures for a period already reported. In practice it is a typed month or
  year, so the refusal names the invoice and its issue date.
- **Settling states its accounting date.** "Mark fully paid" opens the payment
  form with the balance and today filled in, rather than recording a payment
  dated today with no way to say otherwise: money that arrived on the 18th and
  was reconciled on the 21st belongs to the 18th.
- **Google signing in never changes the account's email.** The Google subject is
  authoritative for *authentication*, not for identity — `users.email` is the
  password login, where a reset link goes, and the name in the audit trail. A
  changed Google profile is recorded in `google_email` and written to the audit
  trail instead of silently rewriting all three.
- **Billing and cash are counted separately.** The finance summary answers two
  questions, and says which is which: what was billed comes from invoices *issued*
  in the period, what came in comes from payments *dated* in it. An invoice
  raised on 31 July and paid on 10 August belongs to July's billing and to
  August's cash — it used to be reported as July cash that was still sitting in
  the client's account.
- **Dates are checked against each other, not just individually.** An invoice due
  before it was issued, a contract ending before it starts, or an onboarding date
  preceding the contract are all refused — including on a patch that changes only
  one of them, which is judged against the record it would produce. Invoice
  numbers are unique per client, in the route and in the database; a workspace
  that already contains duplicates still starts, names them, and refuses new ones.
- **A stale edit is refused, not silently applied.** Clients, tasks, deliverables
  and follow-ups carry a version; a save sends the version the form was opened
  with, and the server applies it only if that is still current. Otherwise the
  writer is told, their form stays open with their text intact, and the screen
  behind refreshes to show what actually changed. Requests that send no version
  keep the old behaviour, so scripts are unaffected.
- **Responses are applied in order.** Every request takes a ticket before it
  leaves; a reply carrying an older ticket than one already applied is dropped.
  Without it a refresh issued a moment earlier can be overtaken by a write and
  land afterwards, silently undoing what you just did on screen while the server
  has it right — nothing to retry, and no sign anything happened.
- **One intent, one record.** Every create accepts an `Idempotency-Key`
  identifying what the user is trying to do; a second request carrying a key
  already seen is answered with the current state instead of inserting again.
  The browser mints one per open form and keeps it across retries, so a second
  click on a slow connection — or a phone that reconnects mid-request — logs one
  payment, not two. A failed request does not spend its key, and two identical
  instalments are still two payments: only a repeated *key* means a repeat.
- **One business timezone.** `WORKSPACE_TIMEZONE` (default `Asia/Kolkata`) decides
  what "today" means for the whole system, and the server sends it with every
  snapshot so the browser measures the same calendar day. Neither side asks its
  own machine: a UTC container and a team in Mumbai disagree for five and a half
  hours of every day, which is long enough for evening work to be filed under
  tomorrow.
- **Currencies are never mixed.** Cross-client roll-ups — outstanding balance,
  portfolio value, the whole finance summary — keep one total per currency and
  show them side by side. Nothing is converted, because there are no FX rates
  here and inventing one would be worse than showing two numbers; a settlement
  percentage is likewise computed inside a single currency. `fmtMoney` now
  *requires* the currency, so the compiler refuses to render an amount without
  saying what it is denominated in. A single-currency workspace reads exactly as
  it did before.
- **Invoices cannot be overpaid.** A payment larger than the outstanding balance
  is refused, so the balance can never go negative — credits and refunds would
  need their own accounting rather than an overflowing invoice.
- **Deletions and account administration are recorded.** Every client-scoped
  delete now writes a `system` entry to that client's activity feed, so users see
  what went missing and who removed it. The events a feed *cannot* hold go to an
  append-only `audit_log`: deleting a client (the feed dies with it, so the entry
  carries what was destroyed — invoice, contact, deliverable, document and task
  counts), removing a payment (with the amount, since it un-settles an invoice),
  team add/remove, every access change with its before-and-after grant, each
  reset link issued, and sign-ins, failures, password changes and preview-as.
  Actor identity is copied into each row and nothing in the table is a foreign
  key: `ON DELETE SET NULL` would erase the actor exactly when the record starts
  to matter. Read it with `npm run audit` — deliberately a terminal script rather
  than a screen, because it exists to record what Owners did and an Owner should
  not be the one who can read or curate it.
- **The CSV export cannot execute.** Cells beginning `=`, `+`, `-`, `@` or `|`
  are prefixed so Excel and Sheets show them as text instead of evaluating them —
  quoting does not stop that, and `=HYPERLINK`/DDE payloads in an exported client
  name would run on a colleague's machine, not ours. Plain numbers are left alone
  so the file is still summable.
- **Cross-site writes are refused.** Every state-changing request must come from
  this app's own origin: `Sec-Fetch-Site` is honoured when the browser sends it,
  and `Origin` is matched against `APP_URL`, any extra origins in `APP_ORIGINS`,
  and the origin the request was addressed to (which is why a single-origin
  deployment needs no configuration). This covers the shapes a `SameSite=Lax`
  cookie does not — form posts from a sibling subdomain, and `multipart/form-data`
  uploads, which need no CORS preflight. The cookie stays `Lax` rather than
  `Strict` on purpose: a Strict cookie is withheld on the cross-site navigation
  that returns from Google, which would leave a user who just signed in looking
  signed out. A caller with neither header is not a browser and has no cross-site
  context to forge, so it is allowed and normal authentication applies.
- **Security headers on every response**: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` (reset links travel in the address bar),
  `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`, a
  closed `Permissions-Policy`, and `Cache-Control: no-store` so no shared cache
  or back button holds another account's data. HSTS is sent only over real TLS —
  and only trusts `X-Forwarded-Proto` when `TRUST_PROXY` says there is a proxy,
  since a client-set header would otherwise pin a dev machine to https.
  **No CSP yet**: almost every element in this app carries an inline `style`
  attribute, so a policy that actually helps needs a styling refactor rather than
  `unsafe-inline`, and that is tracked as its own change.
- **Configuration is validated at startup, and blank means unset.** `Number('')`
  is `0`, not a missing value, so the blank placeholders this repo's own
  `.env.example` shipped used to set the upload limit to zero bytes and the
  password-reset lifetime to zero milliseconds — both indistinguishable from a
  broken feature. Every environment read now goes through `server/src/config.ts`:
  blank and whitespace mean "use the default", an unparseable or out-of-range
  value stops the process with a message naming the variable, and flags accept
  only real true/false spellings.
- All input is validated with Zod; SQL goes through prepared statements only.

## Decisions worth knowing

These weren't specified in the handoff, so they're called out rather than buried:

1. **Stack: React + Vite + TypeScript on the frontend; Node + Express + SQLite on
   the backend.** The repo had no application code to fit into, the design system
   ships as React, and one language means shared domain types. SQLite keeps the
   whole thing to a single file with no service to provision — swapping in
   Postgres means rewriting `server/src/db/` and little else.
2. **No routing library.** Navigation is view state, as in the prototype, so you
   cannot yet deep-link to a client or refresh into one. This is the first thing
   worth adding.
3. **Snapshot-per-mutation** rather than granular responses — see the contract
   note above.
4. **A real deployment starts empty; demo data is opt-in.** The first run shows
   setup rather than seeded logins, because a shared demo password is the wrong
   default for anything real. `npm run db:demo` (or `SEED_DEMO_DATA=1`) loads the
   sample workspace, and seeding refuses to run in production unless
   `SEED_PASSWORD` is set.
5. **No self-service sign-up or password reset.** Accounts come from first-run
   setup, an Owner, or the CLI — including via Google, which authenticates people
   but never authorises new ones. A reset flow needs email delivery, which is a
   dependency worth choosing deliberately rather than assuming — see Known gaps.
6. **Google sign-in was written by hand against the OAuth spec** rather than
   pulling in Passport or a similar framework. It is about 200 lines, needs no new
   dependencies, and there is nothing hidden about which claims are trusted.
   Accounts can hold a Google link, a password, or both; a Google-only account has
   no password until the person sets one from **Password** in the sidebar.
7. **`TODAY` is the real clock now.** The frontend-only version froze it at
   2026-08-06 so the seeded overdue states read correctly; with a server owning
   the dates, both sides use the real date.
8. **Uploaded attachment filenames are not retained** — an upload is referenced
   by URL and labelled "Uploaded file". Keeping the original name means storing
   attachments as `{url, name}` instead of a URL string, which is a schema change
   across all three layers.
9. **Presentation settings** (density, sidebar rail, header glow) were
   design-tool props, not in-app controls, so they are constants in
   `src/state/settings.ts` driven by `data-` attributes on the shell.

### Prototype bugs fixed deliberately

- The invoice CSV export always wrote an empty "Issued" column; it now exports
  the issue date.
- The Documents roll-up sorted by the *formatted* date string ("Aug 4, 2026"),
  i.e. alphabetically by month name. It now sorts chronologically.
- The Overview's second stats row stayed a 5-column grid when the portfolio-value
  card was hidden from a user without invoice access, leaving a gap. It now
  collapses to 4, matching how the first row already behaved.

Behaviour that looks odd but is intended is preserved — e.g. a partially-paid
invoice that is also overdue shows the red `OVERDUE` chip and a plain red balance
rather than the purple progress bar, because overdue takes precedence.

## Known gaps

Honest list, in the order I would tackle them:

1. **No routing / deep links** (see above).
2. **Accessibility.** Many interactive elements are `div`s with `onClick`,
   inherited from the prototype: no keyboard focus, roles or labels. This needs a
   pass before real users.
3. **No frontend tests.** The server tests cover money, invoice status, auth,
   permission redaction and the endpoints; the UI was verified with a scripted
   browser pass (below) that is not checked in, because it hard-codes this
   sandbox's Chromium path.
4. **No email delivery**, so reset links and invitations are handed over by the
   Owner rather than mailed. That is a deliberate trade — it avoids inventing a
   mail dependency — but it does mean a locked-out person has to reach an Owner
   through some other channel. Wiring up a provider is the natural next step, and
   `createPasswordReset` is the only place that would need to change.
5. **No MFA.** Password accounts authenticate with a password alone. TOTP is
   implementable without dependencies; the open questions are policy ones
   (enforced for Owners or optional, recovery codes, lost-device handling), which
   is why it is not bundled in here.
6. **No pagination.** Fine at seed scale, not at real scale.
7. **Google sign-in has not been run against real Google credentials.** Every
   step around it is tested — including signature verification, against a local
   JWKS stub signed with a generated key — but the live token exchange needs a
   Google Cloud OAuth client, which I cannot create. Expect to hit at most a
   redirect-URI mismatch on the first attempt: the error Google shows names the
   exact URI it expected, and it must equal `GOOGLE_REDIRECT_URI` character for
   character.
8. **Optimistic UI.** Mutations wait for the round trip; on a slow link the app
   feels it.
9. **Team management stops at add / change access / remove.** Assignments now
   reference accounts, which is what the missing operations need — renaming a
   teammate, deactivating one without deleting them, and handing their clients
   and tasks to someone else. Each is a Team screen and one endpoint; none of
   them needs a data change any more.

## Verified

`npm run typecheck`, `npm run build` and `npm test` (266 tests, one skipped
because the sandbox runs as root and cannot make a directory unwritable) all
pass.

The real-account path was driven in a browser against an empty database: setup
appears instead of a sign-in form, rejects a short password and a mismatched
confirmation, creates the Owner and signs them in, and leaves a genuinely empty
workspace (no demo clients). Then: creating a first real client with correct GST
(₹50,000 + 18% = ₹59,000), changing the password, confirming the **old** password
no longer works and the new one does, and confirming the real data survived. The
CLI was checked too, including its duplicate-email and short-password refusals.

Google sign-in is covered by unit tests (the authorization URL carries PKCE and
never leaks the verifier; the ID token's audience, issuer, expiry, nonce and
verified-email claims are each enforced; a stranger's Google account is refused
while an existing teammate's is linked, an empty workspace's first Google user
becomes the Owner, and the domain allowlist gates everything) and by route tests
(off and refusing when unconfigured, redirecting with a signed httpOnly handshake
cookie when configured, rejecting a callback with no cookie or a mismatched
state). In the browser: the button appears on both screens only when configured,
a real click leaves for Google with PKCE and state intact, and a cancelled
consent screen comes back as "Google sign-in was cancelled." rather than raw
JSON. The one thing not exercised is a live round trip against Google itself,
which needs real credentials — see Known gaps.

A scripted browser pass against the real server covered: the login gate and a
wrong-password error; session survival across reload and termination on sign-out;
logging a partial payment with TDS and confirming the balance, progress bar,
payment history and auto-logged activity, then confirming it **persisted across a
reload**; creating a client through the two-column intake form with live GST
maths (excluded → ₹1,18,000, included → ₹1,00,000); uploading a task attachment
through the API; logging a follow-up call with call-back-later snoozing;
previewing as a teammate without invoice access and confirming no currency symbol
appears anywhere; and signing in as the Viewer to confirm every write affordance
is absent.

Assignments were checked the same way after the accounts change: every assignee
control on the Clients, Tasks and Follow-ups forms lists accounts by id and
labels them by name, a task defaults to the signed-in person, and saving an owner
change sent `ownerUserId` and stored both the id and the account's current name.
The migration was also run against the pre-existing development database rather
than only a fresh seed — all 23 assignments across clients, deliverables, tasks
and follow-ups linked to accounts on upgrade.
