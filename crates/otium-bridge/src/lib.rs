//! Native Android FFI bridge for Otium Mobile.
//! Exposes cryptographic vault, Arabic stemming & search, edge detection,
//! and ink smoothing to Kotlin / Jetpack Compose via UniFFI.

uniffi::setup_scaffolding!();

#[derive(uniffi::Error, thiserror::Error, Debug)]
pub enum BridgeError {
    #[error("Vault error: {msg}")]
    Vault { msg: String },
}

#[derive(uniffi::Record)]
pub struct ArabicMatchRecord {
    pub start_offset: u32,
    pub end_offset: u32,
}

#[uniffi::export]
pub fn bridge_arabic_stem(word: String) -> String {
    otium_core::search::arabic_light_stem(&word).to_string()
}

#[uniffi::export]
pub fn bridge_find_arabic_matches(text: String, query: String) -> Vec<ArabicMatchRecord> {
    let matches = otium_core::search::find_arabic_stemmed_matches(&text, &query);
    matches
        .into_iter()
        .map(|m| ArabicMatchRecord {
            start_offset: m.start_offset as u32,
            end_offset: m.end_offset as u32,
        })
        .collect()
}

#[uniffi::export]
pub fn bridge_seal_bytes(data: Vec<u8>, pin: String) -> Result<Vec<u8>, BridgeError> {
    otium_vault::VaultCrypto::seal_bytes(&pin, &data)
        .map_err(|e| BridgeError::Vault { msg: e.to_string() })
}

#[uniffi::export]
pub fn bridge_unseal_bytes(sealed: Vec<u8>, pin: String) -> Result<Vec<u8>, BridgeError> {
    otium_vault::VaultCrypto::unseal_bytes(&pin, &sealed)
        .map_err(|e| BridgeError::Vault { msg: e.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bridge_arabic_stemming() {
        assert_eq!(bridge_arabic_stem("والكتاب".to_string()), "كتاب");
        assert_eq!(bridge_arabic_stem("المهندسين".to_string()), "مهندس");
    }

    #[test]
    fn test_bridge_find_arabic_matches() {
        let text = "هذا الكتاب مفيد جداً وكتابهم رائع".to_string();
        let matches = bridge_find_arabic_matches(text, "كتاب".to_string());
        assert_eq!(matches.len(), 2);
    }

    #[test]
    fn test_bridge_vault_roundtrip() {
        let secret = b"Otium Sovereign Native Mobile Vault".to_vec();
        let pin = "987654".to_string();
        let sealed = bridge_seal_bytes(secret.clone(), pin.clone()).expect("seal");
        let unsealed = bridge_unseal_bytes(sealed, pin).expect("unseal");
        assert_eq!(unsealed, secret);
    }
}
