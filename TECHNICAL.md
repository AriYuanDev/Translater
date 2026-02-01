# Translater Technical Documentation

> **Version**: 1.4.1 (Premium UI & Refined Pronunciation)  
> **Update Date**: 2026-02-01
> **Key Improvements**: Implemented a fully internationalized (English-only) interface, introduced a high-fidelity Glassmorphism UI design, and refined the pronunciation logic for morphed words.

---

## 1. Overview

Translater is a cross-platform (Chrome & VS Code) productivity suite providing high-precision word translation, Merriam-Webster dictionary lookups, and natural speech synthesis (TTS).

---

## 2. Core Architecture

### 2.1 Modern ES Modular Design
The project utilizes an **ES Modules (ESM)** architecture to achieve logic reuse across different environments:
- **[utils.js](file:///utils.js)**: Contains shared logic including secure message passing, TTS drivers, HTML escaping, and coordinate calculation.
- **Dynamic Imports**: Used in `content.js` and `pdfviewer.js` via `await import(chrome.runtime.getURL('utils.js'))` for just-in-time loading.

### 2.2 UI Isolation & Synchronization (Shadow DOM)
-   **Style Synchronization**: Implements a `Promise`-based style waiting mechanism to prevent Flash of Unstyled Content (FOUC). The UI renders only after the `styles.css` is fully loaded in the `ensureShadowRoot` phase.
-   **Isolation**: Ensures popup styles remain consistent and unaffected by host page CSS (e.g., GitHub, Gmail).
-   **Consistency**: The PDF viewer and standard web pages share the same Shadow DOM creation logic for a unified visual experience.

---

## 3. Chrome Extension Modules

### 3.1 background.js (The Brain)
-   **API Selection**: Automatically detects DeepL Free (`:fx`) vs. Pro keys and switches endpoints dynamically.
-   **Concurrency Protection**: Tracks active network requests using `pendingDictionaryRequests` and `pendingTranslationRequests` Maps to prevent redundant API calls for the same text.
-   **Error Handling**: Validates `Content-Type: application/json` to prevent crashes when APIs return unexpected HTML error pages.
-   **LRU Cache**: Dual-level caching (Memory + Storage) for dictionary results with a 30-minute TTL.
-   **Smart PDF Redirection**: Optimized regex algorithm to intercept PDF-like navigation and redirect to the custom reader.

### 3.2 UI Interaction Logic (content.js)
-   **Secure DOM Construction**: Replaces `innerHTML` with `createElement` chains to natively mitigate XSS risks.
-   **Double-click Lookup**: 
    - **Morphed Word Logic**: Specifically identifies the word form used in context. The origin word is displayed as supplementary info (`from [origin]`).
    - **Refined Pronunciation**: 
        - The main button plays the professional headword audio from Merriam-Webster.
        - A dedicated mini-speaker icon plays the contextual morphed word using AI TTS.
    - **Async Defense**: Post-await validity checks on `currentPopup` to prevent race condition errors (`TypeError`).
-   **Floating Menu**: Dynamically calculates optimal positioning for selected text, offering "Translate" and "Speak" quick actions.

---

## 4. PDF Viewer

-   **Engine**: Built on PDF.js v4.x.
-   **Lazy Rendering**: Utilizes `IntersectionObserver` for on-demand page rendering, significantly reducing memory footprint for large documents.
-   **UI Sync**: The internal PDF translation popup uses the same Shadow DOM technology as the content script for a seamless transition.

---

## 5. VS Code Extension

-   **Lightweight Philosophy**: Excludes Hover UI to maintain editor purity, accessible via the "Translate Selection" context menu command.
-   **Modern Networking**: Uses native `fetch` instead of the legacy Node.js `https` module for improved stability and redirection handling.

---

## 6. Security & Performance

-   **XSS Mitigation**: Mapping-based `escapeHtml` used in conjunction with `textContent` injection.
-   **Zero-latency TTS**: `waitForVoices` mechanism solves cold-start issues with the Web Speech API.
-   **Ultra-lightweight**: Zero heavy external dependencies (excluding PDF.js), using native implementations for all modules.

---

## 7. Maintenance

-   **Icon Assets**: `/generate_icons.py` provides multi-size icon scaling.
-   **Dictionary Source**: Uses Merriam-Webster Learners API. Ensure the correct dictionary type is selected during API key registration.
