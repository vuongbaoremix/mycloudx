-- Add encryption support fields to user table
ALTER TABLE user ADD COLUMN encrypted_master_key TEXT;
ALTER TABLE user ADD COLUMN encryption_salt TEXT;
ALTER TABLE user ADD COLUMN encryption_enabled INTEGER NOT NULL DEFAULT 0;

-- Add per-media encryption flag
ALTER TABLE media ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0;
