-- Client Ops schema.
--
-- Money is stored as INTEGER minor units (paise/cents) throughout. Never store
-- currency as a float: 18% GST on a fractional base drifts, and those errors
-- accumulate across partial payments.
--
-- Dates that represent a calendar day are TEXT 'YYYY-MM-DD'. Timestamps are
-- TEXT ISO-8601 in UTC.

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL DEFAULT '',
  -- Owner: full control incl. team management. Editor: read/write data.
  -- Viewer: read-only.
  permission    TEXT NOT NULL CHECK (permission IN ('Owner', 'Editor', 'Viewer')),
  -- Empty strings mean "no password set" — a Google-only account. Kept as ''
  -- rather than NULL so the columns stay NOT NULL for older databases.
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  -- Google's stable subject id, linked on first Google sign-in. Google may let a
  -- user change their address, so the subject is what identifies them long-term.
  google_sub    TEXT,
  -- The address Google last reported for that subject. Kept beside the account's
  -- own email rather than overwriting it: Google changing a profile must not
  -- silently change who this account is for password sign-in, audit or
  -- correspondence.
  google_email  TEXT,
  -- Set when someone else chose this account's password. Until the owner of the
  -- account replaces it, an administrator knows their credentials.
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)
  WHERE google_sub IS NOT NULL;

-- One row per section a user may open. Absent row = denied.
CREATE TABLE IF NOT EXISTS user_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, section)
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Set when an Owner is previewing the app as another teammate.
  preview_as_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS clients (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  industry             TEXT NOT NULL DEFAULT '',
  health               TEXT NOT NULL CHECK (health IN ('Active', 'At Risk', 'Churned')),
  -- Who runs this account. Two columns on purpose, and every assignment below
  -- follows the same pattern:
  --
  --   owner_user_id  the account, when the person is a workspace member. Survives
  --                  a rename, and is what "my clients" will be built from.
  --   owner          their name as it stood when assigned. Keeps history readable
  --                  after someone is removed (the id goes NULL, the name stays)
  --                  and holds a name that was never an account at all.
  owner                TEXT NOT NULL DEFAULT '',
  owner_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  stage                TEXT NOT NULL CHECK (stage IN ('Onboarding', 'Live', 'Renewal', 'Offboarding')),
  currency             TEXT NOT NULL DEFAULT 'INR',
  billing_cycle        TEXT NOT NULL CHECK (billing_cycle IN ('Monthly', 'Quarterly', 'Annual', 'One-time')),
  -- contract_value is derived: base + GST when GST is excluded from base.
  contract_value_minor INTEGER NOT NULL DEFAULT 0,
  base_amount_minor    INTEGER,
  gst_percent          REAL,
  gst_amount_minor     INTEGER,
  gst_mode             TEXT CHECK (gst_mode IN ('excluded', 'included')),
  start_date           TEXT NOT NULL,
  onboarding_date      TEXT,
  contract_end_date    TEXT,
  payment_terms        TEXT,
  website              TEXT,
  notes                TEXT,
  legal_name           TEXT,
  gstin                TEXT,
  nature_of_business   TEXT,
  city_tier            TEXT,
  mandate_type         TEXT,
  mandate_other        TEXT,
  scope_of_work        TEXT,
  -- Bumped on every edit, so a stale write can be refused rather than
  -- silently overwriting someone else's. See domain/versions.ts.
  version              INTEGER NOT NULL DEFAULT 1,
  -- Set when the record is archived. Every read filters on it; nothing is
  -- destroyed until someone explicitly purges. See domain/archive.ts.
  archived_at          TEXT,
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);

CREATE TABLE IF NOT EXISTS invoices (
  id                TEXT PRIMARY KEY,
  client_id         TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  number            TEXT NOT NULL,
  amount_minor      INTEGER NOT NULL,
  base_amount_minor INTEGER NOT NULL,
  gst_percent       REAL NOT NULL DEFAULT 0,
  gst_amount_minor  INTEGER NOT NULL DEFAULT 0,
  gst_mode          TEXT NOT NULL DEFAULT 'excluded' CHECK (gst_mode IN ('excluded', 'included')),
  issue_date        TEXT NOT NULL,
  due_date          TEXT NOT NULL,
  archived_at       TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
-- Every read filters on archived_at, so it belongs in the index it filters with.
CREATE INDEX IF NOT EXISTS idx_invoices_live ON invoices(client_id, archived_at);

-- The unique (client_id, number) index is created in code, not here: this file
-- runs on every open, and an existing database that already contains duplicates
-- must still start. See ensureInvoiceNumberIndex() in db/index.ts.

-- Status is never stored: it is derived from the payments below, so an invoice
-- can never disagree with its own payment history.
CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  invoice_id        TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  bank_amount_minor INTEGER NOT NULL DEFAULT 0,
  -- Tax withheld at source by the client. It settles the invoice even though
  -- the cash never reaches our bank.
  tds_minor         INTEGER NOT NULL DEFAULT 0,
  date              TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

CREATE TABLE IF NOT EXISTS deliverables (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner       TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('Not started', 'In progress', 'Done')),
  -- Bumped on every edit, so a stale write can be refused rather than
  -- silently overwriting someone else's. See domain/versions.ts.
  version              INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliverables_client ON deliverables(client_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_live ON deliverables(client_id, archived_at);

CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  date       TEXT NOT NULL,
  -- The file itself is a row in `attachments`; a document has exactly one.
  source     TEXT NOT NULL DEFAULT 'us' CHECK (source IN ('us', 'client')),
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  author     TEXT NOT NULL,
  note       TEXT NOT NULL,
  -- 'system' entries are auto-logged and read-only; 'note' entries are typed.
  kind       TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('system', 'note')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_client ON activity(client_id);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee    TEXT NOT NULL DEFAULT '',
  assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL CHECK (status IN ('New', 'In Dev', 'Pending', 'Blocked', 'Done')),
  priority    TEXT NOT NULL CHECK (priority IN ('Highest', 'High', 'Medium', 'Low', 'Lowest')),
  due_date    TEXT NOT NULL DEFAULT '',
  -- Bumped on every edit, so a stale write can be refused rather than
  -- silently overwriting someone else's. See domain/versions.ts.
  version              INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_live ON tasks(client_id, archived_at);

-- Every file or link attached to anything, in one place.
--
-- These used to be four unrelated columns holding URL strings — `invoices.file_url`,
-- `deliverables.file_url`, `documents.url`, `task_attachments.url` — and the only
-- way to ask "is this uploaded file still in use?" was to read every one of those
-- strings and pull a filename out with a regular expression. A URL written even
-- slightly differently (an absolute address, an escaped character, a query
-- string) did not match, and the sweeper then deleted a file that something was
-- still pointing at.
--
-- An attachment now *references* its upload, so that question is a join.
--
-- One column per owner rather than a (type, id) pair: it costs four nullable
-- columns and buys real foreign keys, which is what makes deleting a deliverable
-- take its attachment with it, in the same transaction, without any code
-- remembering to.
CREATE TABLE IF NOT EXISTS attachments (
  id             TEXT PRIMARY KEY,
  invoice_id     TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  deliverable_id TEXT REFERENCES deliverables(id) ON DELETE CASCADE,
  document_id    TEXT REFERENCES documents(id) ON DELETE CASCADE,
  task_id        TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  -- A file we hold, or an address somewhere else. Exactly one, never both:
  -- a link to a Google Doc is a real attachment and has no upload behind it.
  upload_id      TEXT REFERENCES uploads(id) ON DELETE CASCADE,
  external_url   TEXT,
  -- What to call it on screen. For an upload this is the name it arrived with.
  name           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  CHECK ((invoice_id IS NOT NULL) + (deliverable_id IS NOT NULL)
       + (document_id IS NOT NULL) + (task_id IS NOT NULL) = 1),
  CHECK ((upload_id IS NOT NULL) + (external_url IS NOT NULL) = 1)
);

CREATE INDEX IF NOT EXISTS idx_attachments_invoice ON attachments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_attachments_deliverable ON attachments(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_attachments_document ON attachments(document_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
-- The index that turns "is this upload still referenced?" into a lookup.
CREATE INDEX IF NOT EXISTS idx_attachments_upload ON attachments(upload_id);

CREATE TABLE IF NOT EXISTS follow_ups (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  company_name      TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  -- Empty when the contact is not an existing client yet.
  related_client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  reason            TEXT NOT NULL DEFAULT '',
  owner             TEXT NOT NULL DEFAULT '',
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Done')),
  -- Bumped on every edit, so a stale write can be refused rather than
  -- silently overwriting someone else's. See domain/versions.ts.
  version              INTEGER NOT NULL DEFAULT 1,
  archived_at       TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_up_log (
  id           TEXT PRIMARY KEY,
  follow_up_id TEXT NOT NULL REFERENCES follow_ups(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  note         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_follow_up_log_follow_up ON follow_up_log(follow_up_id);

-- Every uploaded file is an owned record. Without this, knowing a URL was the
-- only thing needed to read someone else's attachment: unguessability is not
-- authorization.
CREATE TABLE IF NOT EXISTS uploads (
  id            TEXT PRIMARY KEY,
  -- Generated name on disk. Never the client's filename.
  filename      TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  -- The account this file belongs to, and the section that gates reading it.
  client_id     TEXT REFERENCES clients(id) ON DELETE CASCADE,
  section       TEXT NOT NULL DEFAULT 'clients',
  uploaded_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploads_client ON uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_uploads_uploader ON uploads(uploaded_by);

-- One-time password reset grants. Only the hash is stored: a leaked database
-- must not hand out usable reset links.
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  -- Stamped when redeemed, so a link cannot be used twice.
  used_at    TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Append-only record of things that change who can do what, or that destroy
-- data. The per-client activity feed covers day-to-day work, but it cannot cover
-- these: deleting a client deletes its feed along with it, and team
-- administration belongs to no client at all.
--
-- Nothing here is a foreign key, deliberately. Actor identity is copied in, and
-- ids are plain text, because every constraint available would work against the
-- point: ON DELETE SET NULL would erase the actor from a historical record when
-- their account is removed, CASCADE would delete the record outright, and
-- RESTRICT would make the log block ordinary administration. A reference that
-- disappears exactly when the row starts to matter is worse than no reference.
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  actor_id     TEXT,
  actor_name   TEXT NOT NULL DEFAULT '',
  actor_email  TEXT NOT NULL DEFAULT '',
  -- Set when the actor was previewing as somebody else at the time.
  acting_as_id TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL DEFAULT '',
  target_id    TEXT NOT NULL DEFAULT '',
  target_label TEXT NOT NULL DEFAULT '',
  detail       TEXT NOT NULL DEFAULT '',
  ip           TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);

-- One user intent, one record. The client sends an Idempotency-Key identifying
-- the intent; a second request carrying a key already seen is answered with the
-- current state instead of inserting again. See http/idempotency.ts.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  -- Fingerprint of the request, so reusing a key for a different intent is an
  -- error rather than a silent no-op.
  request_hash TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  -- What the first request actually answered. A retry has to receive this, not
  -- a freshly built approximation of it: some responses cannot be rebuilt at
  -- all (a one-time reset link, an upload's URL), and even where they can, the
  -- status code is part of the answer.
  --
  -- NULL while the first request is still in flight, which is how a second
  -- copy arriving mid-flight is told to wait rather than served stale data.
  status_code   INTEGER,
  response_body TEXT,
  completed_at  TEXT,
  PRIMARY KEY (key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

-- Finding everything assigned to one person, which is the point of the ids.
CREATE INDEX IF NOT EXISTS idx_clients_owner_user ON clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_owner_user ON deliverables(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user ON tasks(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_owner_user ON follow_ups(owner_user_id);
