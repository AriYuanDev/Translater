# Translater

Translater is a reading assistant for English technical material.

It has two active surfaces:

- Chrome extension for web pages, PDFs, and Markdown files.
- Native Android Markdown reader.

Core promise: double-click or double-tap a word to understand and pronounce it; select a sentence to translate or speak it.

## Start Here

| Need | Read |
| --- | --- |
| Product goals, priorities, and behavior contracts | `docs/PRODUCT.md` |
| Module map and implementation boundaries | `docs/ARCHITECTURE.md` |
| Test commands and smoke checks | `docs/VALIDATION.md` |
| Contributor workflow | `CONTRIBUTING.md` |
| Security reporting | `SECURITY.md` |

## Repository Layout

```text
Translater/
├── chrome-extension/      # Chrome extension source
├── android-app/           # Android app source
├── docs/                  # Product, architecture, and validation docs
├── manual-tests/          # Local smoke-test fixtures
├── scripts/               # Smoke-test helpers
└── tests/                 # Chrome extension node:test + jsdom suite
```

## Chrome Extension

Load during development:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `chrome-extension/`.
5. Configure DeepL and Merriam-Webster keys in the extension options page.

Useful commands:

```bash
npm test
npm run smoke:playwright
```

## Android App

Open `android-app/` in Android Studio, or use the checked-in Gradle Wrapper:

```bash
cd android-app
./gradlew test
./gradlew assembleDebug
```

The app is currently optimized for modern ARM64 Android devices. See `android-app/README.md` for Android-specific setup notes.

## Configuration

- DeepL API key: extension options page or Android settings.
- Merriam-Webster API key: extension options page or Android settings.
- Never commit real API keys.

## Current Product Scope

Chrome:

- Word lookup and pronunciation on web pages, PDFs, and Markdown files.
- Sentence translation and TTS through a floating toolbar.
- Custom PDF and Markdown viewers with zoom, sidebar, and reading helpers.

Android:

- Native Markdown reader.
- Markdown file picker, Open with, and optional library scan.
- Word lookup, Process Text, and offline pronunciation fallback.

For exact behavior expectations, use `docs/PRODUCT.md`.
