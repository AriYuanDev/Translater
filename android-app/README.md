# Translater Android

This directory contains the native Android Markdown reader for Translater.

It is separate from the Chrome extension and does not use a WebView bridge.

## Build

```bash
./gradlew test
./gradlew assembleDebug
```

The debug APK is generated at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

If Gradle cannot find the Android SDK, copy `local.properties.example` to `local.properties` and set `sdk.dir`.

On this machine the SDK path is:

```text
/Users/zhaozeyi/Documents/Android/sdk
```

## Scope

- Kotlin + Jetpack Compose + Material 3.
- MVI reader flow.
- Markwon native Markdown rendering.
- File picker, Android Open with, optional Markdown library scan.
- Merriam-Webster lookup and DeepL fallback translation.
- Offline sherpa-onnx/Piper pronunciation assets.
- ARM64-only native packaging unless device support requirements change.

See:

- `../docs/PRODUCT.md` for Android behavior expectations.
- `../docs/ARCHITECTURE.md` for Android module boundaries.
- `../docs/VALIDATION.md` for Android validation.
