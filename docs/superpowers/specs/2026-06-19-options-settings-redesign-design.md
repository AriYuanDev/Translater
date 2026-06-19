# Options Settings Redesign Design

Date: 2026-06-19
Status: Approved for implementation planning

## Scope

Redesign the Chrome extension options page at `chrome-extension/options.html`.

The redesign keeps the existing settings and storage behavior:

- DeepL API key save, copy, and clear.
- Merriam-Webster API key save, copy, and clear.
- Translation trigger mode: click-to-translate or hover-to-translate.
- DeepL usage refresh.
- Translation cache status and clear action.

The redesign does not add new settings, change storage keys, change background message contracts, or alter content/PDF/Markdown reader behavior.

## Problem

The current options page is organized around implementation buckets rather than user tasks. It repeats large cards, uses a heavy decorative visual style, and leaves the user scanning several areas to answer a simple question: is translation, dictionary lookup, and quota protection ready?

The static `DeepL Behavior` table also duplicates information that belongs beside the relevant settings.

## Goals

- Show extension readiness immediately.
- Make API key setup fast to understand.
- Keep maintenance actions close to their status data.
- Reduce visual noise.
- Preserve existing DOM ids where possible so `options.js` changes stay small.
- Keep the page practical for repeated maintenance, not only first-time setup.

## Chosen Direction

Use the status-first workbench layout.

Top area:

- Page title: `Translater Settings`.
- Short helper text: configure translation, dictionary, and quota behavior.
- Three compact status cards:
  - Translation: DeepL configured or missing.
  - Dictionary: Merriam-Webster configured or missing.
  - Quota: DeepL usage state or unavailable.

Main area:

- Left column: primary setup.
  - Translation panel for DeepL key.
  - Dictionary panel for Merriam-Webster key.
- Right column: behavior and maintenance.
  - Behavior panel for click/hover translation trigger.
  - Usage panel for DeepL usage and translation cache.

Mobile:

- Stack all panels in one column.
- Keep the status cards above configuration panels.

## Information Architecture

### Translation Panel

Contains:

- `statusMessage`.
- DeepL key input with `apiKey`.
- Save button `saveBtn`.
- Copy button `copyDeepLKeyBtn`.
- Clear button `clearBtn`.
- Link to DeepL API signup.
- Helper copy explaining that selection translation requires a DeepL API key and requests are limited to 500 characters.

### Dictionary Panel

Contains:

- `mwStatusMessage`.
- Merriam-Webster key input with `mwApiKey`.
- Save button `saveMWBtn`.
- Copy button `copyMWKeyBtn`.
- Clear button `clearMWBtn`.
- Link to dictionaryapi.com signup.
- Helper copy explaining that word lookup and pronunciation depend on the Learners Dictionary API.

### Behavior Panel

Contains:

- Toggle `clickTriggerToggle`.
- Text that distinguishes the two modes:
  - Click mode saves quota and is the default.
  - Hover mode is faster but can trigger more requests.

### Usage Panel

Contains:

- DeepL usage text `deepLUsageStatus`.
- Refresh button `refreshUsageBtn`.
- Translation cache text `translationCacheStatus`.
- Clear cache button `clearTranslationCacheBtn`.
- Helper copy explaining that cache clearing can increase future DeepL usage.

### Removed Content

Remove the static `DeepL Behavior` table. Its facts move into the panels above.

## Visual Design

Use a quiet settings-page style:

- Neutral page background instead of large blue/purple gradients.
- White or near-white panels with subtle borders.
- 8px border radius for panels and controls.
- Compact spacing and readable section hierarchy.
- Save buttons use the primary accent.
- Copy, clear, refresh, and cache actions use secondary buttons.
- Status badges use subdued colors:
  - Ready: green.
  - Missing or action needed: amber.
  - Loading or unavailable: gray/blue.

Avoid emoji in headings and core status labels. Use plain text and small badges.

## Component Boundaries

Implementation can stay simple:

- Keep markup in `options.html`.
- Move the large inline style block to `chrome-extension/options.css` unless implementation evidence shows extension packaging issues.
- Keep behavior in `options.js`.
- If repeated key-panel logic becomes noisy, extract small helpers in `options.js`, but do not change message names or storage keys.

Recommended UI building blocks:

- `.settings-shell`
- `.settings-header`
- `.status-grid`
- `.status-card`
- `.settings-grid`
- `.settings-panel`
- `.field-group`
- `.button-row`
- `.setting-row`
- `.status-badge`
- `.toast`

## State And Data Flow

On `DOMContentLoaded`, keep the existing load sequence:

- `loadCurrentStatus()`
- `loadMWStatus()`
- `loadTriggerMode()`
- `loadDeepLUsage()`
- `loadTranslationCacheStats()`

The top status cards should be updated from the same source calls:

- Translation card uses `getTranslationEngine`.
- Dictionary card uses `getMWApiKey`.
- Quota card uses `getDeepLUsage`.

Save, copy, clear, refresh, and cache actions keep their current handlers and IDs.

## Error Handling

- Inline section status should carry validation and network errors.
- Toast should be reserved for successful transient actions such as saved, copied, cleared, or cache cleared.
- Disabled button states during save should remain.
- Failed trigger mode save should restore the previous toggle state.

## Accessibility

- Use semantic `section` elements with visible headings.
- Keep labels connected to inputs through `for` and `id`.
- Status messages should use `role="status"` or `aria-live="polite"` where practical.
- Buttons should keep clear text labels.
- Ensure focus states are visible on keyboard navigation.

## Test Plan

Automated:

- Keep `tests/options-copy-key.test.js` passing.
- Add an options structure test that verifies:
  - Translation, Dictionary, Behavior, and Usage sections exist.
  - Existing critical IDs still exist.
  - The old static `DeepL Behavior` table is gone.
- Run `npm test`.

Manual:

- Open the extension options page.
- Confirm configured/missing states are readable at the top.
- Save, copy, and clear both API keys with test values.
- Toggle click/hover mode.
- Refresh DeepL usage.
- Clear translation cache.
- Check narrow viewport stacking.

## Acceptance Criteria

- The first viewport answers whether translation and dictionary are configured.
- All existing options actions still work.
- The page has fewer repeated card patterns.
- Static behavior documentation is moved beside the settings it explains.
- No API key, storage, or background message contract changes are introduced.
