# One time payment option

_Started 2026-08-11 07:04 UTC_

---

## User

option for one time payment contract?

## Assistant

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Added a "One-time" billing option, wired into the short-label and period-calculation helpers.

_[tool: ready_for_verification]_

Done — "One-time" is now a billing cycle option.

## User

why activatity is non legged that i have done changes here

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

Confirmed: editing a client's details (health, stage, contract, billing, etc. via "Edit client") saves the changes but doesn't write an activity entry — only adding contacts/invoices/deliverables/documents/payments and task/deliverable status changes do that. That's why your edits aren't showing up in the log. I'll add an activity entry summarizing what changed whenever a client is edited.

_[tool: str_replace_edit]_

Client edits weren't logged — only additions (contacts, invoices, deliverables, etc.) and status changes were. Now saving an edited client also adds an activity entry ("Client details updated").

_[tool: ready_for_verification]_

Fixed.

## User

why are we shwoing this in one time payment ?

## Assistant

_[tool: grep]_

_[tool: grep]_

I'll add an `isOneTime` flag and hide the "Next billing" row for one-time clients.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Hid the "Next billing" line for one-time payment clients, since there's no recurring cycle to show.

_[tool: ready_for_verification]_

Fixed.

## User

why this header glow breaks after every edit ?

## Assistant

_[tool: grep]_

That's expected, not a bug: `headerGlow` is a tweak you changed in your live preview only, without saving it as the default. Since it's not saved, it's session-only — each edit I make reloads the component from its saved source, which resets props to their saved defaults (glow off). To make it stick, save the tweak as default after toggling it on.

