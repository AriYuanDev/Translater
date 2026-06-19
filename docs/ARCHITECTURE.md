# Architecture

## Overview

Translater has two product surfaces:

- Chrome extension under `chrome-extension/`
- Native Android app under `android-app/`

The Chrome extension handles web pages, PDFs, and Markdown files. The Android app is separate and does not wrap the Chrome extension in a WebView.

## Chrome Extension

| File | Responsibility |
| --- | --- |
| `background.js` | DeepL and Merriam-Webster requests, caching, viewer redirects, Chrome TTS |
| `content.js` | Web page event wiring |
| `pdfviewer.js` | PDF.js reader, PDF-specific event wiring, zoom, outline |
| `mdviewer.js` | Markdown reader, sanitization entry, TOC, zoom |
| `interaction-controller.js` | Shared lookup and sentence translation popup lifecycle |
| `utils.js` | Shared UI helpers, Shadow DOM, messaging, TTS driver, popup and toolbar helpers |
| `viewer-sidebar.js` | Shared PDF/Markdown file sidebar |
| `viewer-routing.js` | PDF/Markdown redirect, viewer source URL, file URL, and filename helpers |
| `viewer-zoom-helpers.js` | Zoom state and scroll-anchor helpers |
| `viewer-ui.js` | Shared PDF/Markdown loading and error UI helpers |
| `viewer-shared.css` | Shared PDF/Markdown loading and error state styles |
| `markdown-helpers.js` | Markdown sanitization and relative path rewriting |

Keep surface files thin. Shared behavior belongs in `interaction-controller.js` or `utils.js`; surface files should mostly wire events and surface-specific sizing.

## Chrome Runtime Flows

### Word Lookup

1. Surface detects a valid English word.
2. Surface triggers any immediate user-action behavior required by `docs/PRODUCT.md`.
3. Surface calls `handleWordLookupInteraction`.
4. Controller shows loading popup.
5. Background fetches Merriam-Webster data.
6. Controller renders dictionary data or translation fallback.
7. Popup speaker uses dictionary MP3 when it belongs to the selected word; otherwise it uses TTS before falling back to headword audio.

### Sentence Translation

1. Surface detects selected multi-word English text.
2. Floating toolbar appears.
3. User chooses translate or speak.
4. Translation goes through background DeepL request.
5. Speaker goes through shared TTS driver.

### TTS

Chrome pronunciation should use this order:

1. `chrome.tts` through the extension background context.
2. Web Speech fallback when extension TTS is unavailable.
3. Dictionary MP3 for popup speaker when it belongs to the selected word.

Delayed page-level `Audio.play()` should not be used for automatic pronunciation because Chrome may reject audio that is no longer tied to a user interaction.

## PDF and Markdown Viewers

PDF and Markdown viewers share:

- File sidebar
- Viewer URL state
- Zoom-state helpers
- Loading and error UI
- Loading and error CSS
- Lookup and translation UI

PDF-specific logic stays in `pdfviewer.js`. Markdown-specific sanitization and relative path handling stay in `markdown-helpers.js` and `mdviewer.js`.

## Android App

| Area | Implementation |
| --- | --- |
| UI | Kotlin, Jetpack Compose, Material 3 |
| State | MVI with `ReaderIntent`, `ReaderUiState`, `ReaderEffect` |
| Markdown | Markwon native rendering |
| File input | Storage Access Framework, Open with intent, optional library scan |
| Settings | App-private DataStore |
| Network | OkHttp with 15-second timeouts |
| Dictionary | Merriam-Webster Learners API |
| Translation | DeepL |
| Offline pronunciation | sherpa-onnx and `vits-piper-en_US-amy-low` assets |
| Packaging | ARM64-only unless device requirements change |

Android pronunciation order:

1. Merriam-Webster MP3.
2. Local sherpa-onnx/Piper TTS.
3. Android system TTS.

## Security Rules

- Never commit API keys.
- Keep extension API keys in extension storage.
- Keep Android API keys in app-private DataStore.
- Treat rendered Markdown as untrusted input.
- Preserve Markdown sanitization.
- Keep background messaging timeout guards.
- Use HTTPS for external dictionary and translation requests.

## Decision Notes

When a behavior or architecture decision changes, update the relevant section here or add a short note under this heading. Keep decision notes brief and tied to current code.

### 2026-05-26: Route Chrome TTS through background

Page-level Web Speech and delayed audio playback can fail on modern Chrome pages. Chrome pronunciation now tries background `chrome.tts` first and Web Speech second. Automatic pronunciation should be started from the surface event handler before async lookup work begins.
