# Technical Architecture

## Overview

Translater is now organized around a Chrome extension surface and a separate Android app surface.

The Chrome extension is built around these runtime surfaces:

- `background.js`: API orchestration, caching, and viewer redirection.
- `content.js`: page-level dictionary lookup and sentence translation.
- `pdfviewer.js`: custom PDF reader built on PDF.js.
- `mdviewer.js`: custom Markdown reader built on marked.js.
- `interaction-controller.js`: shared async controller for word lookup and sentence translation across all three surfaces.

## Shared Runtime Utilities

`chrome-extension/utils.js` centralizes the common runtime helpers:

- extension-context checks
- Shadow DOM setup and shared style loading
- popup positioning
- background messaging with timeout handling
- TTS voice loading and playback
- dictionary definition translation caching
- floating selection toolbar rendering
- sentence translation popup rendering
- external URL opening and viewer bypass URL generation

`chrome-extension/interaction-controller.js` now owns the async popup lifecycle so `content.js`, `pdfviewer.js`, and `mdviewer.js` only keep event wiring and surface-specific sizing.

`chrome-extension/viewer-routing.js`, `chrome-extension/viewer-sidebar-helpers.js`, `chrome-extension/viewer-zoom-helpers.js`, and `chrome-extension/markdown-helpers.js` hold the pure routing, sidebar parsing, zoom-state, and Markdown helper logic that is reused by runtime code and tests.

## Background Flow

`background.js` is responsible for:

- DeepL and Merriam-Webster requests
- short-lived in-memory and persisted dictionary cache
- redirecting `.pdf`, `.md`, and `.markdown` URLs into custom viewers
- honoring the `translater_no_redirect` bypass flag for “open original” flows

## Content Flow

`content.js` handles two user interactions:

- **Double-click on a word** → dictionary lookup popup
- **Select multi-word English text** → floating toolbar → sentence translation popup / TTS / Google search

Dictionary popups now use popup identity checks so older async responses cannot overwrite a newer popup.

## PDF Viewer

`pdfviewer.js` uses PDF.js with lazy rendering:

- fetches PDF bytes before handing them to PDF.js
- handles local `file://` PDFs more predictably
- preserves zoom anchor while rerendering
- reads explicit viewer zoom from the URL and carries the current zoom into sidebar document links
- keeps outline state synced with the viewport
- reuses shared translation helpers from `utils.js`

## Markdown Viewer

`mdviewer.js`:

- fetches Markdown directly, including local `file://` files when Chrome access is enabled
- sanitizes rendered HTML before injecting it into the viewer
- rewrites relative image and link paths against the source URL
- builds a TOC from rendered headings
- defaults to 100% zoom when the URL has no explicit viewer zoom state
- preserves the viewport center while zooming and carries the current zoom into sidebar document links
- reuses the shared translation helpers from `utils.js`

## Viewer Sidebar and Zoom State

The PDF and Markdown viewers share `viewer-sidebar.js` for the file panel. Directory HTML is parsed without sorting so the sidebar follows the browser's directory listing order. The panel can enter child folders, move one level up with the parent directory control, and return to the current document folder.

Document links are built with `viewer-routing.js`, which can append viewer-state parameters after the encoded source URL. The sidebar adds `sidebar=open` when the panel is open and includes explicit zoom state so PDF and Markdown preserve the current reading scale when switching documents.

`viewer-zoom-helpers.js` treats missing zoom values as absent rather than numeric zero. This keeps direct Markdown opens at 100% while still allowing explicit zoom values, including 60%, to be restored when they are intentionally passed with `zoomExplicit=1`.

## Security Notes

- Popups and floating controls render inside Shadow DOM.
- HTML messages shown in the UI still go through `escapeHtml()`.
- Rendered Markdown is sanitized to remove dangerous tags, event handlers, and `javascript:` URLs.
- Messaging to the background script uses timeout guards.

## Testing Notes

- The repository now includes a lightweight `node:test` + `jsdom` suite for routing helpers, sidebar parsing, Markdown sanitization, and shared interaction flows.
- Manual smoke tests still matter for real Chrome behavior, especially PDF text selection, custom viewer navigation, and extension-permission edge cases.

## Android App

`android-app/` is an independent Gradle Android project. It does not wrap the Chrome extension in WebView.

- UI stack: Kotlin, Jetpack Compose, Material 3, and MVI state flow.
- Reader: Android Storage Access Framework opens local Markdown files without broad filesystem permission.
- File association: `MainActivity` declares `ACTION_VIEW` filters for common Markdown/text MIME types plus `.md` / `.markdown` paths, so external file managers can offer Translater in Android's **Open with** sheet.
- Process Text: `ProcessTextActivity` declares `ACTION_PROCESS_TEXT` with `text/plain`, so Android text-selection menus can offer **Translate & Speak** in third-party apps that expose the platform selection action. The activity normalizes one selected English word, launches `MainActivity`, and reuses `ReaderIntent.LookupWord`.
- Markdown library: after all-files access is granted, `MarkdownFileRepository` walks external storage for `.md` / `.markdown` files. The app keeps the scan in MVI state, then filters, sorts, groups by folder, refreshes, and opens selected file URIs through the same reader path.
- Rendering: Markwon renders Markdown into a native `TextView`.
- Lookup: double-tap maps the touch position to a character offset, extracts an English word, then sends `ReaderIntent.LookupWord`.
- Settings: API keys and speech rate are stored in app-private DataStore.
- Dictionary and translation: Merriam-Webster Learners API and DeepL use OkHttp with 15-second timeouts.
- Offline pronunciation: sherpa-onnx native libraries are bundled in `app/src/main/jniLibs/arm64-v8a/`, and the default `vits-piper-en_US-amy-low` model is bundled in app assets.
- Launcher icon: the app uses a simple adaptive icon with a dark background, rounded blue foreground tile, and centered `MD` vector lettering.
- Packaging target: ARM64-only for Xiaomi 14+ / modern Android phones. `armeabi-v7a`, `x86`, and `x86_64` packages are intentionally omitted.
- TTS data: espeak resources are trimmed to English resources used by the bundled `en_US-amy-low` voice.

The Android pronunciation fallback order is fixed:

1. Merriam-Webster MP3 audio when available
2. Local sherpa-onnx/Piper neural TTS
3. Android system TTS

On this machine, the Android SDK is at `/Users/zhaozeyi/Documents/Android/sdk`. `android-app/local.properties` points Gradle to that SDK. Android Studio is installed, and no separate global `gradle` command is required because the project includes Gradle Wrapper.
