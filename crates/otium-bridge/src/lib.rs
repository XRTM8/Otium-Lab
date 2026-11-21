//! Native Android FFI bridge for Otium Mobile.
//! Dedicated solely to:
//! 1. High-speed document scanning (perspective warp & image filters)
//! 2. Arabic text root normalization & fast in-page search

use std::io::Cursor;
use image::ImageFormat;

uniffi::setup_scaffolding!();

#[derive(uniffi::Error, thiserror::Error, Debug)]
pub enum BridgeError {
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
pub fn bridge_apply_scan_filter(
    image_bytes: Vec<u8>,
    filter_mode: String,
) -> Result<Vec<u8>, BridgeError> {
    if filter_mode == "original" {
        return Ok(image_bytes);
    }

    let dyn_img = image::load_from_memory(&image_bytes)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
    let rgba = dyn_img.to_rgba8();

    let mut output_bytes = Cursor::new(Vec::with_capacity(image_bytes.len()));

    match filter_mode.as_str() {
        "magic_color" => {
            let filtered = otium_scanner::processor::DocumentScanner::magic_color_filter(&rgba);
            image::DynamicImage::ImageRgba8(filtered)
                .write_to(&mut output_bytes, ImageFormat::Jpeg)
                .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
        }
        "clean_white" => {
            let cleaned_gray = otium_scanner::processor::DocumentScanner::clean_document_filter(&rgba, 1.2);
            image::DynamicImage::ImageLuma8(cleaned_gray)
                .write_to(&mut output_bytes, ImageFormat::Jpeg)
                .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
        }
        "bw" => {
            let cleaned_gray = otium_scanner::processor::DocumentScanner::clean_document_filter(&rgba, 2.2);
            image::DynamicImage::ImageLuma8(cleaned_gray)
                .write_to(&mut output_bytes, ImageFormat::Jpeg)
                .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
        }
        _ => return Ok(image_bytes),
    }

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
    fn test_bridge_scan_filters_pipeline() {
        let img = image::RgbaImage::from_pixel(100, 100, image::Rgba([220, 180, 120, 255]));
        let mut raw_bytes = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img).write_to(&mut raw_bytes, ImageFormat::Png).unwrap();
        let input_bytes = raw_bytes.into_inner();

        let magic = bridge_apply_scan_filter(input_bytes.clone(), "magic_color".to_string()).expect("magic_color");
        assert!(!magic.is_empty());

        let clean = bridge_apply_scan_filter(input_bytes.clone(), "clean_white".to_string()).expect("clean_white");
        assert!(!clean.is_empty());

        let bw = bridge_apply_scan_filter(input_bytes, "bw".to_string()).expect("bw");
        assert!(!bw.is_empty());
    }
}
