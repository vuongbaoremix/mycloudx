//! Cryptographic utilities for MyCloud E2EE encryption.
//!
//! Key hierarchy (Envelope Encryption):
//!   Password → KEK (Argon2id) → wraps Master Key (AES-256-GCM) → derives DEK per-file (HKDF)
//!
//! The DEK is sent to CloudStore as `X-Encryption-Key` for ChaCha20 encryption.

use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use anyhow::{Result, anyhow};
use argon2::Argon2;
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;

/// Generate a cryptographically secure random salt (16 bytes).
pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    rand::rng().fill_bytes(&mut salt);
    salt
}

/// Generate a random 256-bit Master Key.
pub fn generate_master_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::rng().fill_bytes(&mut key);
    key
}

/// Derive a Key Encryption Key (KEK) from the user's password using Argon2id.
///
/// Parameters: m=65536 (64 MB), t=3 iterations, p=4 parallelism
/// Output: 32 bytes (256-bit key)
pub fn derive_kek(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let params = argon2::Params::new(65536, 3, 4, Some(32))
        .map_err(|e| anyhow!("Argon2 params error: {}", e))?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

    let mut kek = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut kek)
        .map_err(|e| anyhow!("Argon2 hash error: {}", e))?;

    Ok(kek)
}

/// Wrap (encrypt) the Master Key with the KEK using AES-256-GCM.
///
/// Returns: nonce (12 bytes) || ciphertext (32 bytes + 16 bytes tag) = 60 bytes
pub fn wrap_master_key(master_key: &[u8; 32], kek: &[u8; 32]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(kek)
        .map_err(|e| anyhow!("AES key init error: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, master_key.as_ref())
        .map_err(|e| anyhow!("AES-GCM encrypt error: {}", e))?;

    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Unwrap (decrypt) the Master Key from its wrapped form.
///
/// Input: nonce (12 bytes) || ciphertext+tag
/// Output: 32-byte Master Key
pub fn unwrap_master_key(wrapped: &[u8], kek: &[u8; 32]) -> Result<[u8; 32]> {
    if wrapped.len() < 12 + 32 + 16 {
        return Err(anyhow!("Wrapped key too short: {} bytes", wrapped.len()));
    }

    let nonce = Nonce::from_slice(&wrapped[..12]);
    let ciphertext = &wrapped[12..];

    let cipher = Aes256Gcm::new_from_slice(kek)
        .map_err(|e| anyhow!("AES key init error: {}", e))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| anyhow!("Failed to unwrap master key — wrong password or corrupted key"))?;

    if plaintext.len() != 32 {
        return Err(anyhow!("Unwrapped key has wrong length: {}", plaintext.len()));
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&plaintext);
    Ok(key)
}

/// Seal (encrypt) a Master Key for transport in JWT/cookie.
///
/// Uses AES-256-GCM with a key derived from JWT_SECRET + user_id.
/// This is NOT the same as wrap_master_key (which uses KEK from password).
pub fn seal_master_key(master_key: &[u8; 32], jwt_secret: &str, user_id: &str) -> Result<String> {
    let seal_key = derive_seal_key(jwt_secret, user_id);
    let wrapped = wrap_master_key(master_key, &seal_key)?;
    Ok(base64_encode(&wrapped))
}

/// Unseal a Master Key from its JWT/cookie form.
pub fn unseal_master_key(sealed: &str, jwt_secret: &str, user_id: &str) -> Result<[u8; 32]> {
    let seal_key = derive_seal_key(jwt_secret, user_id);
    let wrapped = base64_decode(sealed)?;
    unwrap_master_key(&wrapped, &seal_key)
}

/// Derive a per-file Data Encryption Key (DEK) from the Master Key + file ID.
///
/// Uses HKDF-SHA256. Output is a hex-encoded 32-byte key, suitable for the
/// `X-Encryption-Key` header sent to CloudStore.
pub fn derive_dek(master_key: &[u8; 32], file_id: &str) -> String {
    let hkdf = Hkdf::<Sha256>::new(None, master_key);
    let info = format!("mycloud-dek-v1:{}", file_id);

    let mut dek = [0u8; 32];
    hkdf.expand(info.as_bytes(), &mut dek)
        .expect("HKDF expand should never fail for 32 bytes");

    hex::encode(dek)
}

/// Encode a recovery key from Master Key (Base58).
pub fn encode_recovery_key(master_key: &[u8; 32]) -> String {
    bs58::encode(master_key).into_string()
}

/// Decode a recovery key back to Master Key.
pub fn decode_recovery_key(recovery_key: &str) -> Result<[u8; 32]> {
    let bytes = bs58::decode(recovery_key)
        .into_vec()
        .map_err(|e| anyhow!("Invalid recovery key format: {}", e))?;

    if bytes.len() != 32 {
        return Err(anyhow!(
            "Recovery key has wrong length: {} bytes (expected 32)",
            bytes.len()
        ));
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

// --- Internal helpers ---

/// Derive a seal key from JWT secret + user_id using HKDF.
fn derive_seal_key(jwt_secret: &str, user_id: &str) -> [u8; 32] {
    let hkdf = Hkdf::<Sha256>::new(Some(user_id.as_bytes()), jwt_secret.as_bytes());
    let mut key = [0u8; 32];
    hkdf.expand(b"mycloud-seal-v1", &mut key)
        .expect("HKDF expand should never fail for 32 bytes");
    key
}

/// Base64 encode bytes (standard, no padding).
pub fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

/// Base64 decode string.
pub fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| anyhow!("Base64 decode error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kek_derivation_deterministic() {
        let salt = generate_salt();
        let kek1 = derive_kek("test-password", &salt).unwrap();
        let kek2 = derive_kek("test-password", &salt).unwrap();
        assert_eq!(kek1, kek2);
    }

    #[test]
    fn test_kek_different_passwords() {
        let salt = generate_salt();
        let kek1 = derive_kek("password1", &salt).unwrap();
        let kek2 = derive_kek("password2", &salt).unwrap();
        assert_ne!(kek1, kek2);
    }

    #[test]
    fn test_wrap_unwrap_master_key() {
        let mk = generate_master_key();
        let kek = [42u8; 32];
        let wrapped = wrap_master_key(&mk, &kek).unwrap();
        let unwrapped = unwrap_master_key(&wrapped, &kek).unwrap();
        assert_eq!(mk, unwrapped);
    }

    #[test]
    fn test_wrong_kek_fails() {
        let mk = generate_master_key();
        let kek1 = [1u8; 32];
        let kek2 = [2u8; 32];
        let wrapped = wrap_master_key(&mk, &kek1).unwrap();
        assert!(unwrap_master_key(&wrapped, &kek2).is_err());
    }

    #[test]
    fn test_seal_unseal() {
        let mk = generate_master_key();
        let sealed = seal_master_key(&mk, "my-jwt-secret", "user-123").unwrap();
        let unsealed = unseal_master_key(&sealed, "my-jwt-secret", "user-123").unwrap();
        assert_eq!(mk, unsealed);
    }

    #[test]
    fn test_seal_wrong_user_fails() {
        let mk = generate_master_key();
        let sealed = seal_master_key(&mk, "secret", "user-1").unwrap();
        assert!(unseal_master_key(&sealed, "secret", "user-2").is_err());
    }

    #[test]
    fn test_dek_deterministic() {
        let mk = [99u8; 32];
        let dek1 = derive_dek(&mk, "file-abc");
        let dek2 = derive_dek(&mk, "file-abc");
        assert_eq!(dek1, dek2);
    }

    #[test]
    fn test_dek_different_files() {
        let mk = [99u8; 32];
        let dek1 = derive_dek(&mk, "file-1");
        let dek2 = derive_dek(&mk, "file-2");
        assert_ne!(dek1, dek2);
    }

    #[test]
    fn test_recovery_key_roundtrip() {
        let mk = generate_master_key();
        let recovery = encode_recovery_key(&mk);
        let decoded = decode_recovery_key(&recovery).unwrap();
        assert_eq!(mk, decoded);
    }
}
