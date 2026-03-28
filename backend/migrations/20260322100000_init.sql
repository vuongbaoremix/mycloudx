CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    avatar TEXT,
    storage_used REAL NOT NULL DEFAULT 0,
    storage_quota REAL NOT NULL DEFAULT 10737418240,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size REAL NOT NULL,
    file_hash TEXT,
    width INTEGER,
    height INTEGER,
    duration REAL,
    aspect_ratio REAL NOT NULL DEFAULT 1,
    thumbnails TEXT NOT NULL DEFAULT '{}',
    storage_path TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'local',
    blur_hash TEXT,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    is_favorite BOOLEAN NOT NULL DEFAULT 0,
    deleted_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_user_created ON media(user_id, created_at);
CREATE INDEX idx_media_user_status ON media(user_id, status);
CREATE INDEX idx_media_user_hash ON media(user_id, file_hash);
CREATE INDEX idx_media_user_favorite ON media(user_id, is_favorite);
CREATE INDEX idx_media_user_deleted ON media(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS upload_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    total_files INTEGER NOT NULL,
    completed_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    files TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_upload_user_status ON upload_session(user_id, status);

CREATE TABLE IF NOT EXISTS mosaic (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER,
    image_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL,
    media_count INTEGER NOT NULL DEFAULT 0,
    grid_size TEXT NOT NULL DEFAULT '{}',
    last_media_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stale BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS album (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS album_media (
    album_id TEXT NOT NULL REFERENCES album(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(album_id, media_id)
);

CREATE TABLE IF NOT EXISTS shared_link (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    share_type TEXT NOT NULL DEFAULT 'media',
    media_ids TEXT NOT NULL DEFAULT '[]',
    album_id TEXT REFERENCES album(id) ON DELETE CASCADE,
    password_hash TEXT,
    expires_at DATETIME,
    view_count INTEGER NOT NULL DEFAULT 0,
    max_views INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
