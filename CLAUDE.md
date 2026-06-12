# CLAUDE.md

This repository contains two actively maintained surfaces:

- Chrome extension in `chrome-extension/`
- Android Markdown reader app in `android-app/`

## Project Overview

Translater provides:

- double-click dictionary lookup
- sentence translation through a floating toolbar
- text-to-speech
- custom PDF and Markdown readers with the same translation workflow
- Android Markdown reading, word lookup, and offline pronunciation fallback

## Key Files

- `chrome-extension/background.js` — API orchestration, caching, and PDF/Markdown URL redirection.
- `chrome-extension/content.js` — page translation interactions.
- `chrome-extension/pdfviewer.js` — PDF reader built on PDF.js.
- `chrome-extension/mdviewer.js` — Markdown reader built on marked.js.
- `chrome-extension/utils.js` — shared popup, toolbar, TTS, URL, and translation helpers.
- `android-app/app/src/main/java/com/translater/android/` — Android app source.
- `android-app/app/src/main/assets/vits-piper-en_US-amy-low/` — bundled offline pronunciation model.

## Development Notes

- Prefer updating `utils.js` first when changing shared popup / toolbar behavior.
- Keep four-space indentation and semicolons.
- Use `const` over `let` where possible.
- Preserve the 15-second timeout guard in background messaging flows.
- Keep UI isolated in Shadow DOM.

## Validation

- Run `npm test` for the Chrome extension shared test suite.
- Run `npm run smoke:playwright` for the Chrome extension browser smoke pass when interaction surfaces change.
- Run `cd android-app && ./gradlew test` for Android unit tests when Android code changes.
- Use `TEST_TRANSLATION.md` for manual smoke tests on the affected surface.
