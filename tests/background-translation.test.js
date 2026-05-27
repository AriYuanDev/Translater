import test from 'node:test';
import assert from 'node:assert/strict';

function createStorageArea(initialData = {}) {
    const data = { ...initialData };

    function pick(keys) {
        if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, data[key]]));
        }
        if (typeof keys === 'string') {
            return { [keys]: data[keys] };
        }
        if (keys && typeof keys === 'object') {
            return Object.fromEntries(
                Object.entries(keys).map(([key, fallback]) => [key, data[key] ?? fallback])
            );
        }
        return { ...data };
    }

    return {
        data,
        get(keys, callback) {
            const result = pick(keys);
            if (callback) {
                callback(result);
                return undefined;
            }
            return Promise.resolve(result);
        },
        set(items, callback) {
            Object.assign(data, items);
            if (callback) callback();
            return Promise.resolve();
        },
        remove(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            list.forEach(key => delete data[key]);
            if (callback) callback();
            return Promise.resolve();
        }
    };
}

function installBackgroundChromeStub({ syncData = {}, localData = {} } = {}) {
    let messageHandler = null;
    const chrome = {
        runtime: {
            onMessage: {
                addListener(handler) {
                    messageHandler = handler;
                }
            },
            onInstalled: {
                addListener() {}
            },
            getURL(path) {
                return `chrome-extension://test/${path}`;
            }
        },
        storage: {
            sync: createStorageArea(syncData),
            local: createStorageArea(localData),
            onChanged: {
                addListener() {}
            }
        },
        webNavigation: {
            onBeforeNavigate: {
                addListener() {}
            }
        },
        tabs: {
            update() {}
        }
    };

    globalThis.chrome = chrome;
    return {
        chrome,
        getMessageHandler() {
            return messageHandler;
        }
    };
}

async function loadBackground() {
    await import(`../chrome-extension/background.js?test=${Date.now()}-${Math.random()}`);
    await Promise.resolve();
}

function sendBackgroundMessage(handler, request) {
    return new Promise(resolve => {
        handler(request, {}, resolve);
    });
}

test.afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.fetch;
});

test('translate action rejects text over 500 characters before fetching DeepL', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { deepLApiKey: 'sample-key:fx' }
    });
    let fetchCalls = 0;
    globalThis.fetch = async () => {
        fetchCalls += 1;
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
    };

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'translate',
        text: 'a'.repeat(501)
    });

    assert.equal(response.success, false);
    assert.equal(response.errorCode, 'TEXT_TOO_LONG');
    assert.equal(fetchCalls, 0);
});

test('translate action caches successful DeepL responses in local storage', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { deepLApiKey: 'sample-key:fx' }
    });
    let fetchCalls = 0;
    globalThis.fetch = async () => {
        fetchCalls += 1;
        return {
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ({
                translations: [{
                    text: '你好',
                    detected_source_language: 'EN'
                }]
            })
        };
    };

    await loadBackground();
    const handler = getMessageHandler();
    const first = await sendBackgroundMessage(handler, {
        action: 'translate',
        text: 'Hello',
        targetLang: 'zh-CN'
    });
    const second = await sendBackgroundMessage(handler, {
        action: 'translate',
        text: 'Hello',
        targetLang: 'zh-CN'
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.data.cached, true);
    assert.equal(second.data.translated, '你好');
    assert.equal(fetchCalls, 1);
});

test('DeepL quota errors trip a local breaker before later translate calls fetch', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { deepLApiKey: 'sample-key:fx' }
    });
    let fetchCalls = 0;
    globalThis.fetch = async () => {
        fetchCalls += 1;
        return {
            ok: false,
            status: 456,
            headers: { get: () => 'application/json' },
            json: async () => ({ message: 'Quota exceeded' })
        };
    };

    await loadBackground();
    const handler = getMessageHandler();
    const first = await sendBackgroundMessage(handler, {
        action: 'translate',
        text: 'Hello'
    });
    const second = await sendBackgroundMessage(handler, {
        action: 'translate',
        text: 'Another sentence'
    });

    assert.equal(first.success, false);
    assert.equal(first.errorCode, 'QUOTA_EXCEEDED');
    assert.equal(second.success, false);
    assert.equal(second.errorCode, 'QUOTA_EXCEEDED');
    assert.equal(fetchCalls, 1);
});

test('translation trigger mode defaults to click and can be changed to hover', async () => {
    const { getMessageHandler } = installBackgroundChromeStub();

    await loadBackground();
    const handler = getMessageHandler();
    const initial = await sendBackgroundMessage(handler, { action: 'getTranslationTriggerMode' });
    const saved = await sendBackgroundMessage(handler, {
        action: 'setTranslationTriggerMode',
        mode: 'hover'
    });
    const updated = await sendBackgroundMessage(handler, { action: 'getTranslationTriggerMode' });

    assert.deepEqual(initial, { success: true, data: { mode: 'click' } });
    assert.deepEqual(saved, { success: true, data: true });
    assert.deepEqual(updated, { success: true, data: { mode: 'hover' } });
});
