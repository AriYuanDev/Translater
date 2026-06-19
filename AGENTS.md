- Always be pragmatic, concise, task-focused, and direct.
- Check `CLAUDE.md` in the project root to get up to speed.

--- project-doc ---

# Repository Guidelines

## Project Structure & Module Organization
This repo maintains two active product surfaces. `chrome-extension/` contains the background worker, content script, shared helpers in `utils.js`, PDF/Markdown viewers, styles, icons, and bundled third-party browser assets. `android-app/` contains the Android Markdown reader app, Kotlin/Compose source, unit tests, ARM64 sherpa-onnx native libraries, and bundled Piper voice assets. Product, architecture, and validation docs live under `docs/`.

## Build, Test, and Development Commands
- Load the Chrome build via `chrome://extensions` → **Load unpacked** → `chrome-extension/`.
- `python3 chrome-extension/generate_icons.py` – regenerate icon sprites before submitting UI tweaks.
- `npm test` – run the Chrome extension Node/jsdom suite.
- `npm run smoke:playwright` – run the Chrome extension browser smoke pass.
- `cd android-app && ./gradlew test` – run Android unit tests.
- `cd android-app && ./gradlew assembleDebug` – package the Android debug APK.

## Coding Style & Naming Conventions
Use four-space indentation and retain semicolons across JavaScript files. Prefer ES modules, `const` over `let`, and update `utils.js` first when changing shared popup / toolbar logic, then propagate only the minimal wiring changes to `content.js`, `pdfviewer.js`, and `mdviewer.js`. Follow the existing CSS naming scheme (`translator-*` classes).
For Android, keep Kotlin source under `android-app/app/src/main/java/com/translater/android/`, preserve the current MVI reader structure, and keep ARM64-only native packaging unless device support requirements change.

## Testing Guidelines
Run automated tests for the affected surface first, then use `docs/VALIDATION.md` for manual smoke coverage. Chrome changes should cover double-click lookup, selection hover, Markdown viewer, and PDF viewer flows. Android changes should cover unit tests plus the relevant reader, Process Text, file access, and pronunciation fallback flows.

## Commit & Pull Request Guidelines
Follow Conventional Commits with scopes such as `feat(chrome):`, `fix(pdf):`, `fix(md):`, `fix(android):`, or `docs:`. Every PR should summarize affected user flows and include screenshots or GIFs for UI changes.

## Security & Configuration Tips
Never commit API keys. Keep DeepL and Merriam-Webster keys in extension options or local ignored files only. Maintain JSON response validation and the 15-second timeout guard when touching network code. Treat rendered Markdown as untrusted input and preserve sanitization.
