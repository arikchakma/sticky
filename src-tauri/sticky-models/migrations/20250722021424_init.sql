-- Add migration SQL here
CREATE TABLE
  IF NOT EXISTS notes (
    model TEXT NOT NULL DEFAULT 'note',
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime ('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime ('now'))
  );