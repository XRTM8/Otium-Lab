use otium_app::AppState;
use otium_core::ArabicTypeface;
use otium_ink::{InkCanvas, InkPoint, InkTool, Stroke};
use otium_scanner::{Point2D, QuadCorners};

fn main() {
    println!(r#"
  ██████╗ ████████╗██╗██╗   ██╗███╗   ███╗
 ██╔═══██╗╚══██╔══╝██║██║   ██║████╗ ████║
 ██║   ██║   ██║   ██║██║   ██║██╔████╔██║
 ██║   ██║   ██║   ██║██║   ██║██║╚██╔╝██║
 ╚██████╔╝   ██║   ██║╚██████╔╝██║ ╚═╝ ██║
  ╚═════╝    ╚═╝   ╚═╝ ╚═════╝ ╚═╝     ╚═╝
   Otium Sovereign Reader - 100% Rust Engine
    "#);

    let mut state = AppState::new();
    println!("✓ Active Theme: {} ({})", state.palette().name, state.palette().name_ar);
    println!("✓ Background OLED Canvas: {}", state.palette().bg_canvas);

    // 1. Verify Ink Engine
    let mut canvas = InkCanvas::new(800.0, 600.0);
    let mut stroke = Stroke::new("s1".into(), InkTool::Pen, "#10B981".into(), 3.0, 1.0);
    stroke.add_point(InkPoint::new(10.0, 10.0, 0.8, 100));
    stroke.add_point(InkPoint::new(25.0, 30.0, 0.8, 120));
    stroke.add_point(InkPoint::new(50.0, 80.0, 0.8, 140));
    canvas.begin_stroke(stroke);
    let svg = canvas.export_svg();
    println!("✓ Ink Engine: generated {} bytes of smooth vector SVG", svg.len());

    // 2. Verify Scanner Engine
    let corners = QuadCorners::new(
        Point2D::new(10.0, 10.0),
        Point2D::new(400.0, 20.0),
        Point2D::new(390.0, 600.0),
        Point2D::new(15.0, 590.0),
    );
    let (tw, th) = corners.estimate_target_dimensions();
    println!("✓ Scanner Engine: perspective target rect computed as {}x{} px", tw, th);

    // 3. Verify Smart Beam
    let (pin, qr_svg) = state.start_beam_session();
    println!("✓ Smart Beam Engine: Pairing PIN [{pin}], QR code generated ({} bytes SVG)", qr_svg.len());

    // 4. Verify Arabic Typography
    let arabic_font = ArabicTypeface::Cairo;
    println!("✓ Arabic Typography: Primary font family: {}", arabic_font.font_family());

    println!("\nAll 100% Rust engines initialized successfully.");
}
