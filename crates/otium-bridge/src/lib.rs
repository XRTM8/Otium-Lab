//! Native Android FFI bridge for Otium Reader.
//! Dedicated to high-speed Arabic text root normalization & in-page search.

uniffi::setup_scaffolding!();

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

    let mut utf16_pos = 0u32;
    let mut char_iter = text.char_indices().peekable();
    let mut advance_to = |target_byte: usize| -> u32 {
        while let Some(&(b_idx, ch)) = char_iter.peek() {
            if b_idx >= target_byte {
                break;
            }
            char_iter.next();
            utf16_pos += ch.len_utf16() as u32;
        }
        utf16_pos
    };

    utf8_matches
        .into_iter()
        .map(|m| ArabicMatchRecord {
            start_offset: advance_to(m.start_offset),
            end_offset: advance_to(m.end_offset),
        })
        .collect()
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
}
