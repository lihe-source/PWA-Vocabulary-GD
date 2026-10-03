CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  tokens_cipher TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES oauth_accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON device_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON device_sessions(account_id);
CREATE TABLE IF NOT EXISTS oauth_attempts (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  verifier_cipher TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  session_cipher TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_expiry ON oauth_attempts(expires_at);
