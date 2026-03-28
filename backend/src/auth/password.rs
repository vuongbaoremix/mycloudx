use anyhow::Result;

pub fn hash_password(password: &str) -> Result<String> {
    Ok(bcrypt::hash(password, 12)?)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    Ok(bcrypt::verify(password, hash)?)
}
