use serde::{Deserialize, Serialize};

use crate::stroke::{InkPoint, InkTool, Stroke};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InkCanvas {
    pub strokes: Vec<Stroke>,
    #[serde(skip)]
    pub undo_stack: Vec<Vec<Stroke>>,
    #[serde(skip)]
    pub redo_stack: Vec<Vec<Stroke>>,
    pub width: f32,
    pub height: f32,
}

impl InkCanvas {
    pub fn new(width: f32, height: f32) -> Self {
        Self {
            strokes: Vec::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            width,
            height,
        }
    }

    /// Evaluates if an input touch event is accidental palm contact
    pub fn is_palm_contact(radius_major: f32, pressure: f32) -> bool {
        // Stylus has high pressure and fine contact point radius (< 15 px).
        // Palm contact has broad contact radius (> 28 px) with low/diffuse pressure.
        radius_major > 28.0 && pressure < 0.2
    }

    pub fn begin_stroke(&mut self, stroke: Stroke) {
        self.undo_stack.push(self.strokes.clone());
        self.redo_stack.clear();
        self.strokes.push(stroke);
    }

    pub fn append_point(&mut self, point: InkPoint) {
        if let Some(current) = self.strokes.last_mut() {
            current.add_point(point);
        }
    }

    pub fn undo(&mut self) -> bool {
        if let Some(previous_state) = self.undo_stack.pop() {
            self.redo_stack.push(self.strokes.clone());
            self.strokes = previous_state;
            true
        } else {
            false
        }
    }

    pub fn redo(&mut self) -> bool {
        if let Some(next_state) = self.redo_stack.pop() {
            self.undo_stack.push(self.strokes.clone());
            self.strokes = next_state;
            true
        } else {
            false
        }
    }

    pub fn clear(&mut self) {
        if !self.strokes.is_empty() {
            self.undo_stack.push(self.strokes.clone());
            self.redo_stack.clear();
            self.strokes.clear();
        }
    }

    /// Export the canvas strokes as a standalone transparent SVG document
    pub fn export_svg(&self) -> String {
        let mut svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {:.2} {:.2}" width="100%" height="100%">"#,
            self.width, self.height
        );
        svg.push('\n');

        for stroke in &self.strokes {
            if stroke.tool == InkTool::Eraser {
                continue;
            }

            let blend = if stroke.tool == InkTool::Highlighter {
                r#" style="mix-blend-mode: multiply;""#
            } else {
                ""
            };

            let path_data = stroke.to_svg_path();
            svg.push_str(&format!(
                r#"  <path d="{}" fill="none" stroke="{}" stroke-width="{:.2}" stroke-linecap="round" stroke-linejoin="round" opacity="{:.2}"{} />"#,
                path_data, stroke.color_hex, stroke.base_width, stroke.opacity, blend
            ));
            svg.push('\n');
        }

        svg.push_str("</svg>");
        svg
    }
}
