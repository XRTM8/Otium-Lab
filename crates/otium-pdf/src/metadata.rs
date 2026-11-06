use std::io::Cursor;
use lopdf::Document as LoDocument;
use serde::{Deserialize, Serialize};

use otium_core::{OtiumError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfPageInfo {
    pub page_number: usize,
    pub width_pt: f32,
    pub height_pt: f32,
    pub rotation: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfDocumentInfo {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_count: usize,
    pub version: String,
    pub pages: Vec<PdfPageInfo>,
}

pub struct PdfInspector;

impl PdfInspector {
    /// Validates ISO 32000-1 magic header bytes `%PDF-` before parsing.
    pub fn validate_header(bytes: &[u8]) -> Result<()> {
        if bytes.len() < 5 {
            return Err(OtiumError::Format("File is smaller than 5 bytes".into()));
        }
        let check_len = bytes.len().min(1024);
        if !bytes[..check_len].windows(5).any(|w| w == b"%PDF-") {
            return Err(OtiumError::Format(
                "File is not a valid PDF document (missing %PDF- header)".into(),
            ));
        }
        Ok(())
    }

    /// Inspect a PDF from bytes and extract page information and metadata.
    pub fn inspect_bytes(bytes: &[u8]) -> Result<PdfDocumentInfo> {
        Self::validate_header(bytes)?;

        let doc = LoDocument::load_from(Cursor::new(bytes))
            .map_err(|e| OtiumError::Format(format!("Failed to parse PDF catalog: {e}")))?;

        let page_count = doc.get_pages().len();
        let pages_map = doc.get_pages();

        let mut pages = Vec::with_capacity(page_count);
        for page_num in 1..=page_count {
            if let Some(&page_id) = pages_map.get(&(page_num as u32)) {
                let mut width = 595.28; // Default A4 portrait
                let mut height = 841.89;

                if let Ok(page_dict) = doc.get_dictionary(page_id) {
                    if let Ok(media_box) = page_dict.get(b"MediaBox").and_then(|obj| obj.as_array()) {
                        if media_box.len() >= 4 {
                            let x1 = media_box[0].as_float().unwrap_or(0.0);
                            let y1 = media_box[1].as_float().unwrap_or(0.0);
                            let x2 = media_box[2].as_float().unwrap_or(595.28);
                            let y2 = media_box[3].as_float().unwrap_or(841.89);
                            width = (x2 - x1).abs();
                            height = (y2 - y1).abs();
                        }
                    }
                }

                pages.push(PdfPageInfo {
                    page_number: page_num,
                    width_pt: width,
                    height_pt: height,
                    rotation: 0,
                });
            }
        }

        Ok(PdfDocumentInfo {
            title: None,
            author: None,
            page_count,
            version: doc.version.clone(),
            pages,
        })
    }
}
