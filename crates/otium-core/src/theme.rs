use serde::{Deserialize, Serialize};

/// Otium's 4 refined functional themes designed for distraction-free reading.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeMode {
    /// Pure deep black (#000000) for OLED battery preservation and dark environments.
    #[default]
    #[serde(alias = "obsidian", alias = "midnight-azure", alias = "amoled")]
    OledBlack,
    /// Warm cozy sepia amber (#18130E) for night reading without blue light.
    #[serde(alias = "warm-amber", alias = "amber", alias = "pure-amethyst", alias = "ruby-crimson")]
    WarmSepia,
    /// Authentic natural tactile paper texture (#F7F4EE background / #1E1C19 ink) for daytime.
    #[serde(alias = "natural-paper", alias = "paper", alias = "pure")]
    DayPaper,
    /// High-contrast monochromatic paper (#ECECEC / #0F0F0F) mirroring E-Ink displays.
    #[serde(alias = "e-ink", alias = "eink", alias = "crystal-diamond")]
    EInkMono,
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
            ThemeMode::OledBlack => ThemePalette {
                id: ThemeMode::OledBlack,
                name: "OLED Dark".into(),
                name_ar: "سواد الليل".into(),
                bg_canvas: "#000000".into(),
                bg_surface: "#0A0A0C".into(),
                bg_card: "#141418".into(),
                text_primary: "#EDEDED".into(),
                text_secondary: "#A1A1A1".into(),
                text_muted: "#666666".into(),
                border: "#202026".into(),
                accent: "#10B981".into(),
                spine_divider: "#121216".into(),
                is_dark: true,
            },
            ThemeMode::WarmSepia => ThemePalette {
                id: ThemeMode::WarmSepia,
                name: "Warm Sepia".into(),
                name_ar: "السيبيا الدافئ".into(),
                bg_canvas: "#18130E".into(),
                bg_surface: "#221B14".into(),
                bg_card: "#2E241B".into(),
                text_primary: "#FDE68A".into(),
                text_secondary: "#D97706".into(),
                text_muted: "#92400E".into(),
                border: "#3D3024".into(),
                accent: "#F59E0B".into(),
                spine_divider: "#261D15".into(),
                is_dark: true,
            },
            ThemeMode::DayPaper => ThemePalette {
                id: ThemeMode::DayPaper,
                name: "Day Paper".into(),
                name_ar: "الورق النهاري".into(),
                bg_canvas: "#F7F4EE".into(),
                bg_surface: "#EFEAE0".into(),
                bg_card: "#E5DFD3".into(),
                text_primary: "#1E1C19".into(),
                text_secondary: "#4D463E".into(),
                text_muted: "#786E63".into(),
                border: "#DAD2C3".into(),
                accent: "#D97706".into(),
                spine_divider: "#D2C9B8".into(),
                is_dark: false,
            },
            ThemeMode::EInkMono => ThemePalette {
                id: ThemeMode::EInkMono,
                name: "E-Ink Mono".into(),
                name_ar: "الحبر الإلكتروني".into(),
                bg_canvas: "#ECECEC".into(),
                bg_surface: "#E0E0E0".into(),
                bg_card: "#D4D4D4".into(),
                text_primary: "#0F0F0F".into(),
                text_secondary: "#383838".into(),
                text_muted: "#616161".into(),
                border: "#BFBFBF".into(),
                accent: "#404040".into(),
                spine_divider: "#B0B0B0".into(),
                is_dark: false,
            },
        }
    }
}
