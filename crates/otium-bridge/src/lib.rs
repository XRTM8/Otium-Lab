//! Native Android FFI bridge for Otium Mobile.
//! Exposes cryptographic vault, Arabic stemming & search, and document scanning
//! (perspective warp & clean binarization) to Kotlin / Jetpack Compose via UniFFI.

use std::io::Cursor;
use image::ImageFormat;

uniffi::setup_scaffolding!();

#[derive(uniffi::Error, thiserror::Error, Debug)]
pub enum BridgeError {
    #[error("Vault error: {msg}")]
    Vault { msg: String },
    #[error("Image processing error: {msg}")]
    ImageProcessing { msg: String },
}

#[derive(uniffi::Record)]
pub struct ArabicMatchRecord {
    pub start_offset: u32,
    pub end_offset: u32,
}

#[derive(uniffi::Record, Clone, Copy, Debug)]
pub struct CornerPoints {
    pub top_left_x: f32,
    pub top_left_y: f32,
    pub top_right_x: f32,
    pub top_right_y: f32,
    pub bottom_right_x: f32,
    pub bottom_right_y: f32,
    pub bottom_left_x: f32,
    pub bottom_left_y: f32,
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

#[uniffi::export]
pub fn bridge_warp_document(
    image_bytes: Vec<u8>,
    corners: CornerPoints,
    target_width: Option<u32>,
    target_height: Option<u32>,
) -> Result<Vec<u8>, BridgeError> {
    let dyn_img = image::load_from_memory(&image_bytes)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;

    let quad = otium_scanner::geometry::QuadCorners::new(
        otium_scanner::geometry::Point2D::new(corners.top_left_x, corners.top_left_y),
        otium_scanner::geometry::Point2D::new(corners.top_right_x, corners.top_right_y),
        otium_scanner::geometry::Point2D::new(corners.bottom_right_x, corners.bottom_right_y),
        otium_scanner::geometry::Point2D::new(corners.bottom_left_x, corners.bottom_left_y),
    );

    let target_dims = match (target_width, target_height) {
        (Some(w), Some(h)) if w > 0 && h > 0 => Some((w, h)),
        _ => None,
    };

    let warped_rgba = otium_scanner::processor::DocumentScanner::warp_perspective(&dyn_img, &quad, target_dims)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;

    let mut output_bytes = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(warped_rgba)
        .write_to(&mut output_bytes, ImageFormat::Jpeg)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;

    Ok(output_bytes.into_inner())
}

#[uniffi::export]
pub fn bridge_clean_document(
    image_bytes: Vec<u8>,
    contrast_boost: f32,
) -> Result<Vec<u8>, BridgeError> {
    let dyn_img = image::load_from_memory(&image_bytes)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
    let rgba = dyn_img.to_rgba8();
    let cleaned_gray = otium_scanner::processor::DocumentScanner::clean_document_filter(&rgba, contrast_boost);

    let mut output_bytes = Cursor::new(Vec::new());
    image::DynamicImage::ImageLuma8(cleaned_gray)
        .write_to(&mut output_bytes, ImageFormat::Jpeg)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;

    Ok(output_bytes.into_inner())
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

    #[test]
    fn test_bridge_warp_and_clean_pipeline() {
        // Create a small 100x100 test image in memory
        let img = image::RgbaImage::from_pixel(100, 100, image::Rgba([200, 150, 100, 255]));
        let mut raw_bytes = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img).write_to(&mut raw_bytes, ImageFormat::Png).unwrap();
        let input_bytes = raw_bytes.into_inner();

        let corners = CornerPoints {
            top_left_x: 5.0,
            top_left_y: 5.0,
            top_right_x: 95.0,
            top_right_y: 10.0,
            bottom_right_x: 90.0,
            bottom_right_y: 95.0,
            bottom_left_x: 10.0,
            bottom_left_y: 90.0,
        };

        let warped = bridge_warp_document(input_bytes.clone(), corners, Some(80), Some(80)).expect("warp");
        assert!(!warped.is_empty());

        let cleaned = bridge_clean_document(warped, 1.2).expect("clean");
        assert!(!cleaned.is_empty());
    }
}
