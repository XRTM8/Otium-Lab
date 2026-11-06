use serde::{Deserialize, Serialize};

use otium_beam::BeamPairing;
use otium_core::{
    DocumentMetadata, PageRotation, ThemeMode, ThemePalette, ViewMode, ZoomLevel,
};
use otium_ink::InkCanvas;
use otium_slides::SlidePresentation;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub current_theme: ThemeMode,
    pub view_mode: ViewMode,
    pub zoom: ZoomLevel,
    pub rotation: PageRotation,
    pub active_document: Option<DocumentMetadata>,
    pub active_presentation: Option<SlidePresentation>,
    pub active_canvas: InkCanvas,
    pub current_page: usize,
    pub total_pages: usize,
    pub is_sidebar_open: bool,
    pub is_scanner_open: bool,
    pub is_beam_open: bool,
    pub beam_pin: Option<String>,
    pub is_vault_unlocked: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_theme: ThemeMode::Obsidian,
            view_mode: ViewMode::SinglePage,
            zoom: ZoomLevel::FitWidth,
            rotation: PageRotation::Rotate0,
            active_document: None,
            active_presentation: None,
            active_canvas: InkCanvas::new(1920.0, 1080.0),
            current_page: 1,
            total_pages: 1,
            is_sidebar_open: false,
            is_scanner_open: false,
            is_beam_open: false,
            beam_pin: None,
            is_vault_unlocked: false,
        }
    }
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_theme(&mut self, theme: ThemeMode) {
        self.current_theme = theme;
    }

    pub fn cycle_theme(&mut self) {
        self.current_theme = match self.current_theme {
            ThemeMode::Obsidian => ThemeMode::MidnightAzure,
            ThemeMode::MidnightAzure => ThemeMode::WarmAmber,
            ThemeMode::WarmAmber => ThemeMode::PureAmethyst,
            ThemeMode::PureAmethyst => ThemeMode::RubyCrimson,
            ThemeMode::RubyCrimson => ThemeMode::NaturalPaper,
            ThemeMode::NaturalPaper => ThemeMode::CrystalDiamond,
            ThemeMode::CrystalDiamond => ThemeMode::EInk,
            ThemeMode::EInk => ThemeMode::Obsidian,
        };
    }

    pub fn cycle_view_mode(&mut self) {
        self.view_mode = match self.view_mode {
            ViewMode::SinglePage => ViewMode::ContinuousScroll,
            ViewMode::ContinuousScroll => ViewMode::DualSpread,
            ViewMode::DualSpread => ViewMode::SinglePage,
        };
    }

    pub fn palette(&self) -> ThemePalette {
        self.current_theme.palette()
    }

    pub fn next_page(&mut self) -> bool {
        if self.current_page < self.total_pages {
            self.current_page += 1;
            true
        } else {
            false
        }
    }

    pub fn prev_page(&mut self) -> bool {
        if self.current_page > 1 {
            self.current_page -= 1;
            true
        } else {
            false
        }
    }

    pub fn start_beam_session(&mut self) -> (String, String) {
        let pin = BeamPairing::generate_pin();
        self.beam_pin = Some(pin.clone());
        self.is_beam_open = true;
        let qr_payload = format!("otium://beam?pin={pin}");
        let qr_svg = BeamPairing::generate_qr_svg(&qr_payload).unwrap_or_default();
        (pin, qr_svg)
    }
}
