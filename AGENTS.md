- Always be pragmatic, concise, task-focused, and direct.
- Check `CLAUDE.md` in the project root to get up to speed.

--- project-doc ---

# Repository Guidelines

## Project Structure & Module Organization
This repo now maintains a single Chrome extension surface. `chrome-extension/` contains the background worker, content script, shared helpers in `utils.js`, PDF/Markdown viewers, styles, icons, and bundled third-party assets. Root docs live in `README.md`, `TECHNICAL.md`, and `TEST_TRANSLATION.md`.

## Build, Test, and Development Commands
- Load the Chrome build via `chrome://extensions` → **Load unpacked** → `chrome-extension/`.
- `python3 chrome-extension/generate_icons.py` – regenerate icon sprites before submitting UI tweaks.
- There is no required repo-wide build step; validate Chrome flows manually with `TEST_TRANSLATION.md`.

## Coding Style & Naming Conventions
Use four-space indentation and retain semicolons across JavaScript files. Prefer ES modules, `const` over `let`, and update `utils.js` first when changing shared popup / toolbar logic, then propagate only the minimal wiring changes to `content.js`, `pdfviewer.js`, and `mdviewer.js`. Follow the existing CSS naming scheme (`translator-*` classes).

## Testing Guidelines
Manual smoke testing is the primary validation path. Cover double-click lookup, selection hover, Markdown viewer, and PDF viewer flows in Chrome, using `TEST_TRANSLATION.md` as the checklist.

## Commit & Pull Request Guidelines
Follow Conventional Commits with Chrome-oriented scopes such as `feat(chrome):`, `fix(pdf):`, `fix(md):`, or `docs:`. Every PR should summarize affected user flows and include screenshots or GIFs for UI changes.

## Security & Configuration Tips
Never commit API keys. Keep DeepL and Merriam-Webster keys in extension options or local ignored files only. Maintain JSON response validation and the 15-second timeout guard when touching network code. Treat rendered Markdown as untrusted input and preserve sanitization.
