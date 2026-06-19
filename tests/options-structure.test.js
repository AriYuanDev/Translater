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

        const oldBehaviorTableExists = Array.from(document.querySelectorAll('table'))
            .some(table => table.textContent.includes('Selection translation')
                && table.textContent.includes('500 chars/request')
                && table.textContent.includes('Dictionary definitions'));

        assert.equal(oldBehaviorTableExists, false);
        assert.equal(document.body.textContent.includes('DeepL Behavior'), false);
    } finally {
        teardownDom(dom);
    }
});
