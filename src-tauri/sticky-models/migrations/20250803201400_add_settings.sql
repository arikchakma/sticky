-- Add migration SQL here
CREATE TABLE
  IF NOT EXISTS settings (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL
  );
