# Contributing

## Local Setup

1. Clone the repository.
2. Run `npm install`.
3. Open `chrome://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select `chrome-extension/`.
6. Open the extension options page and configure local API keys.
7. For Android work, open `android-app/` in Android Studio or use the checked-in Gradle Wrapper.
8. Copy `android-app/local.properties.example` to `android-app/local.properties` if Gradle needs an SDK path.

## Validation Expectations

- Run `npm test` for every code change.
- Run `npm run smoke:playwright` when Chrome interaction, viewer, or extension-loading behavior changes.
- Run `cd android-app && ./gradlew test` when Android source changes.
- Run `cd android-app && ./gradlew assembleDebug` when Android packaging, native libraries, assets, manifest, or Gradle configuration changes.
- Use `TEST_TRANSLATION.md` for manual smoke testing when a change affects UI, interaction flow, permissions, storage, PDF handling, or Markdown rendering.
- If your change affects visible behavior, verify the impacted Chrome or Android surface directly.

## Pull Request Expectations

- Describe the user-facing behavior you changed.
- List the validation you performed.
- Include screenshots or a GIF for UI changes.
- Call out privacy or security impact when a change touches permissions, storage, network requests, sanitization, or third-party assets.

## Commit Style

- Use Conventional Commits when possible.
- Keep commit scope focused and avoid bundling unrelated cleanup into feature or bug-fix commits.

## Repository Safety Rules

- Never commit API keys, tokens, or local-only secrets.
- Never commit local browser profiles, local config, or generated build artifacts.
- Preserve existing license headers when updating vendored third-party files.
- Document the upstream source and version when bumping vendored browser assets.

## Maintainer GitHub Settings

After the repository is pushed to GitHub, the maintainer should enable:

- secret scanning alerts
- push protection
- dependency graph
- Dependabot alerts
- security updates
- branch protection on `main`

Branch protection should match the current repository workflow:

- require pull requests before merge
- require review when collaborators are active
- require only checks that actually exist for this repository

Do not add required checks for CI workflows that have not been created yet.
