# Chrome Extension Smoke Test Checklist

## Setup

1. Load `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension` in `chrome://extensions`
2. Enable **Allow access to file URLs** if you want to test local Markdown/PDF files
3. Configure DeepL and Merriam-Webster keys in the options page
4. Run `npm test` once before Chrome smoke testing
5. Optionally run `npm run smoke:playwright` for an automated browser pass over the local web, Markdown, and PDF fixtures before doing the manual checklist

## Local Smoke Test Files

- Web page: `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/web-smoke.html`
- Primary Markdown file: `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/reader-smoke.md`
- Sibling Markdown file: `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/reference-note.markdown`
- PDF file: `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/viewer-smoke.pdf`

Open these local files directly in Chrome after enabling file URL access. Keeping all test documents in the same folder makes the sidebar file list deterministic for Markdown and PDF smoke tests.

## Web Page Tests

- Open `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/web-smoke.html`
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

- Open `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/reader-smoke.md` and confirm the custom viewer loads
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

- Open `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/manual-tests/viewer-smoke.pdf` and confirm the custom viewer loads
- Open the left sidebar and confirm the **Files** tab lists sibling PDF / Markdown documents from the same folder
- Confirm the sidebar lists `viewer-smoke.pdf`, `reader-smoke.md`, and `reference-note.markdown`
- Confirm the outline sidebar shows `Overview` and `Notes`, and both entries jump to the expected page
- Confirm zoom in / zoom out / fit width work without losing the current reading position
- Double-click a word on the PDF text layer and confirm the dictionary popup appears
- Select a sentence on the PDF and confirm the floating toolbar and translation popup work
- Confirm word lookup success, dictionary fallback-to-translation, and translation error states match the web page and Markdown viewer
