# Validation

## Default Commands

| Change | Command |
| --- | --- |
| Any Chrome extension code | `npm test` |
| Chrome interaction, viewer, or extension-loading behavior | `npm run smoke:playwright` when available, plus targeted manual checks |
| Android Kotlin source | `cd android-app && ./gradlew test` |
| Android packaging, native libraries, assets, manifest, or Gradle config | `cd android-app && ./gradlew assembleDebug` |

If a command cannot run in the local environment, record the exact reason.

## Change-Type Matrix

| Changed area | Minimum validation |
| --- | --- |
| `utils.js` shared UI, messaging, or TTS | `npm test`; manually check affected toolbar or popup flow |
| `interaction-controller.js` | `npm test`; check Web, PDF, and Markdown behavior against `docs/PRODUCT.md` |
| `content.js` | `npm test`; web page double-click and selection smoke |
| `pdfviewer.js` | `npm test`; PDF open, double-click lookup, sentence selection, zoom or sidebar checks touched by the change |
| `mdviewer.js` or `markdown-helpers.js` | `npm test`; Markdown open, sanitization, relative links, lookup, sentence selection |
| `background.js` network, cache, permissions, or TTS | `npm test`; options/API-key path if touched |
| Android reader or lookup | `cd android-app && ./gradlew test`; device/emulator smoke when UI behavior changes |
| Android assets or packaging | `cd android-app && ./gradlew test`; `cd android-app && ./gradlew assembleDebug` |
| Documentation-only | Link/reference check plus review for stale commands |

## Manual Chrome Smoke

Use the files in `manual-tests/`:

- `web-smoke.html`
- `reader-smoke.md`
- `reference-note.markdown`
- `viewer-smoke.pdf`

### Web Page

- Open `manual-tests/web-smoke.html`.
- Double-click `metamorphosis`; confirm lookup popup and pronunciation.
- Double-click `1234` or `...`; confirm no lookup popup.
- Select `The quick brown fox jumps over the lazy dog.`; confirm toolbar.
- Use toolbar speaker, translate, and Google buttons.
- Open local Markdown and PDF links.

### PDF Viewer

- Open `manual-tests/viewer-smoke.pdf`.
- Confirm the viewer loads and total pages are shown.
- Confirm the sidebar lists sibling Markdown/PDF files.
- Confirm outline entries `Overview` and `Notes`.
- Double-click a word on the text layer; confirm lookup popup and pronunciation.
- Select a sentence; confirm toolbar and translation.
- Check zoom behavior when the change touches zoom, rendering, or sidebar state.

### Markdown Viewer

- Open `manual-tests/reader-smoke.md`.
- Confirm default zoom is `100%` when no explicit zoom parameter exists.
- Confirm TOC, sidebar file list, relative image, and relative links.
- Confirm script/event HTML is sanitized and `javascript:` links are not executable.
- Double-click a word; check against the target behavior in `docs/PRODUCT.md`.
- Select a sentence; confirm toolbar and translation.
- Check zoom behavior when the change touches zoom or layout.

## Manual Android Smoke

- Install a debug APK on a target ARM64 device or emulator.
- Open a Markdown file through the picker.
- Open a Markdown file through Android Open with.
- If testing library scan, grant all-files access and refresh.
- Double-tap one English word; confirm lookup popup.
- Use Android Process Text on one English word in a compatible app.
- Test speak action online and offline.
- If assets changed, verify fallback from local TTS to Android system TTS by using a debug build with missing or invalid local model assets.

## PR Evidence

Every change should state:

- User flow affected.
- Commands run.
- Manual checks run, when relevant.
- Screenshots or recordings for visible UI changes.
- Permission, storage, network, sanitization, or privacy impact.
