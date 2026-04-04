use anyhow::Result;
use super::SurrealClient;

/// Apply SurrealDB schema definitions.
/// SurrealDB supports schemaless mode, so we define indexes for performance.
pub async fn apply_schema(db: &SurrealClient) -> Result<()> {
    tracing::info!("Applying database schema...");

    db.query(
        "
        -- User table
        DEFINE TABLE IF NOT EXISTS user SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS name ON user TYPE string;
        DEFINE FIELD IF NOT EXISTS email ON user TYPE string;
        DEFINE FIELD IF NOT EXISTS password_hash ON user TYPE string;
        DEFINE FIELD IF NOT EXISTS role ON user TYPE string DEFAULT 'user';
        DEFINE FIELD IF NOT EXISTS avatar ON user TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS storage_used ON user TYPE float DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS storage_quota ON user TYPE float DEFAULT 1099511627776;
        DEFINE FIELD IF NOT EXISTS settings ON user TYPE object DEFAULT {};
        DEFINE FIELD IF NOT EXISTS settings.theme ON user TYPE string DEFAULT 'system';
        DEFINE FIELD IF NOT EXISTS settings.language ON user TYPE string DEFAULT 'vi';
        DEFINE FIELD IF NOT EXISTS settings.gallery_columns ON user TYPE int DEFAULT 4;
        DEFINE FIELD IF NOT EXISTS created_at ON user TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS updated_at ON user TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_user_email ON user FIELDS email UNIQUE;

        -- Media table
        DEFINE TABLE IF NOT EXISTS media SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS user_id ON media TYPE string;
        DEFINE FIELD IF NOT EXISTS filename ON media TYPE string;
        DEFINE FIELD IF NOT EXISTS original_name ON media TYPE string;
        DEFINE FIELD IF NOT EXISTS mime_type ON media TYPE string;
        DEFINE FIELD IF NOT EXISTS size ON media TYPE float;
        DEFINE FIELD IF NOT EXISTS file_hash ON media TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS width ON media TYPE option<int>;
        DEFINE FIELD IF NOT EXISTS height ON media TYPE option<int>;
        DEFINE FIELD IF NOT EXISTS duration ON media TYPE option<float>;
        DEFINE FIELD IF NOT EXISTS aspect_ratio ON media TYPE float DEFAULT 1;
        DEFINE FIELD IF NOT EXISTS thumbnails ON media TYPE object DEFAULT {};
        DEFINE FIELD IF NOT EXISTS thumbnails.micro ON media TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS thumbnails.small ON media TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS thumbnails.medium ON media TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS thumbnails.large ON media TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS storage_path ON media TYPE string;
        DEFINE FIELD IF NOT EXISTS storage_provider ON media TYPE string DEFAULT 'local';
        DEFINE FIELD IF NOT EXISTS blur_hash ON media TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS metadata ON media FLEXIBLE TYPE option<object>;
        DEFINE FIELD IF NOT EXISTS status ON media TYPE string DEFAULT 'processing';
        DEFINE FIELD IF NOT EXISTS is_favorite ON media TYPE bool DEFAULT false;
        DEFINE FIELD IF NOT EXISTS deleted_at ON media TYPE option<datetime>;
        DEFINE FIELD IF NOT EXISTS created_at ON media TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS updated_at ON media TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_media_user_created ON media FIELDS user_id, created_at;
        DEFINE INDEX IF NOT EXISTS idx_media_user_status ON media FIELDS user_id, status;
        DEFINE INDEX IF NOT EXISTS idx_media_user_hash ON media FIELDS user_id, file_hash;
        DEFINE INDEX IF NOT EXISTS idx_media_user_favorite ON media FIELDS user_id, is_favorite;
        DEFINE INDEX IF NOT EXISTS idx_media_user_deleted ON media FIELDS user_id, deleted_at;

        -- Upload session table
        DEFINE TABLE IF NOT EXISTS upload_session SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS user_id ON upload_session TYPE string;
        DEFINE FIELD IF NOT EXISTS total_files ON upload_session TYPE int;
        DEFINE FIELD IF NOT EXISTS completed_files ON upload_session TYPE int DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS failed_files ON upload_session TYPE int DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS status ON upload_session TYPE string DEFAULT 'active';
        DEFINE FIELD IF NOT EXISTS files ON upload_session FLEXIBLE TYPE array DEFAULT [];
        DEFINE FIELD IF NOT EXISTS created_at ON upload_session TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS updated_at ON upload_session TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_upload_user_status ON upload_session FIELDS user_id, status;

        -- Mosaic table
        DEFINE TABLE IF NOT EXISTS mosaic SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS user_id ON mosaic TYPE string;
        DEFINE FIELD IF NOT EXISTS year ON mosaic TYPE int;
        DEFINE FIELD IF NOT EXISTS month ON mosaic TYPE option<int>;
        DEFINE FIELD IF NOT EXISTS image_path ON mosaic TYPE string;
        DEFINE FIELD IF NOT EXISTS thumbnail_path ON mosaic TYPE string;
        DEFINE FIELD IF NOT EXISTS media_count ON mosaic TYPE int DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS grid_size ON mosaic TYPE object DEFAULT {};
        DEFINE FIELD IF NOT EXISTS grid_size.cols ON mosaic TYPE int DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS grid_size.rows ON mosaic TYPE int DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS last_media_date ON mosaic TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS stale ON mosaic TYPE bool DEFAULT true;
        DEFINE FIELD IF NOT EXISTS created_at ON mosaic TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS updated_at ON mosaic TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_mosaic_unique ON mosaic FIELDS user_id, year, month UNIQUE;

        -- Album table
        DEFINE TABLE IF NOT EXISTS album SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS user_id ON album TYPE string;
        DEFINE FIELD IF NOT EXISTS name ON album TYPE string;
        DEFINE FIELD IF NOT EXISTS description ON album TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS cover_media_id ON album TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS created_at ON album TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS updated_at ON album TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_album_user ON album FIELDS user_id;

        -- Album-Media junction table (many-to-many)
        DEFINE TABLE IF NOT EXISTS album_media SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS album_id ON album_media TYPE string;
        DEFINE FIELD IF NOT EXISTS media_id ON album_media TYPE string;
        DEFINE FIELD IF NOT EXISTS added_at ON album_media TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_album_media_album ON album_media FIELDS album_id;
        DEFINE INDEX IF NOT EXISTS idx_album_media_unique ON album_media FIELDS album_id, media_id UNIQUE;

        -- Shared link table
        DEFINE TABLE IF NOT EXISTS shared_link SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS user_id ON shared_link TYPE string;
        DEFINE FIELD IF NOT EXISTS token ON shared_link TYPE string;
        DEFINE FIELD IF NOT EXISTS share_type ON shared_link TYPE string DEFAULT 'media';
        DEFINE FIELD media_ids ON shared_link TYPE array<string> DEFAULT [];
        DEFINE FIELD IF NOT EXISTS album_id ON shared_link TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS password_hash ON shared_link TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS expires_at ON shared_link TYPE option<datetime>;
        DEFINE FIELD IF NOT EXISTS view_count ON shared_link TYPE int DEFAULT 0;
        DEFINE FIELD IF NOT EXISTS max_views ON shared_link TYPE option<int>;
        DEFINE FIELD IF NOT EXISTS is_active ON shared_link TYPE bool DEFAULT true;
        DEFINE FIELD IF NOT EXISTS created_at ON shared_link TYPE datetime DEFAULT time::now();
        DEFINE FIELD IF NOT EXISTS updated_at ON shared_link TYPE datetime DEFAULT time::now();
        DEFINE INDEX IF NOT EXISTS idx_shared_link_token ON shared_link FIELDS token UNIQUE;
        DEFINE INDEX IF NOT EXISTS idx_shared_link_user ON shared_link FIELDS user_id;
        ",
    )
    .await?;

    tracing::info!("Database schema applied successfully");
    Ok(())
}
