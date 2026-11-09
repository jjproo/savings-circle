CREATE TABLE savings_ledger (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{"members":[],"amounts":{}}'
);
--> statement-breakpoint
INSERT INTO savings_ledger (id) VALUES (1);
