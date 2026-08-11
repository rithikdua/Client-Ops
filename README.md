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

Open http://localhost:5173 and sign in. On an empty database the server seeds
four demo accounts, all with the password **`demo1234`**:

| Email | Permission | Sees |
|---|---|---|
| priya@phot.ai | Owner | Everything, and can manage the team |
| daniel@phot.ai | Editor | No invoices or contract values |
| maya@phot.ai | Editor | No documents or follow-ups |
| tom@phot.ai | Viewer | Everything, read-only |

Signing in as more than one of them is the fastest way to see the permission
model working.

```bash
npm test          # 35 server tests (node:test)
npm run typecheck # both tsconfigs
npm run build     # typecheck + production web build
npm start         # production API (NODE_ENV=production)
npm run db:reset  # wipe and re-seed — destructive
```

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
  src/auth/          scrypt passwords, signed-cookie sessions, permissions
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
- **Per-client currency**, with cross-client roll-ups reported in INR — summing
  mixed currencies is meaningless without FX rates.
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
- **Passwords** are scrypt (N=2^15) with a per-user salt, compared in constant
  time. Login answers identically for a wrong password and an unknown address,
  so the endpoint cannot be used to enumerate accounts.
- **Per-section access is default-deny** and applied to reads *and* writes. A
  user without invoice access does not receive contract values, GST fields or
  invoices at all — the fields are absent from the payload, not merely unstyled —
  and cannot edit contract money through the client endpoint either.
- **Viewers are read-only**, enforced on every mutating route. The UI hides write
  affordances to match, and the client refuses the action locally too rather than
  firing a request it knows will fail.
- **Team management and preview-as are Owner-only.**
- **Preview-as is recorded on the session**, so while an Owner previews Daniel,
  the Owner's *own* requests are evaluated as Daniel — including being refused
  invoice data, and becoming read-only while previewing a Viewer.
- **Uploads** are limited to 10 MB and a vetted type list, stored under generated
  UUID filenames (a path-traversal filename cannot survive), and served only to
  signed-in users.
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
4. **Seeded demo data and a shared demo password** so the app is explorable
   immediately. `seedDatabase` refuses to run in production unless
   `SEED_PASSWORD` is set, and only touches an empty database.
5. **`TODAY` is the real clock now.** The frontend-only version froze it at
   2026-08-06 so the seeded overdue states read correctly; with a server owning
   the dates, both sides use the real date.
6. **Uploaded attachment filenames are not retained** — an upload is referenced
   by URL and labelled "Uploaded file". Keeping the original name means storing
   attachments as `{url, name}` instead of a URL string, which is a schema change
   across all three layers.
7. **Presentation settings** (density, sidebar rail, header glow) were
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
3. **No frontend tests.** The 35 server tests cover money, invoice status, auth,
   permission redaction and the endpoints; the UI was verified with a scripted
   browser pass (below) that is not checked in, because it hard-codes this
   sandbox's Chromium path.
4. **No password self-service** — no change-password, reset or invite flow; an
   Owner sets a temporary password when creating an account.
5. **No pagination or rate limiting.** Both are fine at seed scale and neither is
   safe at real scale.
6. **Optimistic UI.** Mutations wait for the round trip; on a slow link the app
   feels it.

## Verified

`npm run typecheck`, `npm run build` and `npm test` (35 tests) all pass.

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
