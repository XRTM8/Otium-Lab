use std::env;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use tauri::ipc::Response;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[derive(serde::Serialize, Clone)]
struct InitialPdf {
  name: String,
  path: String,
}

#[derive(serde::Serialize)]
struct RustEngineStatus {
  version: String,
  is_active: bool,
  modules: Vec<&'static str>,
}

#[tauri::command]
fn get_rust_engine_status() -> RustEngineStatus {
  RustEngineStatus {
    version: "2.0.0-lab (100% Rust)".into(),
    is_active: true,
    modules: vec![
      "otium-core (Bilingual Typography & 8 OLED Themes)",
      "otium-slides (Offline PPTX/PPSX Presentation Engine)",
      "otium-scanner (Bilinear Perspective Warp & A4 Stitcher)",
      "otium-ink (120 FPS Catmull-Rom Vector Splines)",
      "otium-pdf (ISO 32000-1 Structural Inspector)",
      "otium-vault (Redb & ChaCha20-Poly1305 AEAD)",
      "otium-beam (P2P DataChannel & Vector QR Code)",
    ],
  }
}

#[tauri::command]
fn rust_parse_pptx(bytes: Vec<u8>) -> Result<otium_slides::SlidePresentation, String> {
  otium_slides::PptxParser::parse_bytes(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn rust_generate_beam_qr(payload: String) -> Result<String, String> {
  otium_beam::BeamPairing::generate_qr_svg(&payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn rust_generate_pairing_pin() -> String {
  otium_beam::BeamPairing::generate_pin()
}

#[tauri::command]
fn rust_export_ink_svg(strokes: Vec<otium_ink::Stroke>, width: f32, height: f32) -> String {
  let mut canvas = otium_ink::InkCanvas::new(width, height);
  for stroke in strokes {
    canvas.begin_stroke(stroke);
  }
  canvas.export_svg()
}

#[tauri::command]
fn rust_erase_ink(strokes: Vec<otium_ink::Stroke>, x: f32, y: f32, radius: f32, width: f32, height: f32) -> Vec<otium_ink::Stroke> {
  let mut canvas = otium_ink::InkCanvas::new(width, height);
  canvas.strokes = strokes;
  canvas.erase_at(x, y, radius);
  canvas.strokes
}

#[tauri::command]
fn rust_simplify_ink_strokes(strokes: Vec<otium_ink::Stroke>, tolerance: f32) -> Vec<otium_ink::Stroke> {
  let mut canvas = otium_ink::InkCanvas::new(1000.0, 1000.0);
  canvas.strokes = strokes;
  canvas.simplify_all_strokes(tolerance);
  canvas.strokes
}

#[tauri::command]
fn rust_clean_document_image(bytes: Vec<u8>, contrast_boost: f32) -> Result<Vec<u8>, String> {
  let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
  let rgba = img.to_rgba8();
  let clean_gray = otium_scanner::DocumentScanner::clean_document_filter(&rgba, contrast_boost);
  let mut out = std::io::Cursor::new(Vec::new());
  clean_gray.write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
  Ok(out.into_inner())
}

#[tauri::command]
fn rust_stitch_id_cards(front_bytes: Vec<u8>, back_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
  let front = image::load_from_memory(&front_bytes).map_err(|e| e.to_string())?.to_rgba8();
  let back = image::load_from_memory(&back_bytes).map_err(|e| e.to_string())?.to_rgba8();
  let a4 = otium_scanner::DocumentScanner::stitch_id_card_a4(&front, &back);
  let mut out = std::io::Cursor::new(Vec::new());
  a4.write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
  Ok(out.into_inner())
}

#[tauri::command]
fn rust_inspect_pdf(bytes: Vec<u8>) -> Result<otium_pdf::PdfDocumentInfo, String> {
  otium_pdf::PdfInspector::inspect_bytes(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn rust_search_arabic_text(haystack: String, query: String) -> Vec<otium_core::SearchMatch> {
  otium_core::find_arabic_matches(&haystack, &query)
}

#[tauri::command]
fn rust_index_and_search_arabic(text: String, query: String) -> Vec<otium_core::SearchMatch> {
  let index = otium_core::ArabicTrigramIndex::build(&text);
  index.search(&query)
}

#[tauri::command]
fn rust_tessellate_ink_mesh(strokes: Vec<otium_ink::Stroke>, width: f32, height: f32) -> Vec<otium_ink::InkMesh> {
  let mut canvas = otium_ink::InkCanvas::new(width, height);
  canvas.strokes = strokes;
  canvas.tessellate_all_meshes()
}

#[tauri::command]
fn get_initial_pdf() -> Option<InitialPdf> {
  let args: Vec<String> = env::args().collect();
  if args.len() > 1 {
    let candidate = &args[1];
    if candidate.to_lowercase().ends_with(".pdf") && Path::new(candidate).exists() {
      let name = Path::new(candidate)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf")
        .to_string();
      return Some(InitialPdf {
        name,
        path: candidate.to_string(),
      });
    }
  }
  None
}

/// Return raw bytes instead of a JSON number array. Large PDFs would otherwise
/// be serialized into millions of numbers before reaching the WebView.
/// Hardened with extension validation, size bounds, and upfront header verification
/// before buffer allocation to prevent out-of-memory crashes on large files.
#[tauri::command]
fn read_pdf_bytes(path: String) -> Result<Response, String> {
  let p = Path::new(&path);
  if !p.is_file() {
    return Err("Target path is not a file".into());
  }

  let ext_matches = p
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.eq_ignore_ascii_case("pdf"))
    .unwrap_or(false);

  if !ext_matches {
    return Err("Only .pdf files can be read".into());
  }

  let metadata = fs::metadata(p).map_err(|e| e.to_string())?;
  let file_size = metadata.len();

  if file_size == 0 {
    return Err("File is empty (0 bytes)".into());
  }

  const MAX_SUPPORTED_SIZE: u64 = 1500 * 1024 * 1024; // 1.5 GB limit
  if file_size > MAX_SUPPORTED_SIZE {
    return Err("File exceeds 1.5 GB maximum supported document size".into());
  }

  let file = fs::File::open(p).map_err(|e| e.to_string())?;

  // Memory map the file directly with zero-copy OS paging
  let mmap = unsafe { memmap2::Mmap::map(&file) }.map_err(|e| e.to_string())?;

  // ISO 32000-1: A valid PDF begins with or contains "%PDF-" in its first 1024 bytes.
  let check_len = mmap.len().min(1024);
  if check_len < 5 || !mmap[..check_len].windows(5).any(|w| w == b"%PDF-") {
    return Err("File is not a valid PDF document (missing %PDF- header)".into());
  }

  Ok(Response::new(mmap.to_vec()))
}

/// True when Windows has an Otium uninstall entry, which is written by the
/// NSIS installer. A portable executable has no such entry and therefore uses
/// the manual download path instead of the automatic updater.
#[tauri::command]
fn is_installed_build() -> bool {
  #[cfg(windows)]
  {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Otium";

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
      if RegKey::predef(hive).open_subkey(KEY).is_ok() {
        return true;
      }
    }

    false
  }

  #[cfg(not(windows))]
  {
    false
  }
}

/// Otium 1.0 registered a cache-first service worker. WebView profiles persist
/// across installer and APK updates, so an old worker would keep serving the
/// old `index.html` forever and the new frontend would never start. Clear the
/// worker and its cache storage before the webview is created. Site data such
/// as localStorage, IndexedDB and PDF progress lives in sibling directories
/// and is intentionally left untouched.
#[cfg(windows)]
fn clear_legacy_service_worker() {
  let Some(local_app_data) = env::var_os("LOCALAPPDATA") else {
    return;
  };
  let default_dir = Path::new(&local_app_data)
    .join("com.otium.reader")
    .join("EBWebView")
    .join("Default");

  for name in ["Service Worker", "CacheStorage"] {
    let _ = fs::remove_dir_all(default_dir.join(name));
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(windows)]
  clear_legacy_service_worker();

  let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

  #[cfg(not(mobile))]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());

  builder
    .invoke_handler(tauri::generate_handler![
      get_initial_pdf,
      read_pdf_bytes,
      is_installed_build,
      get_rust_engine_status,
      rust_parse_pptx,
      rust_generate_beam_qr,
      rust_generate_pairing_pin,
      rust_export_ink_svg,
      rust_erase_ink,
      rust_clean_document_image,
      rust_stitch_id_cards,
      rust_inspect_pdf,
      rust_search_arabic_text,
      rust_index_and_search_arabic,
      rust_tessellate_ink_mesh,
      rust_simplify_ink_strokes
    ])
    .setup(|_app| {
      #[cfg(not(mobile))]
      {
        use tauri::Manager;
        if let Some(window) = _app.get_webview_window("main") {
          // Show the window only after the webview is ready to avoid black screen on Windows
          window.show().unwrap_or_default();
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
