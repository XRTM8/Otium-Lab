use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct InkPoint {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub timestamp_ms: u64,
}

impl InkPoint {
    pub const fn new(x: f32, y: f32, pressure: f32, timestamp_ms: u64) -> Self {
        Self {
            x,
            y,
            pressure,
            timestamp_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InkTool {
    Pen,
    Highlighter,
    Eraser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stroke {
    pub id: String,
    pub tool: InkTool,
    pub color_hex: String,
    pub base_width: f32,
    pub opacity: f32,
    pub points: Vec<InkPoint>,
}

impl Stroke {
    pub fn new(id: String, tool: InkTool, color_hex: String, base_width: f32, opacity: f32) -> Self {
        Self {
            id,
            tool,
            color_hex,
            base_width,
            opacity,
            points: Vec::new(),
        }
    }

    pub fn add_point(&mut self, point: InkPoint) {
        self.points.push(point);
    }

    /// Converts the sequence of ink points into a smooth SVG Path string using Catmull-Rom splines / quadratic curves
    pub fn to_svg_path(&self) -> String {
        if self.points.is_empty() {
            return String::new();
        }

        if self.points.len() == 1 {
            let p = &self.points[0];
            return format!("M {} {} L {:.2} {:.2}", p.x, p.y, p.x + 0.1, p.y + 0.1);
        }

        let mut path = format!("M {:.2} {:.2}", self.points[0].x, self.points[0].y);

        if self.points.len() == 2 {
            path.push_str(&format!(
                " L {:.2} {:.2}",
                self.points[1].x, self.points[1].y
            ));
            return path;
        }

        for i in 1..self.points.len() - 1 {
            let p0 = &self.points[i];
            let p1 = &self.points[i + 1];
            let mid_x = (p0.x + p1.x) / 2.0;
            let mid_y = (p0.y + p1.y) / 2.0;
            path.push_str(&format!(
                " Q {:.2} {:.2}, {:.2} {:.2}",
                p0.x, p0.y, mid_x, mid_y
            ));
        }

        if let Some(last) = self.points.last() {
            path.push_str(&format!(" L {:.2} {:.2}", last.x, last.y));
        }

        path
    }
}
