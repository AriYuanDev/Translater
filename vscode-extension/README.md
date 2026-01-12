# Fast Trans for VS Code

Port of the popular Chrome Extension for VS Code.

## Features

- **Hover Translation**: Hover over any English word to see definitions, phonetics, and translations.
- **Selection Translation**: Right-click any text -> "Translate Selection".
- **PDF Viewer**: Open `.pdf` files directly in VS Code with a custom viewer.

## Configuration

This extension requires API keys for the best experience.

### 1. Open Settings
- Press `Cmd + ,` (Mac) or `Ctrl + ,` (Windows/Linux).
- Search for **"Translater"**.

### 2. Configure Keys
- **DeepL Api Key** (`translater.deepLApiKey`): 
  - Required for sentence translation.
  - Get a free key at [DeepL API](https://www.deepl.com/pro-api).
- **Mw Api Key** (`translater.mwApiKey`): 
  - Required for dictionary definitions and audio.
  - Get a free "Learner's Dictionary" key at [DictionaryAPI.com](https://dictionaryapi.com/).

## Installation

1. Install the `.vsix` file via **Extensions** side panel.
2. Click the **...** (Views and More Actions) menu at the top right of the Extensions panel.
3. Select **Install from VSIX...**
4. Choose the `translater-vscode-0.0.1.vsix` file.
