# Translater - Smart Translation Assistant

This repository contains two versions of the "Translater" utility: a **Chrome Browser Extension** and a **VS Code Extension**.

Both extensions share core features like hover translation, PDF previewing, and high-quality dictionary lookups (DeepL / Merriam-Webster).

## 📁 Repository Structure

```
Translater/
├── chrome-extension/      # The original Chrome Extension source
├── vscode-extension/      # The ported VS Code Extension source
├── .gitignore             # Root gitignore
└── README.md              # Project documentation
```

---

## 🌐 Chrome Extension

A concise and efficient Chrome translation plugin supporting double-click word translation, text selection hover, and local TTS.

### Features
*   **Dictionary Lookup**: Instant popup using Merriam-Webster API. Prioritizes professional audio recordings, falling back to high-quality AI TTS.
*   **Morphed Word Support**: Intelligent recognition of word forms (plurals, past tense). Displays the origin word and provides specific pronunciation for the morphed variant.
*   **Smart Interactions**: Selected text triggers a premium floating menu. Hover "Translate" for instant meaning, or Click "Speak" for pronunciation (preventing accidental noise).
*   **Premium Pro UI**: Sophisticated glassmorphism aesthetic with smooth animations, optimized for clarity and focus.
*   **Fully Internationalized**: 100% English interface, error messaging, and documentation.
*   **DeepL Integration**: Support for both DeepL Free and Pro APIs for superior sentence translation.
*   **PDF Reader**: Advanced built-in PDF viewer with integrated translation tools, sidebar navigation, and full-screen support.
*   **Outline Auto-Sync**: PDF reader sidebar highlights the current page and follows scrolling with anchored zoom behavior.

### Installation
1.  Open Chrome → `chrome://extensions/`
2.  Enable **Developer mode**.
3.  Click **Load unpacked**.
4.  Select the `Translater/chrome-extension` folder.

---

## 💻 VS Code Extension

Port of the "Translater" extension for VS Code, enabling seamless translation within your editor.

### Features
*   **Context Menu**: Select text, right-click, and choose "Translate Selection".

### Installation (.vsix)
1.  Download `translater-v1.4.5.vsix` from the project root.
2.  In VS Code, open the Extensions view (`Ctrl+Shift+X`).
3.  Click the **...** (Views and More Actions) menu and select **Install from VSIX...**.
4.  Select the `.vsix` file.

> [!NOTE]
> If the file was downloaded with a `.zip` or `.pkg` extension due to system security settings, simply rename it back to `.vsix` before installing.

### Configuration
You can configure API keys in VS Code Settings:
*   `translater.deepLApiKey`: DeepL API Key ([Get Free Key](https://www.deepl.com/pro-api)).

---

## 🔧 Technology Stack

| Feature | Chrome Extension (Refactored) | VS Code Extension |
| :--- | :--- | :--- |
| **Architecture** | **ES Modules (ESM) & Shadow DOM (Isolation)** | Node.js |
| **Runtime** | Browser JS (DOM / Web Components) | VS Code API |
| **Networking** | `fetch` (Service Worker) | `fetch` (Modern Node API) |
| **Security** | 100% Shadow DOM & CSP Friendly | VS Code Configuration |

## 📝 Changelog
### [1.4.5] - 2026-02-08
*   **PDF Sidebar Now Tracks Current Page**: Automatically highlights the active outline entry and keeps it visible while scrolling through the document.
*   **Zoom Anchor Stability**: When zooming in/out or fitting width, the viewer preserves the content at the center of the screen to prevent sudden jumps.
*   **PDF Interaction Polish**: General refinements to keep sidebar toggling and zoom controls in sync with the new anchor logic.

### [1.4.4] - 2026-02-07
*   **Interaction Refinement**: Changed the floating "Speak" button trigger from hover to **click**. This prevents accidental audio playback when moving the mouse across the screen, while keeping the "Translate" button hover-triggered for speed.
*   **VS Code Reliability**: Fixed missing `activationEvents`, provided a Node16-compatible HTTPS client (no native `fetch` dependency), and added automated lint/test coverage for the `Translate Selection` command.
### [1.4.3] - 2026-02-03
*   **Critical Fix (PDF)**: Resolved a race condition in the PDF Viewer where dictionary and translation popups could overlap. Now enforces strict cleanup (`removeAllPopups`) before showing new results.
*   **VS Code DeepL Pro**: Added automatic API detection for VS Code Extension. It now correctly identifies Pro keys (non-`:fx`) and switches to the `api.deepl.com` endpoint, mirroring the Chrome extension's capability.
*   **UI Readability**: Improved the contrast of the "from [root word]" label in popups to ensure high legibility on all backgrounds.
*   **Reliability**:
    *   Added timeout protection (3s) to the TTS `waitForVoices` logic to prevent infinite hangs on systems with unstable speech synthesis.
    *   Simplified API Key validation in options to rely on actual server response rather than brittle format checks.
    *   Removed dead code citations (`path` module) from the VS Code extension.


### [1.4.2] - 2026-02-02
*   **Deep Code Audit**: Completed a comprehensive 3-round code audit, eliminating all known ReferenceErrors and logic inconsistencies.
*   **Documentation Alignment**: Achieved 100% JSDoc coverage for core utility functions (`utils.js`, `content.js`, `pdfviewer.js`), ensuring long-term maintainability.
*   **Audio Logic Unification**: Standardized audio selection algorithms across the main extension and PDF viewer to consistently prioritize high-quality dictionary pronunciations.
*   **Stability**: Fixed critical missing imports in the PDF viewer that could cause runtime crashes during specific interaction flows.

### [1.4.1] - 2026-02-01
*   **English Localization**: Removed all Chinese UI strings across the extension (popups, settings, viewer, logs) for a consistent international experience.
*   **Premium UI Overhaul**: Implemented high-fidelity Glassmorphism design with `25px` blur, refined typography, and fluid `cubic-bezier` animations.
*   **Refined Pronunciation Logic**: 
    - Main speaker button now strictly prioritizes dictionary audio for the headword.
    - Added a mini-speaker for morphed words (e.g., "running" → "run") using local TTS for the specific variant used in context.
    - Double-clicking morphed words now automatically speaks the variant instead of the headword for better contextual feedback.
*   **UI Polish**: Unified styles between the web content popups and the PDF reader. Improved layout for "from [origin]" labels using a more elegant italicized secondary style.

### [1.4.0] - 2026-01-31
*   **Layout Optimization**: Moved phonetic symbols below the headword to prevent horizontal overflow for long words.
*   **Zero FOUC (Flash of Unstyled Content)**: Refactored Shadow DOM loading sequence to ensure styles are fully parsed before UI rendering.
*   **PDF Sync**: Brought all UI enhancements and bug fixes to the built-in PDF viewer.
*   **API Robustness**: Added response format validation and concurrency protection for background API requests.
*   **Lifecycle Safety**: Added context validity checks after async callbacks to prevent errors during extension updates.

### [1.3.1] - 2026-01-29
*   **Audio Bug Fix**: Resolved duplicate audio playback by unifying event handlers.
*   **Shadow DOM Integration**: Chrome UI components are now completely isolated from page styles.
*   **Modular Logic**: Common utilities extracted into a shared `utils.js` (ESM).
*   **DeepL Pro Support**: Added support for both DeepL Free and Pro API keys.
*   **Performance**: Improved TTS loading and storage access efficiency.

## 📝 License
MIT