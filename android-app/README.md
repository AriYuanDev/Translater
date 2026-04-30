# Translater Android

This is the Android v1 implementation for Translater. It is intentionally separate from the Chrome extension.

## What is implemented

- Kotlin + Jetpack Compose Android app under `android-app/`.
- MVI reader flow with `ReaderIntent`, `ReaderUiState`, and `ReaderEffect`.
- Storage Access Framework file picker for `.md` / `.markdown` / plain text files.
- Markwon-based Markdown rendering.
- Double-tap word lookup.
- Merriam-Webster Learners Dictionary lookup and parser.
- DeepL translation for fallback word translation and definition translation.
- DataStore settings for API keys and speech rate.
- Built-in offline neural TTS path using sherpa-onnx and `vits-piper-en_US-amy-low`.
- Fallback order: Merriam-Webster MP3, local AI TTS, Android system TTS.
- Verified local debug APK build with bundled offline TTS assets.
- Optimized for Xiaomi 14+ / modern ARM64 phones by packaging only `arm64-v8a` native libraries and English espeak data.

## Bundled offline TTS assets

The first version is designed to bundle offline AI pronunciation:

- Native libraries: `app/src/main/jniLibs/**/libsherpa-onnx-jni.so`, `libonnxruntime.so`, and related sherpa libraries.
- Model assets: `app/src/main/assets/vits-piper-en_US-amy-low/`.
- ABI target: `arm64-v8a` only. The removed `armeabi-v7a`, `x86`, and `x86_64` packages are not needed for Xiaomi 14+ phones.
- espeak data is trimmed to English resources needed for the bundled `en_US-amy-low` voice.

Source packages used during implementation:

- sherpa-onnx Android release: `v1.12.39`
- Piper voice package: `vits-piper-en_US-amy-low`

Downloaded artifact checksums:

```text
a8e1168441027201dda781dd21241d8215548ffbe462d72f2535bce1594b240f  sherpa-onnx-v1.12.39-android.tar.bz2
c70f5284a09a7fd4ed203b39b2ff51cac1432b422b852eb647b481dade3cf639  vits-piper-en_US-amy-low.tar.bz2
```

## Build

Open `android-app/` in Android Studio, let it install the Android SDK if needed, then run:

```bash
./gradlew test
./gradlew assembleDebug
```

The current local machine has Java 21, Android Studio, and an Android SDK at:

```text
/Users/zhaozeyi/Documents/Android/sdk
```

`local.properties` points Gradle to that SDK. If Android Studio does not detect the SDK, copy `local.properties.example` to `local.properties` and set `sdk.dir`.

No separate global `gradle` command is required; use the checked-in Gradle Wrapper.

Verified locally:

```text
./gradlew test          PASS
./gradlew assembleDebug PASS
```

Debug APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is large because it bundles sherpa-onnx native libraries and the Piper voice model, but it is now ARM64-only instead of a universal four-ABI package.

## Android CLI note

The existing Android SDK is enough to build this project. Installing Android SDK Command-line Tools is only needed if you want to manage packages from the terminal with `sdkmanager`; it is not required for `./gradlew test` or `./gradlew assembleDebug`.

## Manual acceptance

1. Install debug APK on an Android device.
2. Open a local Markdown file through the file picker.
3. Double-tap an English word.
4. Confirm the popup shows word, phonetic, definitions, translated definitions, and speak action.
5. Turn off network and tap speak; pronunciation should fall back to bundled local AI TTS.
6. Remove or corrupt the model assets in a debug build; the app should keep reading and fall back to Android system TTS.

## Test coverage

- `MerriamWebsterParserTest`: parser coverage for normal Learners Dictionary entries and suggestion-list misses.
- `WordExtractorTest`: double-tap word boundary coverage for hyphenated words, apostrophes, and Chinese text.
- `SpeechFallbackPolicyTest`: pronunciation source order coverage.
- `ReaderReducerTest`: MVI state transition coverage for document loading and loaded states.

## Security notes

- API keys are stored in app-private DataStore and are never logged or displayed after saving.
- Markdown is treated as untrusted input. The app uses native rendering and does not create a WebView bridge.
- External services are called over HTTPS only.
