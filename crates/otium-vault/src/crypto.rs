use argon2::{Argon2, Params};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use rand::rngs::OsRng;
use rand::RngCore;

use otium_core::{OtiumError, Result};

pub struct VaultCrypto;

impl VaultCrypto {
    /// Derive a 32-byte master encryption key from user PIN / password using Argon2id
    pub fn derive_key(pin_or_password: &str, salt: &[u8; 16]) -> Result<[u8; 32]> {
        let mut key = [0u8; 32];
        let params = Params::new(19 * 1024, 2, 1, Some(32))
            .map_err(|e| OtiumError::AuthFailed(format!("Argon2 params invalid: {e}")))?;
        let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

        argon2
            .hash_password_into(pin_or_password.as_bytes(), salt, &mut key)
            .map_err(|e| OtiumError::AuthFailed(format!("Key derivation failed: {e}")))?;

        Ok(key)
    }

    /// Encrypt plaintext bytes using ChaCha20-Poly1305 AEAD
    pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
        let cipher = ChaCha20Poly1305::new_from_slice(key)
            .map_err(|e| OtiumError::Vault(e.to_string()))?;

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| OtiumError::Vault(format!("Encryption error: {e}")))?;

        // Output format: [12 bytes Nonce] + [Ciphertext + 16 bytes Poly1305 Tag]
        let mut output = Vec::with_capacity(12 + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        Ok(output)
    }

    /// Decrypt ciphertext bytes using ChaCha20-Poly1305 AEAD
    pub fn decrypt(key: &[u8; 32], payload: &[u8]) -> Result<Vec<u8>> {
        if payload.len() < 12 + 16 {
            return Err(OtiumError::Vault("Payload too short for AEAD".into()));
        }

        let (nonce_bytes, ciphertext) = payload.split_at(12);
        let cipher = ChaCha20Poly1305::new_from_slice(key)
            .map_err(|e| OtiumError::Vault(e.to_string()))?;

        let nonce = Nonce::from_slice(nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| OtiumError::AuthFailed("Authentication tag mismatch (invalid PIN or corrupted data)".into()))?;

        Ok(plaintext)
    }
}
