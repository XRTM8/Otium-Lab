---
description: Strict Modular Component Architecture Standard for Otium Mobile
globs: app/src/main/java/**/*.kt
---

# Strict Modular Architecture Rule

When adding any new feature or modifying an existing feature in this codebase, you MUST adhere to the following strict rules:

1. **NO MONOLITHIC SCREENS:**
   A screen file must only act as an orchestrator (max 200 lines). It delegates UI elements to `components/` and data models to `model/`.

2. **DECOMPOSED SUB-COMPONENTS:**
   Every header, card, list item, dialog, or floating bar MUST live in its own discrete `.kt` file under `<feature>/components/`.

3. **CLEAN CONTRACTS:**
   Components must be pure Composables receiving values and emitting lambda events (`onAction: () -> Unit`). Never embed raw data queries or SharedPreferences inside leaf UI components.

4. **BACK NAVIGATION:**
   Always register a `BackHandler` when opening sub-screens, modals, or viewers to return to the parent screen rather than exiting the application.
