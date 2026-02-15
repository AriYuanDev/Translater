# Repository Guidelines

## Project Structure & Module Organization
The repo hosts two actively maintained surfaces. `chrome-extension/` contains the content scripts, background worker, styles, and PDF assets for the browser build; update `utils.js` first when changing shared popup logic, then propagate to `content.js` and `pdfviewer.js`. `vscode-extension/` houses the Node-based port, with source code under `src/`, packaged media in `media/`, tests in `test/`, and a prebuilt `.vsix` for quick installs. Documentation and reference materials live at the repository root (`README.md`, `TECHNICAL.md`, `TEST_TRANSLATION.md`).

## Build, Test, and Development Commands
- `cd vscode-extension && npm install` – install the VS Code extension dependencies.
- `npm run lint` – run ESLint across `src`, `extension.js`, and `test` before opening a PR.
- `npm test` – runs lint (via `pretest`) plus the custom DeepL mock test (`node ./test/runTest.js`).
- `python3 chrome-extension/generate_icons.py` – regenerate icon sprites before submitting UI tweaks.
- Load the Chrome build via `chrome://extensions` → **Load unpacked** → `chrome-extension/` for manual validation; package VS Code builds with `npx vsce package` if you need a fresh `.vsix`.

## Coding Style & Naming Conventions
Use four-space indentation and retain semicolons across JavaScript files. Prefer ES modules, `const` over `let`, and wrap async DOM mutations in helper utilities from `utils.js` to preserve Shadow DOM isolation. Follow the existing CSS naming scheme (`translator-*` classes) and keep assets in `chrome-extension/icons/`. All exported functions should have JSDoc blocks mirroring the patterns already in `content.js` and `pdfviewer.js`.

## Testing Guidelines
Lint and unit tests run only from `vscode-extension`, so keep its `npm test` pipeline green before pushing. The custom test harness mocks the DeepL client; extend `test/runTest.js` when adding translation behaviors. For the Chrome extension, smoke-test double-click, selection hover, and PDF flows manually in Chrome Canary and standard Chrome, using the steps in `TEST_TRANSLATION.md` as checklists.

## Commit & Pull Request Guidelines
Follow the Conventional Commits pattern shown in git history (`feat(vscode): …`, `fix(pdf): …`). Keep scope tokens aligned to top-level folders (`chrome`, `pdf`, `vscode`). Every PR should summarize impacted surfaces, link relevant issues, and include screenshots or GIFs for UI-affecting changes (popups, PDF viewer, Markdown preview). Reference any doc updates explicitly (e.g., “docs: update TECHNICAL.md”).

## Security & Configuration Tips
Never commit API keys. Rely on the `translater.deepLApiKey` VS Code setting and `DEEPL_API_KEY` environment variable used by the test harness. When testing Merriam-Webster authentication, store keys in a local `.env` ignored by git. Validate that new network code enforces JSON `Content-Type` checks (matching `background.js`) and maintain the 15-second timeout guard when touching request logic.
