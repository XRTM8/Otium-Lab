use serde::{Deserialize, Serialize};

/// Otium's 8 OLED-optimized visual themes designed for distraction-free reading.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeMode {
    /// Pure deep black (#000000) for OLED battery preservation and minimum light emissions.
    #[default]
    Obsidian,
    /// Deep midnight azure with cool blue tones (#0B132B).
    MidnightAzure,
    /// Warm cozy sepia amber (#1C160E) for night reading.
    WarmAmber,
    /// Soft velvety purple-tinted obsidian (#140D1F).
    PureAmethyst,
    /// Dark ruby crimson (#1A0B0E) for night vision preservation.
    RubyCrimson,
    /// Authentic natural tactile paper texture (#F4EEDD background / #2C2621 ink).
    NaturalPaper,
    /// Sleek modern crystal diamond steel (#0D1117).
    CrystalDiamond,
    /// High-contrast monochromatic black and white (#FFFFFF / #000000) mirroring E-Ink displays.
    EInk,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThemePalette {
    pub id: ThemeMode,
    pub name: String,
    pub name_ar: String,
    pub bg_canvas: String,
    pub bg_surface: String,
    pub bg_card: String,
    pub text_primary: String,
    pub text_secondary: String,
    pub text_muted: String,
    pub border: String,
    pub accent: String,
    pub spine_divider: String,
    pub is_dark: bool,
}

impl ThemeMode {
    pub fn palette(&self) -> ThemePalette {
        match self {
            ThemeMode::Obsidian => ThemePalette {
                id: ThemeMode::Obsidian,
                name: "Obsidian Black".into(),
                name_ar: "حجر السج الأسود".into(),
                bg_canvas: "#000000".into(),
                bg_surface: "#080808".into(),
                bg_card: "#121212".into(),
                text_primary: "#EDEDED".into(),
                text_secondary: "#A1A1A1".into(),
                text_muted: "#666666".into(),
                border: "#1F1F1F".into(),
                accent: "#10B981".into(),
                spine_divider: "#1A1A1A".into(),
                is_dark: true,
            },
            ThemeMode::MidnightAzure => ThemePalette {
                id: ThemeMode::MidnightAzure,
                name: "Midnight Azure".into(),
                name_ar: "أزرق منتصف الليل".into(),
                bg_canvas: "#0B132B".into(),
                bg_surface: "#1C2541".into(),
                bg_card: "#263252".into(),
                text_primary: "#E2E8F0".into(),
                text_secondary: "#94A3B8".into(),
                text_muted: "#64748B".into(),
                border: "#2A3859".into(),
                accent: "#38BDF8".into(),
                spine_divider: "#1E2A47".into(),
                is_dark: true,
            },
            ThemeMode::WarmAmber => ThemePalette {
                id: ThemeMode::WarmAmber,
                name: "Warm Amber".into(),
                name_ar: "العنبر الدافئ".into(),
                bg_canvas: "#1A140E".into(),
                bg_surface: "#261D15".into(),
                bg_card: "#34281D".into(),
                text_primary: "#FDE68A".into(),
                text_secondary: "#D97706".into(),
                text_muted: "#92400E".into(),
                border: "#3F3022".into(),
                accent: "#F59E0B".into(),
                spine_divider: "#2B2117".into(),
                is_dark: true,
            },
            ThemeMode::PureAmethyst => ThemePalette {
                id: ThemeMode::PureAmethyst,
                name: "Pure Amethyst".into(),
                name_ar: "الجمشت النقي".into(),
                bg_canvas: "#140D1F".into(),
                bg_surface: "#211533".into(),
                bg_card: "#2F1E4A".into(),
                text_primary: "#F3E8FF".into(),
                text_secondary: "#C084FC".into(),
                text_muted: "#7E22CE".into(),
                border: "#3B255C".into(),
                accent: "#A855F7".into(),
                spine_divider: "#26183B".into(),
                is_dark: true,
            },
            ThemeMode::RubyCrimson => ThemePalette {
                id: ThemeMode::RubyCrimson,
                name: "Ruby Crimson".into(),
                name_ar: "الياقوت القرمزي".into(),
                bg_canvas: "#18090C".into(),
                bg_surface: "#291116".into(),
                bg_card: "#3A1A21".into(),
                text_primary: "#FFE4E6".into(),
                text_secondary: "#FB7185".into(),
                text_muted: "#BE123C".into(),
                border: "#48202A".into(),
                accent: "#F43F5E".into(),
                spine_divider: "#2E1319".into(),
                is_dark: true,
            },
            ThemeMode::NaturalPaper => ThemePalette {
                id: ThemeMode::NaturalPaper,
                name: "Natural Paper".into(),
                name_ar: "الورق الطبيعي".into(),
                bg_canvas: "#F4EEDD".into(),
                bg_surface: "#EBE3CE".into(),
                bg_card: "#E0D7BF".into(),
                text_primary: "#2C2621".into(),
                text_secondary: "#5C5349".into(),
                text_muted: "#8C8072".into(),
                border: "#D5C9AE".into(),
                accent: "#8B5CF6".into(),
                spine_divider: "#C8BA9C".into(),
                is_dark: false,
            },
            ThemeMode::CrystalDiamond => ThemePalette {
                id: ThemeMode::CrystalDiamond,
                name: "Crystal Diamond".into(),
                name_ar: "الماس البلوري".into(),
                bg_canvas: "#0D1117".into(),
                bg_surface: "#161B22".into(),
                bg_card: "#21262D".into(),
                text_primary: "#F0F6FC".into(),
                text_secondary: "#8B949E".into(),
                text_muted: "#484F58".into(),
                border: "#30363D".into(),
                accent: "#58A6FF".into(),
                spine_divider: "#252B33".into(),
                is_dark: true,
            },
            ThemeMode::EInk => ThemePalette {
                id: ThemeMode::EInk,
                name: "E-Ink Monochrome".into(),
                name_ar: "حبر إلكتروني (E-Ink)".into(),
                bg_canvas: "#FFFFFF".into(),
                bg_surface: "#F3F4F6".into(),
                bg_card: "#E5E7EB".into(),
                text_primary: "#000000".into(),
                text_secondary: "#1F2937".into(),
                text_muted: "#4B5563".into(),
                border: "#000000".into(),
                accent: "#000000".into(),
                spine_divider: "#9CA3AF".into(),
                is_dark: false,
            },
        }
    }
}
