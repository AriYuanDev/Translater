# Translater Smoke Test Checklist

This checklist covers the Chrome extension and the Android app. Run the relevant section for the surface you changed.

# Chrome Extension

## Setup

1. Load `chrome-extension/` in `chrome://extensions`
2. Enable **Allow access to file URLs** if you want to test local Markdown/PDF files
3. Configure DeepL and Merriam-Webster keys in the options page
4. Run `npm test` once before Chrome smoke testing
5. Optionally run `npm run smoke:playwright` for an automated browser pass over the local web, Markdown, and PDF fixtures before doing the manual checklist

## Local Smoke Test Files

- Web page: `manual-tests/web-smoke.html`
- Primary Markdown file: `manual-tests/reader-smoke.md`
- Sibling Markdown file: `manual-tests/reference-note.markdown`
- PDF file: `manual-tests/viewer-smoke.pdf`

Open these local files directly in Chrome after enabling file URL access. Keeping all test documents in the same folder makes the sidebar file list deterministic for Markdown and PDF smoke tests.

## Web Page Tests

- Open `manual-tests/web-smoke.html`
- Double-click `metamorphosis` on an English page and confirm the dictionary popup appears
- Confirm the dictionary popup wording and layout match the PDF and Markdown viewers
- Double-click an obvious non-word like `...` or `1234` and confirm no dictionary popup appears
- Select `The quick brown fox jumps over the lazy dog.` and confirm the floating toolbar appears
- Hover `T` and confirm the translation popup renders
- Confirm the translation popup behavior matches the PDF and Markdown viewers
- Click the speaker button and confirm TTS works
- Click the Google button and confirm the search opens in a new tab
- Use the local Markdown/PDF links on the page and confirm they open the custom viewers

## Markdown Viewer Tests

- Open `manual-tests/reader-smoke.md` and confirm the custom viewer loads
- Open the left sidebar and confirm the **Files** tab lists sibling PDF / Markdown documents from the same folder
- Confirm the sidebar lists `reader-smoke.md`, `reference-note.markdown`, and `viewer-smoke.pdf`
- Confirm headings appear in the sidebar TOC
- Confirm the relative image `diagram.svg` renders correctly
- Confirm relative links open the sibling Markdown file and PDF file correctly
- Confirm inline HTML with scripts/events is not executed
- Confirm the `javascript:` link is sanitized instead of remaining clickable as script
- Confirm word lookup success, dictionary fallback-to-translation, and translation error states match the web page and PDF viewer
- Click **Open Original** and confirm the original file opens without being redirected back into the custom viewer

## PDF Viewer Tests

- Open `manual-tests/viewer-smoke.pdf` and confirm the custom viewer loads
- Open the left sidebar and confirm the **Files** tab lists sibling PDF / Markdown documents from the same folder
- Confirm the sidebar lists `viewer-smoke.pdf`, `reader-smoke.md`, and `reference-note.markdown`
- Confirm the outline sidebar shows `Overview` and `Notes`, and both entries jump to the expected page
- Confirm zoom in / zoom out / fit width work without losing the current reading position
- Double-click a word on the PDF text layer and confirm the dictionary popup appears
- Select a sentence on the PDF and confirm the floating toolbar and translation popup work
- Confirm word lookup success, dictionary fallback-to-translation, and translation error states match the web page and Markdown viewer

# Android App

## Build Setup

1. Open `android-app/` in Android Studio, or use the included Gradle Wrapper.
2. Confirm `android-app/local.properties` points to a valid SDK. Current local path: `/Users/zhaozeyi/Documents/Android/sdk`.
3. Run `cd android-app && ./gradlew test`.
4. Run `cd android-app && ./gradlew assembleDebug`.
5. Confirm the APK exists at `android-app/app/build/outputs/apk/debug/app-debug.apk`.
6. Confirm the build target is an ARM64 device such as Xiaomi 14+; emulator-only `x86` support is intentionally not packaged.

## Android Reader Tests

- Install the debug APK on a device or emulator.
- Confirm the launcher shows the blue `MD` app icon and that the letters are visually centered.
- Open a local `.md` or `.markdown` file through the app file picker.
- From a file manager or another app, open a `.md` / `.markdown` file and confirm Translater appears in Android's **Open with** choices and loads the file.
- On Android 11+, tap **Grant File Access**, approve all-files access, return to the app, and tap **Refresh**.
- Confirm the Markdown Library lists discovered `.md` / `.markdown` files, groups them by folder, and updates the count after refresh.
- Search by file name, folder, or path and confirm the visible file list narrows correctly.
- Cycle sorting through Recent, Name, Folder, and Size, then open a file from the library.
- Confirm Markdown headings, lists, links, and code blocks render legibly.
- Double-tap an English word and confirm the lookup popup appears.
- Confirm the popup shows word, phonetic text when available, part of speech, English definitions, Chinese definition translations, and a speak action.
- Configure Merriam-Webster and DeepL keys in the settings sheet and confirm lookup uses dictionary results before DeepL fallback.
- Clear or omit keys and confirm the app shows a readable configuration error instead of crashing.

## Android Offline Pronunciation Tests

- With network available, double-tap a word that has Merriam-Webster audio and confirm speak plays dictionary MP3 first.
- Disable network and tap speak again; confirm the bundled sherpa-onnx/Piper voice still pronounces the word.
- Change the default pronunciation source to Local AI and confirm local pronunciation is used before dictionary audio.
- Change the default pronunciation source to System and confirm Android system TTS is used.
- In a debug-only check, remove or corrupt the local model assets and confirm the app continues reading/lookup and falls back to Android system TTS.
