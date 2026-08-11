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
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

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
  owner                TEXT NOT NULL DEFAULT '',
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
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT ''
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
  file_name         TEXT,
  file_url          TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);

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
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('Not started', 'In progress', 'Done')),
  file_name   TEXT,
  file_url    TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliverables_client ON deliverables(client_id);

CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  date       TEXT NOT NULL,
  url        TEXT,
  source     TEXT NOT NULL DEFAULT 'us' CHECK (source IN ('us', 'client')),
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
  status      TEXT NOT NULL CHECK (status IN ('New', 'In Dev', 'Pending', 'Blocked', 'Done')),
  priority    TEXT NOT NULL CHECK (priority IN ('Highest', 'High', 'Medium', 'Low', 'Lowest')),
  due_date    TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);

CREATE TABLE IF NOT EXISTS task_attachments (
  id      TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

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
  due_date          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Done')),
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
