# Translation Test Document

This document is designed to test the **Translater for VS Code** extension.

## Test Case 1: Double-Click Translation
Double-click the following word to see if a translation popup appears:
- **Metamorphosis**

## Test Case 2: Selection Translation
Select the following sentence to trigger the floating "T" button:
- *The quick brown fox jumps over the lazy dog.*

## Test Case 3: Complex Formatting
Select text within a code block:
```js
console.log("Hello World");
```

## Troubleshooting
If clicking the "T" button does nothing or turns the page blank:
1. Ensure the DeepL API Key is set in Settings.
2. Run `Developer: Reload Window`.
3. Check if the "T" button stays in place without jumping.
