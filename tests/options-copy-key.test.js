import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupDom, teardownDom } from './helpers/dom-test-utils.js';

function createOptionsChromeStub({ syncData = {} } = {}) {
    function pick(keys) {
        if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, syncData[key]]));
        }
        if (typeof keys === 'string') {
            return { [keys]: syncData[keys] };
        }
        return { ...syncData };
    }

    globalThis.chrome = {
        runtime: {
            id: 'test-extension',
            async sendMessage(message) {
                const responses = {
                    getTranslationEngine: { success: true, data: { engine: 'DeepL' } },
                    getMWApiKey: { success: true, data: { apiKey: 'Configured' } },
                    getTranslationTriggerMode: { success: true, data: { mode: 'click' } },
                    getDeepLUsage: {
                        success: true,
                        data: {
                            character_count: 10,
                            character_limit: 500000,
                            remaining: 499990,
                            quotaState: 'ok'
                        }
                    },
                    getTranslationCacheStats: {
                        success: true,
                        data: {
                            entries: 0,
                            maxEntries: 2000,
                            ttlDays: 90
                        }
                    }
                };
                return responses[message.action] || { success: true, data: null };
            }
        },
        storage: {
            sync: {
                get(keys, callback) {
                    const result = pick(keys);
                    if (callback) {
                        callback(result);
                        return undefined;
                    }
                    return Promise.resolve(result);
                }
            }
        }
    };
}

async function loadOptionsPage() {
    const html = await readFile(new URL('../chrome-extension/options.html', import.meta.url), 'utf8');
    const dom = setupDom(html, 'chrome-extension://test/options.html');
    const clipboardWrites = [];

    createOptionsChromeStub({
        syncData: {
            deepLApiKey: 'deepl-secret:fx',
            mwApiKey: 'mw-secret'
        }
    });

    Object.defineProperty(navigator, 'clipboard', {
        value: {
            writeText(text) {
                clipboardWrites.push(text);
                return Promise.resolve();
            }
        },
        configurable: true
    });

    await import(`../chrome-extension/options.js?test=${Date.now()}-${Math.random()}`);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 0));

    return { dom, clipboardWrites };
}

test('options page copies saved API keys to the clipboard', async () => {
    const { dom, clipboardWrites } = await loadOptionsPage();

    try {
        const copyDeepLBtn = document.getElementById('copyDeepLKeyBtn');
        const copyMWBtn = document.getElementById('copyMWKeyBtn');

        assert.ok(copyDeepLBtn);
        assert.ok(copyMWBtn);

        copyDeepLBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(clipboardWrites.at(-1), 'deepl-secret:fx');
        assert.equal(document.getElementById('toast').textContent, 'DeepL API key copied');

        copyMWBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(clipboardWrites.at(-1), 'mw-secret');
        assert.equal(document.getElementById('toast').textContent, 'Merriam-Webster API key copied');
    } finally {
        teardownDom(dom);
    }
});
