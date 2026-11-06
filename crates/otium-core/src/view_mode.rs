use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ViewMode {
    /// Distinct single page view with discrete page flips.
    #[default]
    SinglePage,
    /// Smooth continuous vertical scrolling stream.
    ContinuousScroll,
    /// Traditional book spread with subtle spine divider between facing pages.
    DualSpread,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ZoomLevel {
    FitWidth,
    FitPage,
    ActualSize,
    Scale(f32),
}

impl Default for ZoomLevel {
    fn default() -> Self {
        ZoomLevel::FitWidth
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PageRotation {
    #[default]
    Rotate0,
    Rotate90,
    Rotate180,
    Rotate270,
}

impl PageRotation {
    pub fn degrees(&self) -> u32 {
        match self {
            PageRotation::Rotate0 => 0,
            PageRotation::Rotate90 => 90,
            PageRotation::Rotate180 => 180,
            PageRotation::Rotate270 => 270,
        }
    }

    pub fn next_clockwise(&self) -> Self {
        match self {
            PageRotation::Rotate0 => PageRotation::Rotate90,
            PageRotation::Rotate90 => PageRotation::Rotate180,
            PageRotation::Rotate180 => PageRotation::Rotate270,
            PageRotation::Rotate270 => PageRotation::Rotate0,
        }
    }
}
