# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Translater is a cross-platform translation suite with two surfaces: a Chrome extension (`chrome-extension/`) and a VS Code extension (`vscode-extension/`). It provides word translation via DeepL, Merriam-Webster dictionary lookups, and text-to-speech.

## Build & Development Commands

All npm commands run from `vscode-extension/`:

```bash
cd vscode-extension && npm install   # install dependencies
npm run lint                          # ESLint across src/, extension.js, test/
npm test                              # lint + custom DeepL mock test (node ./test/runTest.js)
npx vsce package                      # package .vsix for distribution
```

Chrome extension has no build step — load unpacked via `chrome://extensions` → `chrome-extension/` directory. Regenerate icons with `python3 chrome-extension/generate_icons.py`.

## Architecture

### Chrome Extension (Manifest V3)

- `background.js` — Service worker. API orchestration (DeepL, Merriam-Webster), LRU dictionary cache (100 entries, 30min TTL), concurrency protection via pending request Maps, PDF/Markdown URL interception and redirection.
- `content.js` — Content script injected into all pages. Handles double-click word lookup, selection hover menu, and Shadow DOM popup rendering.
- `utils.js` — ES Module shared across content.js, pdfviewer.js, and mdviewer.js. Contains message passing (15s timeout), TTS driver, HTML escaping, Shadow DOM creation, popup positioning. **Update utils.js first when changing shared popup logic, then propagate to consumers.**
- `pdfviewer.js` / `mdviewer.js` — Custom readers with full translation parity. PDF uses PDF.js v4.x with lazy `IntersectionObserver` rendering. Markdown uses marked.js with relative path resolution and sidebar TOC.

Communication flow: content script → `chrome.runtime.sendMessage` → background.js (API calls) → response back to content script → Shadow DOM popup display.

### VS Code Extension

- `extension.js` — Entry point. Registers commands, Premium Preview custom editor provider, markdown-it plugin integration.
- `src/translationService.js` — DeepL API client (Node.js `fetch`). Auto-detects Free (`:fx` suffix) vs Pro keys. Supports injected HTTP client for testing.
- `media/markdownPreview.js` — Injected into VS Code's Markdown Preview. Uses `command:` URIs to bridge webview CSP/CORS restrictions back to the extension host.
- `media/premiumPreview.js` — Custom editor webview with bi-directional `postMessage` communication.

## Key Patterns

- **ES Modules**: Chrome extension uses dynamic `await import(chrome.runtime.getURL('utils.js'))` for code sharing.
- **Shadow DOM isolation**: All UI (popups, floating buttons) rendered in Shadow DOM to avoid host page CSS interference. Style sync uses Promise-based waiting to prevent FOUC.
- **Concurrency protection**: `pendingDictionaryRequests` and `pendingTranslationRequests` Maps in background.js prevent duplicate API calls.
- **XSS prevention**: Mapping-based `escapeHtml()` + `textContent` injection. Never use `innerHTML` with untrusted content.

## Coding Conventions

- 4-space indentation, semicolons required.
- `const` over `let`; ES Modules preferred.
- CSS classes use `translator-*` prefix.
- JSDoc blocks on all exported/public functions (follow patterns in content.js, pdfviewer.js, utils.js).
- Commit messages: Conventional Commits with scope tokens matching top-level folders (`feat(chrome):`, `fix(pdf):`, `feat(vscode):`, `docs:`).

## Testing

- VS Code extension: `npm test` runs ESLint + custom test harness with mocked DeepL HTTP client. Extend `test/runTest.js` for new translation behaviors.
- Chrome extension: Manual smoke testing — double-click lookup, selection hover, PDF/Markdown flows. Follow `TEST_TRANSLATION.md` checklist.
- ESLint config: `.eslintrc.json` in vscode-extension (CommonJS, ES2021, strict no-unused-vars).

## Configuration & API Keys

- VS Code: `translater.deepLApiKey` setting or `DEEPL_API_KEY` env var.
- Merriam-Webster keys: store in local `.env` (gitignored) for testing.
- DeepL endpoint auto-detection: keys ending in `:fx` route to `api-free.deepl.com`, others to `api.deepl.com`.
