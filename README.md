# Otium Mobile Native (Android)

> The Sovereign, Ultra-Fast, Distraction-Free PDF Reader & Document Scanner for Android.  
> Built natively with **Kotlin**, **Jetpack Compose**, **CameraX**, and an offline **Rust Shared Core**.

---

## ⚡ Architectural Foundations & Implemented Features

1. **Lightweight Native PDF Viewer:** Fast native rendering via Android `PdfRenderer` with an adaptive memory LRU cache.
2. **Arabic-First Morphological Search Engine:** Morphological light stemming (`arabic_light_stem`) and diacritic-tolerant root matching powered by an offline Rust core (`crates/otium-core`) through UniFFI JNI bridge (`crates/otium-bridge`).
3. **Table of Contents (Outlines/Bookmarks):** Digital chapter navigation and outline hierarchy tree extraction.
4. **Hardware Volume Key Page Turn:** Instant physical button page navigation for comfortable single-handed reading.
5. **CameraX Document Scanner:** Perspective correction, warp, and clean enhancement filters powered by Rust math (`crates/otium-scanner` & `otium-scan-math`).
6. **Reading Eye Comfort Palettes:** Pure Studio White, Warm Japanese Book Paper (Cream), and 100% AMOLED Pitch Black.

---

## 🗺️ Roadmap & Upcoming Modules

- [ ] **Zero-Knowledge Vault (`crates/otium-vault`):** Argon2id + ChaCha20-Poly1305 biometric document encryption.
- [ ] **Local P2P Smart Beam (`crates/otium-beam`):** Encrypted local Wi-Fi / WebRTC sync with desktop.
- [ ] **Vector Ink & ISO Annotations (`crates/otium-ink`):** Direct ISO 32000-1 vector annotation serialization into PDF files.
- [ ] **Pdfium NDK Sub-pixel Tiling:** Full Google Pdfium NDK integration for deep vector zoom.

---

## 🏗️ Project Structure

```text
Otium-Lab/
├── app/                        # Android application module (Jetpack Compose UI)
│   ├── src/main/java/com/otium/
│   │   ├── lab/
│   │   │   ├── library/        # Document store, library grid, hero & search
│   │   │   ├── pdf/            # Viewer orchestrator, canvas, search & outline
│   │   │   ├── scanner/        # CameraX, viewfinder, filters & exporter
│   │   │   ├── ui/             # Theme manager, settings & navigation
│   │   │   └── MainActivity.kt
│   │   └── uniffi/             # Generated UniFFI Kotlin bindings
│   └── build.gradle.kts
├── crates/                     # Shared Rust Core
│   ├── otium-core/             # Arabic text normalization & morphological search
│   ├── otium-scan-math/        # Perspective math & coordinates
│   ├── otium-scanner/          # Image processing & filters
│   └── otium-bridge/           # UniFFI / JNI Android native library (.so)
├── gradle/                     # Gradle wrapper & version catalogs
├── build.gradle.kts            # Root build configuration
└── settings.gradle.kts         # Multi-module settings
```

---

## 🚀 Building & Developing

### Requirements:
- JDK 17+
- Android SDK 35+ / NDK 27+
- Rust 1.85+ with `cargo-ndk` for Android targets:
  ```bash
  rustup target add aarch64-linux-android x86_64-linux-android
  cargo install cargo-ndk
  ```

### Build APK:
```bash
./gradlew assembleDebug
```

---

## 📜 License
GPL-3.0 License. Free, open, sovereign software.
