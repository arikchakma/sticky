-- Your SQL goes here
CREATE TABLE
  notes (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    content TEXT NOT NULL
  );