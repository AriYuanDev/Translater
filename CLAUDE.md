# CLAUDE.md

This repository now contains a single actively maintained surface: the Chrome extension in `chrome-extension/`.

## Project Overview

Translater provides:

- double-click dictionary lookup
- sentence translation through a floating toolbar
- text-to-speech
- custom PDF and Markdown readers with the same translation workflow

## Key Files

- `chrome-extension/background.js` — API orchestration, caching, and PDF/Markdown URL redirection.
- `chrome-extension/content.js` — page translation interactions.
- `chrome-extension/pdfviewer.js` — PDF reader built on PDF.js.
- `chrome-extension/mdviewer.js` — Markdown reader built on marked.js.
- `chrome-extension/utils.js` — shared popup, toolbar, TTS, URL, and translation helpers.

## Development Notes

- Prefer updating `utils.js` first when changing shared popup / toolbar behavior.
- Keep four-space indentation and semicolons.
- Use `const` over `let` where possible.
- Preserve the 15-second timeout guard in background messaging flows.
- Keep UI isolated in Shadow DOM.

## Validation

There is no automated test pipeline at the repo root anymore.
Use `TEST_TRANSLATION.md` for manual smoke tests in Chrome.
