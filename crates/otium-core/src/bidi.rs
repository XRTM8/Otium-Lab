use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    Ltr,
    Rtl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum ArabicTypeface {
    #[default]
    Amiri,
    Almarai,
    Cairo,
    Tajawal,
    IbmPlexArabic,
}

impl ArabicTypeface {
    pub fn font_family(&self) -> &'static str {
        match self {
            ArabicTypeface::Amiri => "Amiri, serif",
            ArabicTypeface::Almarai => "Almarai, sans-serif",
            ArabicTypeface::Cairo => "Cairo, sans-serif",
            ArabicTypeface::Tajawal => "Tajawal, sans-serif",
            ArabicTypeface::IbmPlexArabic => "'IBM Plex Sans Arabic', sans-serif",
        }
    }
}

/// Detects whether a string has predominantly Right-to-Left (Arabic / Hebrew) characters.
pub fn detect_text_direction(text: &str) -> Direction {
    let mut rtl_count = 0;
    let mut ltr_count = 0;

    for ch in text.chars() {
        match ch {
            // Arabic, Arabic Supplement, Arabic Extended, Hebrew
            '\u{0590}'..='\u{05FF}' | '\u{0600}'..='\u{06FF}' | '\u{0750}'..='\u{077F}' | '\u{08A0}'..='\u{08FF}' => {
                rtl_count += 1;
            }
            // Basic Latin, Latin-1, Latin Extended
            'A'..='Z' | 'a'..='z' | '\u{00C0}'..='\u{024F}' => {
                ltr_count += 1;
            }
            _ => {}
        }
    }

    if rtl_count >= ltr_count && rtl_count > 0 {
        Direction::Rtl
    } else {
        Direction::Ltr
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bidi_detection() {
        assert_eq!(detect_text_direction("قارئ الكتب والوثائق"), Direction::Rtl);
        assert_eq!(detect_text_direction("Otium Calm Document Reader"), Direction::Ltr);
        assert_eq!(detect_text_direction("كتاب رقم 1 - Chapter 1"), Direction::Rtl);
    }
}
