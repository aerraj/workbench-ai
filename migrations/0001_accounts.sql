PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 workspace_key TEXT NOT NULL,
 theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light','dark')),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS provider_keys (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL,
 encrypted_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL UNIQUE,
 last4 TEXT NOT NULL,
 models TEXT NOT NULL DEFAULT '[]',
 PRIMARY KEY(user_id, provider)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 id TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
