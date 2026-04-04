use anyhow::Result;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user id
    pub email: String,
    pub role: String,
    pub exp: i64,
    pub iat: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_mk: Option<String>, // AES-sealed master key (base64)
}

impl Claims {
    /// Decrypt master key from JWT claim using server's JWT_SECRET.
    /// Returns None if encryption is not enabled for this user.
    pub fn master_key(&self, jwt_secret: &str) -> Option<[u8; 32]> {
        let sealed = self.encrypted_mk.as_ref()?;
        crate::crypto::unseal_master_key(sealed, jwt_secret, &self.sub).ok()
    }
}

pub fn create_token(user_id: &str, email: &str, role: &str, secret: &str) -> Result<String> {
    create_token_with_mk(user_id, email, role, secret, None)
}

pub fn create_token_with_mk(
    user_id: &str,
    email: &str,
    role: &str,
    secret: &str,
    sealed_mk: Option<&str>,
) -> Result<String> {
    let now = Utc::now();
    let exp = now + Duration::days(30);

    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        role: role.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        encrypted_mk: sealed_mk.map(|s| s.to_string()),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;

    Ok(token)
}

pub fn create_download_token(user_id: &str, secret: &str, encrypted_mk: Option<&str>) -> Result<String> {
    let now = Utc::now();
    let exp = now + Duration::minutes(5); // valid for 5 min

    let claims = Claims {
        sub: user_id.to_string(),
        email: "".to_string(),
        role: "user".to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        encrypted_mk: encrypted_mk.map(|s| s.to_string()),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;

    Ok(token)
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}
