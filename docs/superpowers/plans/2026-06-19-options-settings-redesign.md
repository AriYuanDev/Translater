# Options Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Chrome extension options page into a status-first settings workbench without changing storage keys, background message contracts, or existing settings behavior.

**Architecture:** Keep the options page as a simple extension page. Move presentation from the inline `<style>` block into `chrome-extension/options.css`, keep `options.html` as semantic markup with stable IDs, and keep behavior in `chrome-extension/options.js` with small helpers for the new top status cards.

**Tech Stack:** Chrome extension options page, plain HTML/CSS/JavaScript ES modules, `chrome.storage.sync`, extension runtime messages, Node test runner with jsdom helpers.

---

## File Structure

- Create `chrome-extension/options.css`
  - Owns the full settings-page visual system: shell, header, status cards, panels, forms, buttons, toggle, status messages, toast, and responsive layout.
- Modify `chrome-extension/options.html`
  - Removes the inline `<style>` block.
  - Links `options.css`.
  - Replaces repeated card markup with semantic `section` blocks.
  - Preserves all existing critical control IDs.
- Modify `chrome-extension/options.js`
  - Keeps existing save/copy/clear/refresh handlers.
  - Adds top status-card element references.
  - Updates status cards from existing load calls.
  - Removes emoji from success/warning copy.
- Create `tests/options-structure.test.js`
  - Verifies the new information architecture and stable control IDs.
  - Verifies the static `DeepL Behavior` table was removed.
- Modify `tests/options-copy-key.test.js`
  - Keep as-is unless text assertions need updating because toast copy changes.

Do not touch `background.js`, content scripts, PDF/Markdown viewers, storage key names, runtime message action names, or Android files.

---

### Task 1: Add Options Structure Test

**Files:**
- Create: `tests/options-structure.test.js`
- Read: `chrome-extension/options.html`

- [ ] **Step 1: Write the failing structure test**

Create `tests/options-structure.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupDom, teardownDom } from './helpers/dom-test-utils.js';

async function loadOptionsDom() {
    const html = await readFile(new URL('../chrome-extension/options.html', import.meta.url), 'utf8');
    return setupDom(html, 'chrome-extension://test/options.html');
}

test('options page exposes the redesigned settings workbench sections', async () => {
    const dom = await loadOptionsDom();

    try {
        const sectionNames = Array.from(document.querySelectorAll('[data-settings-section]'))
            .map(section => section.getAttribute('data-settings-section'));

        assert.deepEqual(sectionNames, [
            'translation',
            'dictionary',
            'behavior',
            'usage'
        ]);

        assert.ok(document.querySelector('.status-grid'), 'top status grid is missing');
        assert.ok(document.getElementById('translationStatusState'), 'translation status card state is missing');
        assert.ok(document.getElementById('dictionaryStatusState'), 'dictionary status card state is missing');
        assert.ok(document.getElementById('quotaStatusState'), 'quota status card state is missing');
    } finally {
        teardownDom(dom);
    }
});

test('options page keeps existing control ids and removes the old behavior table', async () => {
    const dom = await loadOptionsDom();

    try {
        const criticalIds = [
            'apiKey',
            'saveBtn',
            'copyDeepLKeyBtn',
            'clearBtn',
            'statusMessage',
            'mwApiKey',
            'saveMWBtn',
            'copyMWKeyBtn',
            'clearMWBtn',
            'mwStatusMessage',
            'clickTriggerToggle',
            'deepLUsageStatus',
            'refreshUsageBtn',
            'translationCacheStatus',
            'clearTranslationCacheBtn',
            'toast'
        ];

        criticalIds.forEach(id => {
            assert.ok(document.getElementById(id), `missing #${id}`);
        });

        assert.equal(document.querySelector('table'), null);
        assert.equal(document.body.textContent.includes('DeepL Behavior'), false);
    } finally {
        teardownDom(dom);
    }
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --test tests/options-structure.test.js
```

Expected: FAIL because `data-settings-section`, `.status-grid`, and status card IDs do not exist yet, and the old table still exists.

- [ ] **Step 3: Commit the failing test**

Only commit if the team accepts test-only commits. Otherwise keep it staged for the implementation task.

Suggested commit when committing separately:

```bash
git add tests/options-structure.test.js
git commit -m "test(options): cover settings page structure"
```

---

### Task 2: Extract And Replace Options Styling

**Files:**
- Create: `chrome-extension/options.css`
- Modify: `chrome-extension/options.html`
- Test: `tests/options-structure.test.js`

- [ ] **Step 1: Create `chrome-extension/options.css`**

Create `chrome-extension/options.css` with this content:

```css
* {
    box-sizing: border-box;
}

:root {
    color-scheme: light;
    --page-bg: #f6f7f9;
    --panel-bg: #ffffff;
    --panel-border: #dfe3ea;
    --text-main: #18202f;
    --text-muted: #667085;
    --text-soft: #8792a2;
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --success: #12805c;
    --success-bg: #e9f8f1;
    --warning: #a15c00;
    --warning-bg: #fff4df;
    --info: #1d4ed8;
    --info-bg: #edf4ff;
    --danger: #b42318;
    --danger-bg: #fff0ed;
    --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

body {
    margin: 0;
    min-height: 100vh;
    background: var(--page-bg);
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

button,
input {
    font: inherit;
}

.settings-shell {
    width: min(1080px, calc(100% - 40px));
    margin: 0 auto;
    padding: 40px 0 56px;
}

.settings-header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-end;
    margin-bottom: 24px;
}

.settings-kicker {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
}

h1 {
    margin: 0;
    color: var(--text-main);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 0;
}

.settings-subtitle {
    max-width: 560px;
    margin: 10px 0 0;
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1.5;
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 18px;
}

.status-card,
.settings-panel {
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    box-shadow: var(--shadow);
}

.status-card {
    padding: 16px;
}

.status-label {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
}

.status-value {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
}

.status-title {
    font-size: 16px;
    font-weight: 700;
}

.status-note {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.4;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
}

.status-badge.ready {
    background: var(--success-bg);
    color: var(--success);
}

.status-badge.warning {
    background: var(--warning-bg);
    color: var(--warning);
}

.status-badge.info {
    background: var(--info-bg);
    color: var(--info);
}

.status-badge.neutral {
    background: #eef1f5;
    color: var(--text-muted);
}

.settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    gap: 18px;
    align-items: start;
}

.settings-column {
    display: grid;
    gap: 18px;
}

.settings-panel {
    padding: 22px;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
}

.panel-title {
    margin: 0;
    color: var(--text-main);
    font-size: 18px;
    font-weight: 700;
}

.panel-desc,
.field-help,
.setting-desc {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.45;
}

.panel-desc {
    margin: 6px 0 0;
}

.field-group {
    display: grid;
    gap: 8px;
    margin-top: 16px;
}

label {
    color: var(--text-main);
    font-size: 14px;
    font-weight: 700;
}

input[type="password"],
input[type="text"] {
    width: 100%;
    border: 1px solid #cfd6e2;
    border-radius: 8px;
    background: #ffffff;
    color: var(--text-main);
    padding: 11px 13px;
    font-size: 14px;
}

input:focus-visible,
button:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.2);
    outline-offset: 2px;
}

input:focus {
    border-color: var(--accent);
}

.field-help {
    margin: 0;
}

.field-help a {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
}

.field-help a:hover {
    text-decoration: underline;
}

.button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
}

.btn {
    min-height: 38px;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
}

.btn-primary {
    background: var(--accent);
    color: #ffffff;
}

.btn-primary:hover {
    background: var(--accent-hover);
}

.btn-secondary {
    background: #ffffff;
    border-color: #cfd6e2;
    color: var(--text-main);
}

.btn-secondary:hover {
    background: #f8fafc;
}

.status {
    border-radius: 8px;
    padding: 11px 13px;
    margin-bottom: 14px;
    font-size: 13px;
    line-height: 1.4;
}

.status.success {
    background: var(--success-bg);
    border: 1px solid rgba(18, 128, 92, 0.25);
    color: var(--success);
}

.status.info {
    background: var(--info-bg);
    border: 1px solid rgba(37, 99, 235, 0.2);
    color: var(--info);
}

.status.warning {
    background: var(--warning-bg);
    border: 1px solid rgba(161, 92, 0, 0.25);
    color: var(--warning);
}

.status.hidden {
    display: none;
}

.setting-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 16px 0;
    border-top: 1px solid #eef1f5;
}

.setting-row:first-of-type {
    border-top: 0;
    padding-top: 0;
}

.setting-title {
    color: var(--text-main);
    font-size: 14px;
    font-weight: 700;
}

.setting-desc {
    margin-top: 4px;
}

.switch {
    position: relative;
    display: inline-block;
    width: 48px;
    height: 28px;
    flex: 0 0 auto;
}

.switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: #c8d1df;
    border-radius: 999px;
    transition: background 0.2s;
}

.slider::before {
    content: "";
    position: absolute;
    width: 22px;
    height: 22px;
    left: 3px;
    bottom: 3px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
    transition: transform 0.2s;
}

.switch input:checked + .slider {
    background: var(--accent);
}

.switch input:checked + .slider::before {
    transform: translateX(20px);
}

.toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%) translateY(80px);
    background: var(--success);
    color: #ffffff;
    border-radius: 8px;
    padding: 12px 18px;
    font-size: 14px;
    font-weight: 700;
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
}

.toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

@media (max-width: 860px) {
    .settings-shell {
        width: min(100% - 28px, 680px);
        padding: 28px 0 44px;
    }

    .settings-header {
        display: block;
    }

    .status-grid,
    .settings-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 520px) {
    .button-row,
    .setting-row,
    .status-value {
        align-items: stretch;
        flex-direction: column;
    }

    .btn {
        width: 100%;
    }
}
```

- [ ] **Step 2: Link the stylesheet from `options.html`**

Replace the inline `<style>...</style>` block in `chrome-extension/options.html` with:

```html
    <link rel="stylesheet" href="options.css">
```

Keep it inside `<head>` after `<title>`.

- [ ] **Step 3: Run the structure test**

Run:

```bash
node --test tests/options-structure.test.js
```

Expected: still FAIL because the new sections have not been added yet. There should be no CSS-loading error because jsdom does not need to fetch the stylesheet for this test.

---

### Task 3: Replace Options Markup With Status-First Workbench

**Files:**
- Modify: `chrome-extension/options.html`
- Test: `tests/options-structure.test.js`

- [ ] **Step 1: Replace the body markup**

In `chrome-extension/options.html`, replace everything inside `<body>` with:

```html
    <main class="settings-shell">
        <header class="settings-header">
            <div>
                <p class="settings-kicker">Chrome extension</p>
                <h1>Translater Settings</h1>
                <p class="settings-subtitle">
                    Configure translation, dictionary lookup, and quota behavior for web pages, PDFs, and Markdown files.
                </p>
            </div>
        </header>

        <section class="status-grid" aria-label="Configuration status">
            <article class="status-card">
                <div class="status-label">Translation</div>
                <div class="status-value">
                    <div id="translationStatusTitle" class="status-title">Checking</div>
                    <span id="translationStatusState" class="status-badge neutral">Loading</span>
                </div>
                <p id="translationStatusNote" class="status-note">DeepL configuration is being checked.</p>
            </article>

            <article class="status-card">
                <div class="status-label">Dictionary</div>
                <div class="status-value">
                    <div id="dictionaryStatusTitle" class="status-title">Checking</div>
                    <span id="dictionaryStatusState" class="status-badge neutral">Loading</span>
                </div>
                <p id="dictionaryStatusNote" class="status-note">Merriam-Webster configuration is being checked.</p>
            </article>

            <article class="status-card">
                <div class="status-label">Quota</div>
                <div class="status-value">
                    <div id="quotaStatusTitle" class="status-title">Checking</div>
                    <span id="quotaStatusState" class="status-badge neutral">Loading</span>
                </div>
                <p id="quotaStatusNote" class="status-note">DeepL usage is being checked.</p>
            </article>
        </section>

        <div id="currentEngine" hidden></div>

        <div class="settings-grid">
            <div class="settings-column">
                <section class="settings-panel" data-settings-section="translation" aria-labelledby="translationSettingsTitle">
                    <div class="panel-header">
                        <div>
                            <h2 id="translationSettingsTitle" class="panel-title">Translation</h2>
                            <p class="panel-desc">DeepL powers selected text translation and dictionary-definition translation.</p>
                        </div>
                    </div>

                    <div id="statusMessage" class="status hidden" role="status" aria-live="polite"></div>

                    <div class="field-group">
                        <label for="apiKey">DeepL API key</label>
                        <input type="password" id="apiKey" autocomplete="off" placeholder="Paste your DeepL API key">
                        <p class="field-help">
                            Selection translation requires DeepL. Requests are limited to 500 characters.
                            <a href="https://www.deepl.com/pro-api" target="_blank" rel="noreferrer">Get a DeepL API key</a>.
                        </p>
                    </div>

                    <div class="button-row">
                        <button class="btn btn-primary" id="saveBtn">Save key</button>
                        <button class="btn btn-secondary" id="copyDeepLKeyBtn">Copy key</button>
                        <button class="btn btn-secondary" id="clearBtn">Clear key</button>
                    </div>
                </section>

                <section class="settings-panel" data-settings-section="dictionary" aria-labelledby="dictionarySettingsTitle">
                    <div class="panel-header">
                        <div>
                            <h2 id="dictionarySettingsTitle" class="panel-title">Dictionary</h2>
                            <p class="panel-desc">Merriam-Webster Learners API powers word definitions, IPA, and dictionary audio.</p>
                        </div>
                    </div>

                    <div id="mwStatusMessage" class="status hidden" role="status" aria-live="polite"></div>

                    <div class="field-group">
                        <label for="mwApiKey">Merriam-Webster API key</label>
                        <input type="password" id="mwApiKey" autocomplete="off" placeholder="Paste your Learners Dictionary API key">
                        <p class="field-help">
                            Choose the Learners Dictionary API when registering.
                            <a href="https://dictionaryapi.com/register/index" target="_blank" rel="noreferrer">Get a Merriam-Webster key</a>.
                        </p>
                    </div>

                    <div class="button-row">
                        <button class="btn btn-primary" id="saveMWBtn">Save key</button>
                        <button class="btn btn-secondary" id="copyMWKeyBtn">Copy key</button>
                        <button class="btn btn-secondary" id="clearMWBtn">Clear key</button>
                    </div>
                </section>
            </div>

            <div class="settings-column">
                <section class="settings-panel" data-settings-section="behavior" aria-labelledby="behaviorSettingsTitle">
                    <div class="panel-header">
                        <div>
                            <h2 id="behaviorSettingsTitle" class="panel-title">Behavior</h2>
                            <p class="panel-desc">Choose how selected text opens translation actions.</p>
                        </div>
                    </div>

                    <div class="setting-row">
                        <div>
                            <div class="setting-title">Click T to translate</div>
                            <div class="setting-desc">Default quota-saving mode. Turn off for hover-to-translate.</div>
                        </div>
                        <label class="switch" for="clickTriggerToggle" aria-label="Click T to translate">
                            <input type="checkbox" id="clickTriggerToggle" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </section>

                <section class="settings-panel" data-settings-section="usage" aria-labelledby="usageSettingsTitle">
                    <div class="panel-header">
                        <div>
                            <h2 id="usageSettingsTitle" class="panel-title">Usage</h2>
                            <p class="panel-desc">Monitor quota and manage cached translations.</p>
                        </div>
                    </div>

                    <div class="setting-row">
                        <div>
                            <div class="setting-title">DeepL usage</div>
                            <div class="setting-desc" id="deepLUsageStatus">Usage not checked yet.</div>
                        </div>
                        <button class="btn btn-secondary" id="refreshUsageBtn">Refresh</button>
                    </div>

                    <div class="setting-row">
                        <div>
                            <div class="setting-title">Translation cache</div>
                            <div class="setting-desc" id="translationCacheStatus">Cache status not loaded.</div>
                        </div>
                        <button class="btn btn-secondary" id="clearTranslationCacheBtn">Clear cache</button>
                    </div>
                </section>
            </div>
        </div>
    </main>

    <div class="toast" id="toast" role="status" aria-live="polite">Settings saved</div>

    <script type="module" src="options.js"></script>
```

- [ ] **Step 2: Run the structure test**

Run:

```bash
node --test tests/options-structure.test.js
```

Expected: PASS for the structure test. If it fails, fix only markup and IDs before continuing.

- [ ] **Step 3: Run the existing copy-key test**

Run:

```bash
node --test tests/options-copy-key.test.js
```

Expected: It may fail only if toast text changed. If it fails because options.js cannot find new status card IDs, continue to Task 4 and rerun after JS updates.

---

### Task 4: Wire Top Status Cards In `options.js`

**Files:**
- Modify: `chrome-extension/options.js`
- Test: `tests/options-copy-key.test.js`

- [ ] **Step 1: Add status card element references**

After the existing `currentEngine` and `toast` constants, add:

```js
    const translationStatusTitle = document.getElementById('translationStatusTitle');
    const translationStatusState = document.getElementById('translationStatusState');
    const translationStatusNote = document.getElementById('translationStatusNote');
    const dictionaryStatusTitle = document.getElementById('dictionaryStatusTitle');
    const dictionaryStatusState = document.getElementById('dictionaryStatusState');
    const dictionaryStatusNote = document.getElementById('dictionaryStatusNote');
    const quotaStatusTitle = document.getElementById('quotaStatusTitle');
    const quotaStatusState = document.getElementById('quotaStatusState');
    const quotaStatusNote = document.getElementById('quotaStatusNote');
```

- [ ] **Step 2: Add a small status-card helper**

Before `loadCurrentStatus()`, add:

```js
    function updateStatusCard({ titleEl, stateEl, noteEl, title, badge, tone, note }) {
        if (titleEl) titleEl.textContent = title;
        if (stateEl) {
            stateEl.textContent = badge;
            stateEl.className = `status-badge ${tone}`;
        }
        if (noteEl) noteEl.textContent = note;
    }
```

- [ ] **Step 3: Replace `loadCurrentStatus()`**

Replace the existing `loadCurrentStatus()` function with:

```js
    async function loadCurrentStatus() {
        try {
            const response = await sendMessageSafe({ action: 'getTranslationEngine' });

            if (response.success && response.data && response.data.engine === 'DeepL') {
                currentEngine.textContent = 'DeepL';
                updateStatusCard({
                    titleEl: translationStatusTitle,
                    stateEl: translationStatusState,
                    noteEl: translationStatusNote,
                    title: 'DeepL ready',
                    badge: 'Ready',
                    tone: 'ready',
                    note: 'Selection translation and definition translation are enabled.'
                });
                showStatus('DeepL API configured. Translation is ready.', 'success');
                return;
            }

            currentEngine.textContent = 'Not configured';
            updateStatusCard({
                titleEl: translationStatusTitle,
                stateEl: translationStatusState,
                noteEl: translationStatusNote,
                title: 'DeepL missing',
                badge: 'Action needed',
                tone: 'warning',
                note: 'Add a DeepL API key to enable selected text translation.'
            });
            showStatus('Add a DeepL API key to enable translation.', 'warning');
        } catch (error) {
            console.error('Failed to load status:', error);
            updateStatusCard({
                titleEl: translationStatusTitle,
                stateEl: translationStatusState,
                noteEl: translationStatusNote,
                title: 'Status unavailable',
                badge: 'Unavailable',
                tone: 'neutral',
                note: 'Translation status could not be loaded.'
            });
        }
    }
```

- [ ] **Step 4: Replace `loadMWStatus()`**

Replace the existing `loadMWStatus()` function with:

```js
    async function loadMWStatus() {
        try {
            const response = await sendMessageSafe({ action: 'getMWApiKey' });

            if (response.success && response.data && response.data.apiKey) {
                updateStatusCard({
                    titleEl: dictionaryStatusTitle,
                    stateEl: dictionaryStatusState,
                    noteEl: dictionaryStatusNote,
                    title: 'Dictionary ready',
                    badge: 'Ready',
                    tone: 'ready',
                    note: 'Word lookup, IPA, and dictionary audio are enabled.'
                });
                showMWStatus('Merriam-Webster API configured. Dictionary is ready.', 'success');
                return;
            }

            updateStatusCard({
                titleEl: dictionaryStatusTitle,
                stateEl: dictionaryStatusState,
                noteEl: dictionaryStatusNote,
                title: 'Dictionary missing',
                badge: 'Action needed',
                tone: 'warning',
                note: 'Add a Learners Dictionary API key to enable dictionary lookup.'
            });
            showMWStatus('Add a Merriam-Webster API key to enable dictionary features.', 'warning');
        } catch (error) {
            console.error('Failed to load MW status:', error);
            updateStatusCard({
                titleEl: dictionaryStatusTitle,
                stateEl: dictionaryStatusState,
                noteEl: dictionaryStatusNote,
                title: 'Status unavailable',
                badge: 'Unavailable',
                tone: 'neutral',
                note: 'Dictionary status could not be loaded.'
            });
        }
    }
```

- [ ] **Step 5: Replace `loadDeepLUsage()`**

Replace the existing `loadDeepLUsage()` function with:

```js
    async function loadDeepLUsage() {
        deepLUsageStatus.textContent = 'Checking usage...';
        updateStatusCard({
            titleEl: quotaStatusTitle,
            stateEl: quotaStatusState,
            noteEl: quotaStatusNote,
            title: 'Checking usage',
            badge: 'Loading',
            tone: 'neutral',
            note: 'DeepL quota is being checked.'
        });

        try {
            const response = await sendMessageSafe({ action: 'getDeepLUsage' });
            if (!response || !response.success || !response.data) {
                const message = (response && response.error) || 'DeepL usage unavailable.';
                deepLUsageStatus.textContent = message;
                updateStatusCard({
                    titleEl: quotaStatusTitle,
                    stateEl: quotaStatusState,
                    noteEl: quotaStatusNote,
                    title: 'Usage unavailable',
                    badge: 'Unavailable',
                    tone: 'neutral',
                    note: message
                });
                return;
            }

            const { character_count, character_limit, remaining, quotaState } = response.data;
            if (Number.isFinite(character_count) && Number.isFinite(character_limit)) {
                const safeRemaining = Number.isFinite(remaining)
                    ? remaining
                    : Math.max(0, character_limit - character_count);
                const usageText = `${character_count} / ${character_limit} chars used. ${safeRemaining} remaining.`;
                const stateText = quotaState || 'ok';

                deepLUsageStatus.textContent = `${usageText} Quota state: ${stateText}.`;
                updateStatusCard({
                    titleEl: quotaStatusTitle,
                    stateEl: quotaStatusState,
                    noteEl: quotaStatusNote,
                    title: `${safeRemaining} chars left`,
                    badge: stateText === 'ok' ? 'Healthy' : stateText,
                    tone: stateText === 'ok' ? 'ready' : 'warning',
                    note: usageText
                });
            } else {
                deepLUsageStatus.textContent = 'Usage returned without character counts.';
                updateStatusCard({
                    titleEl: quotaStatusTitle,
                    stateEl: quotaStatusState,
                    noteEl: quotaStatusNote,
                    title: 'Usage loaded',
                    badge: 'Partial',
                    tone: 'info',
                    note: 'DeepL did not return character counts.'
                });
            }
        } catch (error) {
            const message = error.message || 'DeepL usage unavailable.';
            deepLUsageStatus.textContent = message;
            updateStatusCard({
                titleEl: quotaStatusTitle,
                stateEl: quotaStatusState,
                noteEl: quotaStatusNote,
                title: 'Usage unavailable',
                badge: 'Unavailable',
                tone: 'neutral',
                note: message
            });
        }
    }
```

- [ ] **Step 6: Remove emoji from toast/status strings touched in this file**

Update these strings:

```js
showToast('DeepL API key saved and verified');
showToast('DeepL API key cleared');
showToast('Merriam-Webster API key saved and verified');
showToast('Merriam-Webster API key cleared');
```

Keep existing copy-key toast strings because tests assert them:

```js
showToast(`${label} API key copied`);
```

- [ ] **Step 7: Run focused options tests**

Run:

```bash
node --test tests/options-structure.test.js tests/options-copy-key.test.js
```

Expected: PASS. If `tests/options-copy-key.test.js` fails because DOM loading needs a linked CSS stub, fix the test helper by keeping CSS fetches ignored; do not remove the stylesheet link.

- [ ] **Step 8: Commit the options page implementation**

```bash
git add chrome-extension/options.html chrome-extension/options.css chrome-extension/options.js tests/options-structure.test.js tests/options-copy-key.test.js
git commit -m "refactor(options): reorganize settings page"
```

---

### Task 5: Full Validation And Visual QA

**Files:**
- Verify: `chrome-extension/options.html`
- Verify: `chrome-extension/options.css`
- Verify: `chrome-extension/options.js`
- Verify: `tests/options-structure.test.js`
- Verify: `tests/options-copy-key.test.js`

- [ ] **Step 1: Run whitespace and full test checks**

Run:

```bash
git diff --check
npm test
```

Expected:

- `git diff --check` exits 0.
- `npm test` exits 0.

- [ ] **Step 2: Manually inspect the extension options page**

Open the extension options page in Chrome:

```text
chrome://extensions -> Translater -> Details -> Extension options
```

Check:

- The first viewport shows Translation, Dictionary, and Quota status cards.
- Translation and Dictionary panels are in the left column on desktop.
- Behavior and Usage panels are in the right column on desktop.
- At narrow widths, panels stack into one column.
- No large blue/purple full-page gradient remains.
- No emoji appear in headings or status labels.
- Button text fits at desktop and mobile widths.

- [ ] **Step 3: Manual behavior smoke**

Use test or throwaway keys where possible:

- Save an invalid short DeepL key and confirm inline warning.
- Copy an existing DeepL key when configured and confirm toast.
- Clear DeepL key and confirm Translation card changes to action-needed after reload/status refresh.
- Toggle click/hover mode and confirm toast.
- Refresh usage and confirm Quota card plus usage row update.
- Clear translation cache and confirm cache status refreshes.
- Repeat copy/clear checks for Merriam-Webster.

- [ ] **Step 4: Commit validation-only fixes if needed**

If visual QA or tests require small fixes, commit them separately:

```bash
git add chrome-extension/options.html chrome-extension/options.css chrome-extension/options.js tests/options-structure.test.js tests/options-copy-key.test.js
git commit -m "fix(options): polish settings page states"
```

If no fixes are needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Status-first workbench is covered by Tasks 2, 3, and 4.
- API key sections are covered by Task 3 and existing copy-key behavior in Task 4.
- Behavior and Usage panels are covered by Task 3.
- Static table removal is covered by Task 1.
- Visual simplification is covered by Task 2.
- Stable DOM IDs are covered by Task 1.
- Existing state flow is preserved and extended in Task 4.
- Automated and manual validation are covered by Task 5.

Implementation boundaries:

- No storage key changes.
- No background message contract changes.
- No content/PDF/Markdown reader changes.
- No Android changes.

Risk notes:

- `options.html` currently owns inline styles. Extracting to `options.css` is low risk for an extension options page, but visual QA should confirm Chrome loads the stylesheet.
- `currentEngine` is preserved as a hidden element for compatibility with existing JS expectations; new visible status is handled by dedicated status-card IDs.
