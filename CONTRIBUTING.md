# Contributing

## Local Setup

```bash
npm install
```

Chrome extension:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Load unpacked from `chrome-extension/`.
4. Configure local API keys in the options page.

Android:

1. Open `android-app/` in Android Studio, or use the checked-in Gradle Wrapper.
2. If needed, copy `android-app/local.properties.example` to `android-app/local.properties` and set `sdk.dir`.

## Before Changing Behavior

Read `docs/PRODUCT.md`.

If user-facing behavior changes, update the relevant behavior contract or explain why the current contract still applies.

## Validation

Use `docs/VALIDATION.md`.

Minimum expectations:

- Chrome code: `npm test`
- Chrome interaction or viewer behavior: targeted manual smoke checks, and `npm run smoke:playwright` when available
- Android source: `cd android-app && ./gradlew test`
- Android packaging or assets: `cd android-app && ./gradlew assembleDebug`

## Pull Requests

Every PR should state:

- User flow affected.
- Validation performed.
- Screenshots or recordings for visible UI changes.
- Permission, storage, network, sanitization, or privacy impact.

## Commit Style

Use Conventional Commits when possible:

- `feat(chrome): ...`
- `fix(pdf): ...`
- `fix(md): ...`
- `fix(android): ...`
- `docs: ...`

Keep commits focused. Do not bundle unrelated cleanup into feature or bug-fix commits.

## Repository Safety

- Never commit API keys, tokens, local browser profiles, or local-only config.
- Preserve vendored third-party license headers.
- Document upstream source and version when bumping vendored browser assets.
