-- Create a partial index for the Maps feature to instantly query geocoded media
-- We use expression indexes on SQLite JSON fields to avoid full table scans.
CREATE INDEX IF NOT EXISTS idx_media_geo 
ON media (user_id) 
WHERE json_extract(metadata, '$.location.lat') IS NOT NULL 
AND deleted_at IS NULL;
