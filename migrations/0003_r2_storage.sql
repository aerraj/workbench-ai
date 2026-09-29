ALTER TABLE files ADD COLUMN storage TEXT NOT NULL DEFAULT 'd1' CHECK(storage IN ('d1','r2'));
