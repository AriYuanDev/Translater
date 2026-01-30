# Translater / 快译

This repository contains two versions of the "Fast Trans" utility: a **Chrome Browser Extension** and a **VS Code Extension**.

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
*   **Double-click Translation**: Instant popup with Merriam-Webster US pronunciation.
*   **Smart Hover Actions**: Select text to see floating buttons (Pronounce / Translate). Close button positions smartly on top, supports hover-to-close.
*   **English-Only Selection**: Floating buttons only appear when selected text is entirely English (no mixed Chinese-English triggers).
*   **TTS Toggle Control**: Click the speak button again during playback to stop. Floating buttons stay visible until speech ends.
*   **DeepL Integration**: Configuration for high-quality translations (My fallback: Google).
*   **PDF Viewer**: Custom PDF viewer with built-in translation support. Supports sidebar TOC (Table of Contents) and filename in tab title.

### Installation
1.  Open Chrome → `chrome://extensions/`
2.  Enable **Developer mode**.
3.  Click **Load unpacked**.
4.  Select the `Translater/chrome-extension` folder.

---

## 💻 VS Code Extension

Port of the "Fast Trans" extension for VS Code, enabling seamless translation within your editor.

### Features
*   **Context Menu**: Select text, right-click, and choose "Translate Selection".

### Installation (.vsix)
1.  Download `translater-v1.3.1.vsix` from the project root.
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

## 📝 Major Refactoring (Version 1.3.1 - 2026-01-29)

The project underwent a significant architectural upgrade and bug fixing:
*   **Audio Bug Fix**: Resolved duplicate audio playback by unifying event handlers.
*   **Shadow DOM Integration**: Chrome UI components are now completely isolated from page styles.
*   **Modular Logic**: Common utilities extracted into a shared `utils.js` (ESM).
*   **DeepL Pro Support**: Added support for both DeepL Free and Pro API keys.
*   **Performance**: Improved TTS loading and storage access efficiency.

## 📝 License
MIT
