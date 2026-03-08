# Chrome Extension Smoke Test Checklist

## Setup

1. Load `/Users/zhaozeyi/Documents/gemini cli workspace/Translater/chrome-extension` in `chrome://extensions`
2. Enable **Allow access to file URLs** if you want to test local Markdown/PDF files
3. Configure DeepL and Merriam-Webster keys in the options page

## Web Page Tests

- Double-click `metamorphosis` on an English page and confirm the dictionary popup appears
- Double-click an obvious non-word like `...` or `1234` and confirm no dictionary popup appears
- Select `The quick brown fox jumps over the lazy dog.` and confirm the floating toolbar appears
- Hover `T` and confirm the translation popup renders
- Click the speaker button and confirm TTS works
- Click the Google button and confirm the search opens in a new tab

## Markdown Viewer Tests

- Open a local or remote `.md` file and confirm the custom viewer loads
- Open the left sidebar and confirm the **Files** tab lists sibling PDF / Markdown documents from the same folder
- Confirm headings appear in the sidebar TOC
- Confirm inline HTML with scripts/events is not executed
- Confirm relative links and images resolve correctly
- Click **Open Original** and confirm the original file opens without being redirected back into the custom viewer

## PDF Viewer Tests

- Open a local or remote `.pdf` file and confirm the custom viewer loads
- Open the left sidebar and confirm the **Files** tab lists sibling PDF / Markdown documents from the same folder
- Confirm the outline sidebar works when the PDF has bookmarks
- Confirm zoom in / zoom out / fit width work without losing the current reading position
- Double-click a word on the PDF text layer and confirm the dictionary popup appears
- Select a sentence on the PDF and confirm the floating toolbar and translation popup work
