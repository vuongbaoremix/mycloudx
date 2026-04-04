-- Collaborative Albums and Notification System
-- 1. Notifications
CREATE TABLE IF NOT EXISTS notification (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id TEXT,
    is_read BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, is_read);
-- 2. Album Collaborators
CREATE TABLE IF NOT EXISTS album_collaborator (
    album_id TEXT NOT NULL REFERENCES album(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer',
    can_download BOOLEAN NOT NULL DEFAULT 0,
    invited_by TEXT NOT NULL REFERENCES user(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(album_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_collab_user ON album_collaborator(user_id);
-- 3. Track media uploader in albums
-- (Handle gracefully if already run manually from scratch, but in this case this is a formal migration)
ALTER TABLE album_media
ADD COLUMN added_by TEXT REFERENCES user(id);