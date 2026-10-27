ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX users_google_sub ON users(google_sub);
CREATE TABLE oauth_states (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
