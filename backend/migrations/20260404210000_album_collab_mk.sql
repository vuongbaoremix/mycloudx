-- Add sealed_master_key to album_collaborator table for E2EE sharing

ALTER TABLE album_collaborator
ADD COLUMN sealed_master_key TEXT;
