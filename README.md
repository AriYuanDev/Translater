# Translater

Translater contains two related surfaces for dictionary lookup, sentence translation, and reader-friendly Markdown/PDF workflows:

- A Chrome extension in `chrome-extension/`
- An Android Markdown reader app in `android-app/`

The Chrome extension is meant to be loaded with Chrome's **Load unpacked** flow during development. The Android app is a Gradle project that can be opened in Android Studio or built with the included wrapper.

## Features

- **Dictionary lookup**: Double-click a word to fetch Merriam-Webster definitions, phonetics, audio, and translated definition support.
- **Sentence translation**: Select multi-word text to open the floating action toolbar and translate with DeepL.
- **PDF reader**: Open PDFs in the custom viewer with lazy page rendering, outline sync, anchored zoom, folder navigation, and translation tools.
- **Markdown reader**: Open Markdown files in the custom viewer with table of contents, HTML sanitization, relative path resolution, 100% default zoom, folder navigation, and translation tools.
- **Shared document sidebar**: PDF and Markdown viewers share a file sidebar that preserves listing order, keeps the sidebar open while switching documents, can move into child folders or one parent folder, and carries the current zoom between PDF and Markdown.
- **Shared UI stack**: Web pages, PDF, and Markdown surfaces reuse the same popup, floating toolbar, text-to-speech, and definition helpers.
- **Android Markdown reader**: Open local Markdown files with Android's Storage Access Framework or Android's **Open with** flow, render with Markwon, double-tap words for lookup, and pronounce words with bundled offline sherpa-onnx/Piper TTS fallback.
- **Android Process Text**: Select one English word in supported third-party apps and use **Translate & Speak** from Android's text-selection menu to open Translater for lookup and pronunciation.
- **Android Markdown library**: Scan device storage for `.md` / `.markdown` files after file-access approval, then search, sort, group by folder, refresh, and open files from inside the app. The Android build is optimized for Xiaomi 14+ / modern ARM64 devices.

## Repository Structure

```text
Translater/
├── android-app/           # Android Markdown reader app with MVI, Markwon, DataStore, and offline TTS
├── chrome-extension/      # Chrome extension source
├── manual-tests/          # Local smoke-test fixtures for web, Markdown, and PDF
├── scripts/               # Local smoke-test helpers
├── tests/                 # Node + jsdom test suite
├── README.md              # Project overview
├── TECHNICAL.md           # Architecture notes
└── TEST_TRANSLATION.md    # Manual smoke-test checklist
```

## Installation

### Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory from this repository
5. Open the extension options page and enter your API keys

### Android App

1. Open `android-app/` in Android Studio, or build from the terminal.
2. Ensure `android-app/local.properties` points to a valid Android SDK. On this machine it is `sdk.dir=/Users/zhaozeyi/Documents/Android/sdk`.
3. Run `./gradlew test` from `android-app/`.
4. Run `./gradlew assembleDebug` to produce `android-app/app/build/outputs/apk/debug/app-debug.apk`.

## Configuration

- DeepL API key: configure it in the extension options page.
- Merriam-Webster API key: configure it in the extension options page.
- Android app keys: configure them in the Android settings sheet.
- The repository never stores default API keys. Keep real keys in extension-local storage or app-private DataStore only.

## Permissions and Privacy

- `"<all_urls>"` is required because the extension injects the shared lookup and translation UI on regular web pages and routes PDF or Markdown URLs into the custom viewers.
- The current permission scope matches the extension's existing architecture. If permissions are narrowed in the future, that change should be handled as a separate implementation task instead of being hidden in documentation.
- DeepL and Merriam-Webster host permissions are required for translation, dictionary lookup, and usage checks.
- API keys are entered through the options page and stored in Chrome extension storage on your machine.
- Android API keys are stored in app-private DataStore and are not shown after saving.
- Android whole-device Markdown scanning requires user-granted all-files access on Android 11+; the normal file picker and external **Open with** flow still work without that broad scan permission.
- Rendered Markdown is sanitized before it is inserted into the custom viewer.
- Android Markdown is rendered natively; the Android app does not use a WebView bridge.

## Development Notes

- Shared popup and floating toolbar logic lives in `chrome-extension/utils.js`.
- Shared word lookup and sentence translation flow lives in `chrome-extension/interaction-controller.js`.
- PDF viewer logic lives in `chrome-extension/pdfviewer.js`.
- Markdown viewer logic lives in `chrome-extension/mdviewer.js`.
- Background routing and API orchestration live in `chrome-extension/background.js`.
- Vendored third-party browser assets keep their upstream license headers in the checked-in files.
- Android launcher icons live in `android-app/app/src/main/res/drawable/` and `android-app/app/src/main/res/mipmap-anydpi-v26/`.
- Android offline pronunciation assets live under `android-app/app/src/main/jniLibs/` and `android-app/app/src/main/assets/vits-piper-en_US-amy-low/`.
- Android native packaging is intentionally `arm64-v8a` only; add more ABI folders only if emulator or older-device support becomes a product requirement.
- The checked-in Android debug APK is not required; rebuild it with `./gradlew assembleDebug`.

## Automated Validation

- Run `npm test` to execute the lightweight Node + jsdom suite for routing helpers, sidebar parsing, Markdown sanitization, and shared interaction flows.
- Run `npm run smoke:playwright` to launch a real browser, load the unpacked extension, and smoke-test the bundled web, Markdown, and PDF fixtures end to end.
- Run `cd android-app && ./gradlew test` for Android unit tests.
- Run `cd android-app && ./gradlew assembleDebug` to verify the Android app packages with bundled offline TTS assets.

## Manual Validation

Use `TEST_TRANSLATION.md` as the smoke-test checklist after loading the unpacked extension.  
The fixed local smoke-test files live in `manual-tests/`.

## Support

- Use GitHub Issues for bugs, regressions, and feature requests.
- Do not report security issues in public issues. Follow `SECURITY.md` instead.

## Contributing

See `CONTRIBUTING.md` for local setup, testing expectations, PR requirements, and repository safety rules.

## Maintainer Notes

- This repository is maintained as source code first. The expected validation path today is `npm test` plus targeted manual smoke testing.
- GitHub repository settings such as branch protection, security scanning, and dependency alerts should be enabled after the repository is pushed.
