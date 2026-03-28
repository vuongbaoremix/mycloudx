use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

/// Compute SHA-256 hash of an async reader, returning the hex string and total bytes read.
pub async fn hash_stream<R: tokio::io::AsyncRead + Unpin>(
    reader: &mut R,
) -> Result<(String, u64), std::io::Error> {
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024]; // 64KB buffer
    let mut total_bytes: u64 = 0;

    loop {
        let n = reader.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total_bytes += n as u64;
    }

    let hash = format!("sha256:{:x}", hasher.finalize());
    Ok((hash, total_bytes))
}

/// Compute SHA-256 hash of a byte slice.
pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("sha256:{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    #[tokio::test]
    async fn test_hash_stream() {
        let data = b"hello world";
        let cursor = std::io::Cursor::new(data);
        let mut reader = BufReader::new(tokio::io::BufReader::new(cursor));

        let (hash, size) = hash_stream(&mut reader).await.unwrap();
        assert!(hash.starts_with("sha256:"));
        assert_eq!(size, 11);
    }

    #[test]
    fn test_hash_bytes() {
        let hash = hash_bytes(b"hello world");
        assert!(hash.starts_with("sha256:"));
        assert_eq!(hash.len(), 7 + 64); // "sha256:" + 64 hex chars
    }
}
