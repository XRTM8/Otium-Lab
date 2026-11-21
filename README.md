# Otium Mobile Native (Android)

> The Sovereign, Ultra-Fast, Distraction-Free PDF Reader & Document Scanner for Android.  
> Built natively with **Kotlin**, **Jetpack Compose**, **CameraX**, and an offline **Rust Shared Core**.

---

## ⚡ Architectural Foundations

1. **Ultra-Low Memory Footprint:** Tiled rendering via Google Pdfium NDK (`< 60 MB RAM` on 1,000+ page books).
2. **Hardware-Accelerated CameraX:** Zero-shutter lag, real-time edge detection and perspective correction via Rust SIMD (`crates/otium-scanner`).
3. **Arabic-First Text Engine:** Morphological light stemming (`arabic_light_stem`) and diacritic-tolerant root matching in Rust (`crates/otium-core`).
4. **Standard ISO 32000-1 Annotations:** Native vector highlights, underlines, and ink marks directly interoperable with Adobe Acrobat and Apple Books.
5. **Zero-Knowledge Vault:** Argon2id + ChaCha20-Poly1305 encryption with Android BiometricPrompt authentication (`crates/otium-vault`).
6. **Local P2P Smart Beam:** Encrypted local Wi-Fi / WebRTC document transfer between Phone and Desktop without cloud dependency (`crates/otium-beam`).

---

## 🏗️ Project Structure

```text
Otium-Lab/
├── app/                        # Android application module (Jetpack Compose UI)
│   ├── src/main/java/com/otium/
│   │   ├── ui/                 # Material 3 UI screens & navigation
│   │   └── MainActivity.kt
│   └── build.gradle.kts
├── crates/                     # Shared Rust Core
│   ├── otium-core/             # Arabic text normalization & morphological search
│   ├── otium-vault/            # ChaCha20-Poly1305 & Argon2id encryption
│   ├── otium-scanner/          # Edge detection & document perspective math
│   ├── otium-ink/              # Vector ink & palm rejection algorithms
│   ├── otium-beam/             # Local P2P sync & pairing
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
