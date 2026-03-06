# Translater - Chrome Translation Extension

Translater is now a **Chrome-only** translation extension focused on fast dictionary lookup, sentence translation, and reader-friendly PDF/Markdown experiences.

## Repository Structure

```text
Translater/
├── chrome-extension/      # Chrome extension source
├── .gitignore             # Root gitignore
├── README.md              # Project overview
├── TECHNICAL.md           # Architecture notes
└── TEST_TRANSLATION.md    # Manual smoke-test checklist
```

## Features

- **Dictionary lookup**: Double-click a word for Merriam-Webster definitions, phonetics, audio, and Chinese definition translation.
- **Sentence translation**: Select multi-word text to open the floating action toolbar and translate with DeepL.
- **PDF reader**: Open PDFs in the custom viewer with lazy page rendering, outline sync, anchored zoom, and translation tools.
- **Markdown reader**: Open Markdown files in the custom viewer with table of contents, safe HTML sanitization, relative path resolution, and translation tools.
- **Shared UI stack**: Content pages, PDF, and Markdown reuse the same popup, floating toolbar, TTS, and definition helpers.

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension`

## Configuration

- DeepL API key: set in the extension options page.
- Merriam-Webster API key: set in the extension options page.

## Development Notes

- Shared popup / floating toolbar logic lives in `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension/utils.js`.
- PDF viewer logic lives in `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension/pdfviewer.js`.
- Markdown viewer logic lives in `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension/mdviewer.js`.
- Background routing and API orchestration live in `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension/background.js`.

## Manual Validation

Use `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/TEST_TRANSLATION.md` as the smoke-test checklist after loading the unpacked extension.
