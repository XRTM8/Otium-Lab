//! Native Android FFI bridge for Otium Mobile.
//! Dedicated solely to:
//! 1. High-speed document scanning (perspective warp & image filters)
//! 2. Arabic text root normalization & fast in-page search

use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

fn encode_jpeg_92(img: &image::DynamicImage) -> Result<Vec<u8>, BridgeError> {
    let mut output_bytes = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut output_bytes, 92);
    encoder
        .encode_image(img)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
    Ok(output_bytes.into_inner())
}

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
    let trimmed = query.trim();
    if trimmed.is_empty() || text.is_empty() {
        return Vec::new();
    }

    let utf8_matches = if trimmed.chars().any(char::is_whitespace) {
        otium_core::search::find_arabic_matches(&text, trimmed)
    } else {
        let stemmed = otium_core::search::find_arabic_stemmed_matches(&text, trimmed);
        if stemmed.is_empty() {
            otium_core::search::find_arabic_matches(&text, trimmed)
        } else {
            stemmed
        }
    };

    if utf8_matches.is_empty() {
        return Vec::new();
    }

    // Convert UTF-8 byte offsets into UTF-16 code unit indices in a single linear pass
    // so JVM/Kotlin String.substring(start, end) slices accurately for Arabic & emoji text.
    let mut utf16_pos = 0u32;
    let mut byte_cursor = 0usize;
    let mut char_iter = text.char_indices().peekable();
    let mut advance_to = |target_byte: usize| -> u32 {
        while let Some(&(b_idx, ch)) = char_iter.peek() {
            if b_idx >= target_byte {
                break;
            }
            char_iter.next();
            utf16_pos += ch.len_utf16() as u32;
            byte_cursor = b_idx + ch.len_utf8();
        }
        let _ = byte_cursor;
        utf16_pos
    };

    utf8_matches
        .into_iter()
        .map(|m| {
            let start_u16 = advance_to(m.start_offset);
            let end_u16 = advance_to(m.end_offset);
            ArabicMatchRecord {
                start_offset: start_u16,
                end_offset: end_u16,
            }
        })
        .collect()
}

#[derive(uniffi::Record, Clone, Copy, Debug)]
pub struct DetectedDocumentRecord {
    pub corners: CornerPoints,
    pub confidence: f32,
}

#[uniffi::export]
pub fn bridge_detect_document_edges(image_bytes: Vec<u8>) -> Option<DetectedDocumentRecord> {
    let dyn_img = image::load_from_memory(&image_bytes).ok()?;
    let detected = otium_scanner::detector::detect_document_quad(&dyn_img)?;
    Some(DetectedDocumentRecord {
        corners: CornerPoints {
            top_left_x: detected.quad.top_left.x,
            top_left_y: detected.quad.top_left.y,
            top_right_x: detected.quad.top_right.x,
            top_right_y: detected.quad.top_right.y,
            bottom_right_x: detected.quad.bottom_right.x,
            bottom_right_y: detected.quad.bottom_right.y,
            bottom_left_x: detected.quad.bottom_left.x,
            bottom_left_y: detected.quad.bottom_left.y,
        },
        confidence: detected.confidence,
    })
}

#[uniffi::export]
pub fn bridge_warp_and_filter(
    image_bytes: Vec<u8>,
    corners: CornerPoints,
    filter_mode: String,
) -> Result<Vec<u8>, BridgeError> {
    let dyn_img = image::load_from_memory(&image_bytes)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;

    let quad = otium_scanner::geometry::QuadCorners::new(
        otium_scanner::geometry::Point2D::new(corners.top_left_x, corners.top_left_y),
        otium_scanner::geometry::Point2D::new(corners.top_right_x, corners.top_right_y),
        otium_scanner::geometry::Point2D::new(corners.bottom_right_x, corners.bottom_right_y),
        otium_scanner::geometry::Point2D::new(corners.bottom_left_x, corners.bottom_left_y),
    );

    let warped_rgba = otium_scanner::processor::DocumentScanner::warp_perspective(&dyn_img, &quad, None)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;

    match filter_mode.as_str() {
        "magic_color" => {
            let filtered = otium_scanner::processor::DocumentScanner::magic_color_filter(&warped_rgba);
            encode_jpeg_92(&image::DynamicImage::ImageRgba8(filtered))
        }
        "clean_white" => {
            let cleaned = otium_scanner::processor::DocumentScanner::clean_document_filter(&warped_rgba, 1.2);
            encode_jpeg_92(&image::DynamicImage::ImageLuma8(cleaned))
        }
        "bw" => {
            let cleaned = otium_scanner::processor::DocumentScanner::clean_document_filter(&warped_rgba, 2.2);
            encode_jpeg_92(&image::DynamicImage::ImageLuma8(cleaned))
        }
        _ => encode_jpeg_92(&image::DynamicImage::ImageRgba8(warped_rgba)),
    }
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

    encode_jpeg_92(&image::DynamicImage::ImageRgba8(warped_rgba))
}

#[uniffi::export]
pub fn bridge_deskew_and_clean(image_bytes: Vec<u8>) -> Result<Vec<u8>, BridgeError> {
    let dyn_img = image::load_from_memory(&image_bytes)
        .map_err(|e| BridgeError::ImageProcessing { msg: e.to_string() })?;
    let rgba = dyn_img.to_rgba8();
    let deskewed = otium_scanner::processor::DocumentScanner::deskew_rgba(&rgba);
    let cleaned = otium_scanner::processor::DocumentScanner::remove_margin_fingers(&deskewed);
    encode_jpeg_92(&image::DynamicImage::ImageRgba8(cleaned))
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

    match filter_mode.as_str() {
        "magic_color" => {
            let filtered = otium_scanner::processor::DocumentScanner::magic_color_filter(&rgba);
            encode_jpeg_92(&image::DynamicImage::ImageRgba8(filtered))
        }
        "clean_white" => {
            let cleaned_gray = otium_scanner::processor::DocumentScanner::clean_document_filter(&rgba, 1.2);
            encode_jpeg_92(&image::DynamicImage::ImageLuma8(cleaned_gray))
        }
        "bw" => {
            let cleaned_gray = otium_scanner::processor::DocumentScanner::clean_document_filter(&rgba, 2.2);
            encode_jpeg_92(&image::DynamicImage::ImageLuma8(cleaned_gray))
        }
        _ => Ok(image_bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageFormat;

    #[test]
    fn test_bridge_arabic_stemming() {
        assert_eq!(bridge_arabic_stem("والكتاب".to_string()), "كتاب");
        assert_eq!(bridge_arabic_stem("المهندسين".to_string()), "مهندس");
    }

    #[test]
    fn test_bridge_find_arabic_matches() {
        let text = "هذا الكتاب مفيد جداً وكتابهم رائع".to_string();
        let matches = bridge_find_arabic_matches(text.clone(), "كتاب".to_string());
        assert_eq!(matches.len(), 2);

        let utf16: Vec<u16> = text.encode_utf16().collect();
        let s0 = String::from_utf16(&utf16[matches[0].start_offset as usize..matches[0].end_offset as usize]).unwrap();
        let s1 = String::from_utf16(&utf16[matches[1].start_offset as usize..matches[1].end_offset as usize]).unwrap();
        assert_eq!(s0, "الكتاب");
        assert_eq!(s1, "وكتابهم");
    }

    #[test]
    fn test_bridge_find_arabic_phrase_and_utf16_surrogates() {
        let text = "📖 قراءة الكِتَابِ المُفِيدِ في المساء".to_string();
        let matches = bridge_find_arabic_matches(text.clone(), "الكتاب المفيد".to_string());
        assert_eq!(matches.len(), 1);

        let utf16: Vec<u16> = text.encode_utf16().collect();
        let slice = String::from_utf16(&utf16[matches[0].start_offset as usize..matches[0].end_offset as usize]).unwrap();
        assert_eq!(slice, "الكِتَابِ المُفِيدِ");
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
