# Otium Mobile — Modular Architecture & Engineering Standard

> **Strict Rule:** Every feature in this repository MUST be built from decoupled, single-responsibility, modular components. Monolithic screen files and mixed concerns are strictly forbidden.

---

## 1. Directory & Package Conventions

Every feature must follow this strict modular structure:

```
com.otium.lab.<feature>/
├── <Feature>Screen.kt          # Lean orchestrator ONLY (< 200 lines). Coordinates subcomponents.
├── model/                      # Data classes, enums, matrices, state models.
│   ├── <ModelA>.kt
│   └── <ModelB>.kt
├── components/                 # Discrete, reusable UI widgets (< 150 lines per file).
│   ├── <Feature>Header.kt
│   ├── <Feature>ItemCard.kt
│   └── <Feature>ActionDialog.kt
└── store/ OR repository/       # Data persistence, state management, API/disk IO.
    └── <Feature>Store.kt
```

---

## 2. Strict Engineering Constraints

1. **Max File Size Limit:**
   - Screen orchestrator files: **< 200 lines**.
   - Sub-component files: **< 150 lines**.
   - If a composable or class exceeds 180 lines, it **must** be broken down into sub-components.

2. **No Inline Dialogs in Screens:**
   - Every dialog, bottom sheet, or complex popup must be placed in a dedicated file under `components/` (e.g. `PdfJumpDialog.kt`, `DocumentDeleteDialog.kt`).

3. **Separation of Concerns:**
   - **UI Layer (`components/`):** Purely declarative `@Composable` functions accepting state and emitting callbacks. No direct disk I/O or database queries.
   - **Data/Domain Layer (`store/`):** Pure Kotlin classes managing IO, caches, and business models with coroutine dispatchers.
   - **Orchestrator Layer (`Screen.kt`):** Connects state from stores to UI components.

4. **Zero Layout Shifts (Zero-CLS):**
   - Immersive reading views must decouple full-screen background canvases from overlay bars using floating overlays, never modifying base Scaffold content measurements on focus.

5. **Back Navigation Integrity:**
   - Every sub-screen, dialog, reader, or scanner must register an explicit `BackHandler` returning to the logical parent. No unhandled back presses that accidentally exit the app.

---

## 3. Modular Feature Registry

| Feature Module | Core Orchestrator | Sub-Components Package | Model / Logic Package |
| :--- | :--- | :--- | :--- |
| **PDF Reader** | `PdfViewerScreen.kt` | `pdf.components.*` (`PdfTopOverlay`, `PdfBottomScrubber`, `PdfPageItem`, `PdfJumpDialog`) | `pdf.model.*` (`PageColorMode`, `ReadingLayout`, `ColorMatrices`) |
| **Document Library** | `LibraryScreen.kt` | `library.components.*` (`ContinueReadingHero`, `DocumentCard`, `DocumentFilterChips`, `EmptyLibraryState`, `LibraryHeader`) | `library.DocumentStore.kt`, `library.StoredDocument.kt` |
| **Camera Scanner** | `CameraScannerScreen.kt` | `scanner.components.*` (`ScannerViewfinder`, `ScannerTopBar`, `ScannerBottomBar`, `ScannerPermissionGate`) | `scanner.PdfExporter.kt`, `otium-bridge` |
| **Settings & Specs** | `SettingsScreen.kt` | `ui.settings.components.*` (`ThemeSelectionCard`, `ReadingPreferencesCard`, `StorageCacheCard`, `AboutOtiumCard`) | `ui.theme.ThemePreferences.kt` |
| **Core Utilities** | `OtiumApp.kt` | `ui.components.*` | `core.extensions.*` (`ContextExtensions.kt`) |

---
*Enforced across all future commits, pull requests, and automated agents.*
