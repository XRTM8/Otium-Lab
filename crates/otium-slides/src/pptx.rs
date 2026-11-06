use std::io::{Cursor, Read};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use zip::ZipArchive;

use crate::model::{
    emu_to_points, Paragraph, RectBounds, Slide, SlideElement, SlidePresentation, TextAlignment,
    TextRun,
};
use otium_core::{OtiumError, Result};

pub struct PptxParser;

impl PptxParser {
    /// Parse a PowerPoint (.pptx / .ppsx) file from raw bytes.
    pub fn parse_bytes(bytes: &[u8]) -> Result<SlidePresentation> {
        let reader = Cursor::new(bytes);
        let mut archive = ZipArchive::new(reader)
            .map_err(|e| OtiumError::Format(format!("Failed to open PPTX zip container: {e}")))?;

        // 1. Discover slide dimensions from ppt/presentation.xml
        let (slide_width_pt, slide_height_pt) = Self::parse_presentation_dimensions(&mut archive)?;

        // 2. Discover and parse each slide in ppt/slides/slide{N}.xml
        let mut slide_names = Vec::new();
        for i in 0..archive.len() {
            let file = archive
                .by_index(i)
                .map_err(|e| OtiumError::Format(e.to_string()))?;
            let name = file.name().to_string();
            if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                slide_names.push(name);
            }
        }

        // Sort slide names numerically slide1, slide2, etc.
        slide_names.sort_by_key(|name| {
            name.trim_start_matches("ppt/slides/slide")
                .trim_end_matches(".xml")
                .parse::<usize>()
                .unwrap_or(0)
        });

        let mut slides = Vec::with_capacity(slide_names.len());
        for (idx, slide_name) in slide_names.iter().enumerate() {
            let mut slide_xml = String::new();
            {
                let mut file = archive
                    .by_name(slide_name)
                    .map_err(|e| OtiumError::Format(format!("Failed reading {slide_name}: {e}")))?;
                file.read_to_string(&mut slide_xml)?;
            }

            let slide = Self::parse_single_slide(idx + 1, &slide_xml)?;
            slides.push(slide);
        }

        Ok(SlidePresentation {
            title: "Presentation".into(),
            slide_width_pt,
            slide_height_pt,
            slides,
        })
    }

    fn parse_presentation_dimensions<R: Read + std::io::Seek>(
        archive: &mut ZipArchive<R>,
    ) -> Result<(f32, f32)> {
        let mut xml_content = String::new();
        if let Ok(mut file) = archive.by_name("ppt/presentation.xml") {
            let _ = file.read_to_string(&mut xml_content);
        }

        // Default to standard 16:9 widescreen: 13.333 x 7.5 inches -> 960 x 540 pt
        let mut width = 960.0;
        let mut height = 540.0;

        let mut reader = Reader::from_str(&xml_content);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                    let local_name = e.local_name();
                    if local_name.as_ref() == b"sldSz" {
                        for attr in e.attributes().flatten() {
                            if attr.key.local_name().as_ref() == b"cx" {
                                if let Ok(val_str) = std::str::from_utf8(&attr.value) {
                                    if let Ok(emu) = val_str.parse::<i64>() {
                                        width = emu_to_points(emu);
                                    }
                                }
                            } else if attr.key.local_name().as_ref() == b"cy" {
                                if let Ok(val_str) = std::str::from_utf8(&attr.value) {
                                    if let Ok(emu) = val_str.parse::<i64>() {
                                        height = emu_to_points(emu);
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        Ok((width, height))
    }

    fn parse_single_slide(index: usize, xml_content: &str) -> Result<Slide> {
        let mut reader = Reader::from_str(xml_content);
        reader.config_mut().trim_text(true);

        let mut elements = Vec::new();
        let mut buf = Vec::new();

        let mut in_text_body = false;
        let mut current_paragraphs = Vec::new();
        let mut current_runs = Vec::new();
        let mut current_text = String::new();
        let mut is_bold = false;
        let mut is_italic = false;
        let mut font_size_pt = 14.0;
        let mut color_hex = None;
        let mut slide_title = None;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let local_name = e.local_name();
                    match local_name.as_ref() {
                        b"txBody" => in_text_body = true,
                        b"p" => {
                            current_runs.clear();
                        }
                        b"rPr" => {
                            for attr in e.attributes().flatten() {
                                if attr.key.local_name().as_ref() == b"b" {
                                    is_bold = attr.value.as_ref() == b"1";
                                } else if attr.key.local_name().as_ref() == b"i" {
                                    is_italic = attr.value.as_ref() == b"1";
                                } else if attr.key.local_name().as_ref() == b"sz" {
                                    if let Ok(val) = std::str::from_utf8(&attr.value) {
                                        if let Ok(sz) = val.parse::<f32>() {
                                            font_size_pt = sz / 100.0;
                                        }
                                    }
                                }
                            }
                        }
                        b"srgbClr" => {
                            for attr in e.attributes().flatten() {
                                if attr.key.local_name().as_ref() == b"val" {
                                    if let Ok(val) = std::str::from_utf8(&attr.value) {
                                        color_hex = Some(format!("#{val}"));
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Text(ref e)) => {
                    if in_text_body {
                        if let Ok(txt) = e.unescape() {
                            current_text.push_str(&txt);
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    let local_name = e.local_name();
                    match local_name.as_ref() {
                        b"t" => {
                            if !current_text.is_empty() {
                                if slide_title.is_none() && current_text.len() < 100 {
                                    slide_title = Some(current_text.clone());
                                }
                                current_runs.push(TextRun {
                                    text: std::mem::take(&mut current_text),
                                    font_name: None,
                                    font_size_pt,
                                    is_bold,
                                    is_italic,
                                    is_underline: false,
                                    color_hex: color_hex.clone(),
                                });
                            }
                        }
                        b"p" => {
                            if !current_runs.is_empty() {
                                current_paragraphs.push(Paragraph {
                                    alignment: TextAlignment::Left,
                                    runs: std::mem::take(&mut current_runs),
                                });
                            }
                        }
                        b"txBody" => {
                            in_text_body = false;
                            if !current_paragraphs.is_empty() {
                                elements.push(SlideElement::TextBox {
                                    bounds: RectBounds {
                                        x: 50.0,
                                        y: 50.0,
                                        width: 800.0,
                                        height: 400.0,
                                    },
                                    paragraphs: std::mem::take(&mut current_paragraphs),
                                });
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        Ok(Slide {
            index,
            title: slide_title,
            elements,
            background_color: None,
            notes: None,
        })
    }
}
