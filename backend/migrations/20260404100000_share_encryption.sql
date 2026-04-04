-- Add sealed_master_key to shared_link for E2EE support
-- Column may already exist from a prior version of this migration
CREATE TABLE IF NOT EXISTS _share_encryption_done (id INTEGER);
INSERT INTO _share_encryption_done SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM _share_encryption_done);
DROP TABLE _share_encryption_done;
