# Product Direction

## Product Promise

Translater is a reading assistant for English technical material. It should help a reader understand a word or sentence without leaving the current page, PDF, Markdown file, or Android reader.

Primary promise:

- Double-click or double-tap one English word to understand and pronounce it.
- Select a sentence to translate or speak it.
- Keep the same interaction model across supported reading surfaces unless a difference is documented.

## Product Priorities

1. Reading-flow reliability.
2. Cross-surface behavior consistency.
3. Pronunciation correctness.
4. Translation usefulness.
5. UI clarity.
6. New feature breadth.

When priorities conflict, prefer fewer behaviors that work consistently over more behaviors that differ by surface.

## Core Surfaces

| Surface | Primary use |
| --- | --- |
| Chrome content script | Web page lookup, sentence translation, and TTS |
| Chrome PDF viewer | PDF reading with lookup, translation, zoom, outline, and file sidebar |
| Chrome Markdown viewer | Markdown reading with lookup, translation, zoom, TOC, relative links, sanitization, and file sidebar |
| Android app | Native Markdown reading, lookup, translation fallback, Process Text, and offline pronunciation |

## Chrome Behavior Contract

| Interaction | Web page | PDF viewer | Markdown viewer |
| --- | --- | --- | --- |
| Double-click one English word | Show lookup popup and speak selected word | Show lookup popup and speak selected word | Show lookup popup and speak selected word |
| Double-click non-word or non-English text | Do nothing | Do nothing | Do nothing |
| Select multi-word English text | Show floating toolbar | Show floating toolbar | Show floating toolbar |
| Toolbar speaker | Speak selected text | Speak selected text | Speak selected text |
| Toolbar translate | Show translation popup | Show translation popup | Show translation popup |
| Popup speaker | Prefer selected-word dictionary MP3; fall back to TTS | Same | Same |

If a surface cannot match this table, record the exception before changing code.

## Android Behavior Contract

| Interaction | Expected behavior |
| --- | --- |
| Open Markdown through picker | Load and render native Markdown reader |
| Open Markdown through Android Open with | Load same reader flow |
| Scan Markdown library | Requires user-granted all-files access on Android 11+ |
| Double-tap one English word | Show lookup popup and pronounce selected word |
| Android Process Text on one English word | Launch lookup and pronunciation |
| Speak action | Prefer Merriam-Webster MP3, then local sherpa-onnx/Piper TTS, then Android system TTS |

## Non-Goals

- Full PDF editing.
- Full dictionary app replacement.
- General browser automation.
- Broad Android ABI support before a real device requirement exists.
- Background listening or global overlays outside user-triggered text actions.

## Change Rule

Before changing interaction behavior, update the relevant contract table in this file or explicitly confirm that the current contract still applies.
