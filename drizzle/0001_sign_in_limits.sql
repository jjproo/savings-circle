CREATE TABLE sign_in_limits (
  source TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX sign_in_limits_expires_at ON sign_in_limits (expires_at);
