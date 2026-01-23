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

### Installation (Development)
1.  Open this folder in VS Code.
2.  Run `npm install` in the root (or inside `vscode-extension` if managed separately).
3.  Press `F5` to launch the **Extension Development Host**.

### Configuration
You can configure API keys in VS Code Settings:
*   `translater.deepLApiKey`: DeepL API Key ([Get Free Key](https://www.deepl.com/pro-api)).

---

## 🔧 Technology Stack

| Feature | Chrome Extension | VS Code Extension |
| :--- | :--- | :--- |
| **Runtime** | Browser JS (DOM) | Node.js / Webviews |
| **Dictionary** | `fetch` (Background) | `https.request` (Node) |
| **Storage** | `chrome.storage` | `vscode.workspace.getConfiguration` |

## 📝 License
MIT
