# Client Ops — B2B client management dashboard

An implementation of the `B2B Client Dashboard` design handed off from Claude Design
(claude.ai/design). The original design bundle is preserved in this repo:

- `project/B2B Client Dashboard.dc.html` — the design prototype (source of truth for the UI)
- `project/_ds/…` — the Phot.AI design system (tokens, components, icons)
- `chats/` — the design conversations that produced it
- `HANDOFF.md` — the original handoff instructions that shipped with the bundle

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck
```

## What it does

A single internal workspace for running B2B accounts end to end.

**Workspace sections** (left nav)

| Section | Contents |
|---|---|
| Overview | Portfolio stats, "Needs attention" feed, recent activity, upcoming follow-ups |
| Clients | Searchable/sortable account list with health, owner, stage, contract value, outstanding |
| Invoices & Payments | Cross-client roll-up: finance summary, filters (status, period, custom range, financial year), CSV export, expandable payment history |
| Deliverables | Cross-client commitments, sortable by due date / status / client / owner |
| Documents | Every contract and file across every account |
| Team | Roster with roles, permissions, and per-section access control |
| Follow-ups | Shared outreach queue + a phonebook of every client contact |

**Per-client detail** — Overview, Contacts, Invoices & Payments, Deliverables, Documents,
Tasks and Activity tabs, plus a meta strip showing owner, contract value with the next
billing countdown, outstanding balance and open deliverables.

### The bits with real logic behind them

- **Partial payments.** An invoice's status is derived from its payments, never stored:
  `Paid` once settled ≥ amount, `Partially Paid` above zero, else `Pending`; `Overdue`
  replaces the label when it's past due and unpaid. TDS withheld by the client counts
  toward settling the invoice, so "bank cash received" and "settled" are tracked
  separately — see `src/lib/invoices.ts`.
- **GST.** Contracts and invoices are entered as base amount + GST %, with an
  excluded/included toggle; the tax split and gross total compute live
  (`src/lib/money.ts`).
- **Per-client currency.** Each account carries its own currency and formats its money in
  it. Cross-client roll-ups (dashboard stats, the rollup finance summary) report in INR,
  since summing mixed currencies isn't meaningful without FX rates.
- **Billing periods.** "Paid this quarter / month / year" and the next-billing countdown
  walk forward from the contract start date in whole cycles. One-time contracts show no
  recurrence (`src/lib/dates.ts`).
- **Access control.** Each teammate has per-section access. "Preview as this user" renders
  the whole app through their permissions — hiding nav entries, client tabs, and every
  money figure for anyone without invoice access (`src/state/access.ts`).
- **Activity log.** Manual notes and auto-logged system events share one feed; system
  entries are tagged `SYSTEM`. Adding invoices/payments/deliverables/documents/contacts,
  editing a client, and moving a task or deliverable status all log themselves.

## Structure

```
src/
  ds/          Phot.AI design-system components (Chip, Avatar, Button, Mark, Icon)
  styles/      tokens.css (design system, verbatim) + app.css
  data/        types, seed data, option lists
  lib/         money, dates, invoice math, status colours, attachments, csv
  state/       AppState (state + actions), access, derive, modal types, settings
  components/  Sidebar, PreviewBanner, shared UI primitives, modal host + forms
  views/       one file per section; views/client/ holds the detail tabs
```

The prototype was a single 2,200-line component: template with `{{ }}` bindings plus one
class holding all state and a `renderVals()` that computed every view model. That's split
here into a state container (`src/state/AppState.tsx`, mirroring the prototype's handlers
1:1) and per-view components that derive their own display values. Visual values —
paddings, grid columns, type scale, colours — are carried over verbatim; CSS classes in
`app.css` exist only to de-duplicate repeated card/table/field patterns.

## Decisions worth knowing

These weren't specified in the handoff, so they're called out rather than buried:

1. **Stack: React + Vite + TypeScript.** The repo had no application code to fit into, and
   the design system ships as React. No routing library — the prototype's navigation is
   plain view state, so it stayed that way. (Adding real URLs per client is the natural
   next step if this becomes a shared tool.)
2. **Data is in-memory and resets on reload**, exactly as the prototype behaved and as
   requested during the design conversation. `src/data/seed.ts` holds the six sample
   accounts, team and follow-ups. Nothing persists and there is no backend; swapping
   `AppStateProvider` for API-backed actions is the seam to use.
3. **"Today" is frozen at 2026-08-06** (`TODAY` in `src/lib/dates.ts`) so the seeded
   overdue invoices and due-soon deliverables always read as the design intended. Point it
   at `new Date()` to run on the real calendar.
4. **Uploaded task attachments become data URLs**, held in memory — the prototype had no
   file storage either. Pasted links are stored as-is.
5. **Density / nav-style / header-glow** were design-tool props, not in-app controls, so
   they're constants in `src/state/settings.ts` (comfortable, full sidebar, glow on) driven
   by `data-` attributes on the shell. Flip them there or wire them to a UI later.
6. **Fonts** load Inter Tight from Google Fonts via the design system's `tokens.css`,
   matching the design system as shipped. Self-host if you need offline rendering.

### Three prototype bugs fixed

Carried over deliberately as fixes, not oversights:

- The invoice CSV export always wrote an empty "Issued" column; it now exports the issue
  date.
- The Documents roll-up sorted by the *formatted* date string ("Aug 4, 2026"), i.e.
  alphabetically by month name. It now sorts chronologically, newest first.
- On the Overview page, the second stats row stayed a 5-column grid when the "Total
  portfolio value" card was hidden from a teammate without invoice access, leaving a gap.
  It now collapses to 4 columns, matching how the first row already behaved.

Everything else is a faithful port, including behaviour that looks odd but is intended —
e.g. a partially-paid invoice that is also overdue shows the red `OVERDUE` chip and a plain
red balance rather than the purple progress bar, because the overdue state takes precedence.

## Verified

Typechecks and builds clean. A scripted browser pass exercised every section, all seven
client tabs, and the interactive flows: logging a partial payment (bank + TDS) and seeing
status, balance, progress bar and payment history update; creating a client through the
two-column intake form with live GST maths; the ticket preview → edit hand-off; follow-up
"log a call" with call-back-later snoozing; the phonebook search; period and status
filters; and previewing as a teammate without invoice access (money hidden on both the
dashboard and inside client detail).
