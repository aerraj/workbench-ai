CREATE TABLE IF NOT EXISTS chats (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title_ciphertext TEXT NOT NULL,
 model_provider TEXT,
 model_id TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_user_updated ON chats(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY,
 chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(chat_id, position)
);
CREATE INDEX IF NOT EXISTS messages_chat_position ON messages(chat_id, position);
CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY,
 chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name_ciphertext TEXT NOT NULL,
 text_ciphertext TEXT,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 generated INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_chat ON files(chat_id);
CREATE TABLE IF NOT EXISTS file_chunks (
 file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL,
 ciphertext TEXT NOT NULL,
 PRIMARY KEY(file_id, chunk_index)
);
CREATE TABLE IF NOT EXISTS artifacts (
 id TEXT PRIMARY KEY,
 chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title_ciphertext TEXT NOT NULL,
 kind TEXT NOT NULL,
 current_version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact_versions (
 artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,
 content_ciphertext TEXT NOT NULL,
 file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(artifact_id, version)
);
