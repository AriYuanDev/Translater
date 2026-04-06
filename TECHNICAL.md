# Technical Architecture

## Overview

Translater is a Chrome extension built around four main surfaces:

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

`chrome-extension/viewer-routing.js`, `chrome-extension/viewer-sidebar-helpers.js`, and `chrome-extension/markdown-helpers.js` hold the pure routing, sidebar parsing, and Markdown helper logic that is reused by runtime code and tests.

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
- keeps outline state synced with the viewport
- reuses shared translation helpers from `utils.js`

## Markdown Viewer

`mdviewer.js`:

- fetches Markdown directly, including local `file://` files when Chrome access is enabled
- sanitizes rendered HTML before injecting it into the viewer
- rewrites relative image and link paths against the source URL
- builds a TOC from rendered headings
- reuses the shared translation helpers from `utils.js`

## Security Notes

- Popups and floating controls render inside Shadow DOM.
- HTML messages shown in the UI still go through `escapeHtml()`.
- Rendered Markdown is sanitized to remove dangerous tags, event handlers, and `javascript:` URLs.
- Messaging to the background script uses timeout guards.

## Testing Notes

- The repository now includes a lightweight `node:test` + `jsdom` suite for routing helpers, sidebar parsing, Markdown sanitization, and shared interaction flows.
- Manual smoke tests still matter for real Chrome behavior, especially PDF text selection, custom viewer navigation, and extension-permission edge cases.
