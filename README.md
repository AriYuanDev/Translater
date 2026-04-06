# Translater

Translater is a Chrome extension source repository for dictionary lookup, sentence translation, and reader-friendly PDF and Markdown workflows.

This repository is meant to be loaded with Chrome's **Load unpacked** flow during development. It does not contain a packaged Chrome Web Store release artifact.

## Features

- **Dictionary lookup**: Double-click a word to fetch Merriam-Webster definitions, phonetics, audio, and translated definition support.
- **Sentence translation**: Select multi-word text to open the floating action toolbar and translate with DeepL.
- **PDF reader**: Open PDFs in the custom viewer with lazy page rendering, outline sync, anchored zoom, and translation tools.
- **Markdown reader**: Open Markdown files in the custom viewer with table of contents, HTML sanitization, relative path resolution, and translation tools.
- **Shared UI stack**: Web pages, PDF, and Markdown surfaces reuse the same popup, floating toolbar, text-to-speech, and definition helpers.

## Repository Structure

```text
Translater/
├── chrome-extension/      # Chrome extension source
├── manual-tests/          # Local smoke-test fixtures for web, Markdown, and PDF
├── scripts/               # Local smoke-test helpers
├── tests/                 # Node + jsdom test suite
├── README.md              # Project overview
├── TECHNICAL.md           # Architecture notes
└── TEST_TRANSLATION.md    # Manual smoke-test checklist
```

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory from this repository
5. Open the extension options page and enter your API keys

## Configuration

- DeepL API key: configure it in the extension options page.
- Merriam-Webster API key: configure it in the extension options page.
- The repository never stores default API keys. Keep real keys in extension-local storage only.

## Permissions and Privacy

- `"<all_urls>"` is required because the extension injects the shared lookup and translation UI on regular web pages and routes PDF or Markdown URLs into the custom viewers.
- The current permission scope matches the extension's existing architecture. If permissions are narrowed in the future, that change should be handled as a separate implementation task instead of being hidden in documentation.
- DeepL and Merriam-Webster host permissions are required for translation, dictionary lookup, and usage checks.
- API keys are entered through the options page and stored in Chrome extension storage on your machine.
- Rendered Markdown is sanitized before it is inserted into the custom viewer.

## Development Notes

- Shared popup and floating toolbar logic lives in `chrome-extension/utils.js`.
- Shared word lookup and sentence translation flow lives in `chrome-extension/interaction-controller.js`.
- PDF viewer logic lives in `chrome-extension/pdfviewer.js`.
- Markdown viewer logic lives in `chrome-extension/mdviewer.js`.
- Background routing and API orchestration live in `chrome-extension/background.js`.
- Vendored third-party browser assets keep their upstream license headers in the checked-in files.

## Automated Validation

- Run `npm test` to execute the lightweight Node + jsdom suite for routing helpers, sidebar parsing, Markdown sanitization, and shared interaction flows.
- Run `npm run smoke:playwright` to launch a real browser, load the unpacked extension, and smoke-test the bundled web, Markdown, and PDF fixtures end to end.

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
