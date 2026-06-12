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
    const ttsCalls = [];
    let ttsStopCalls = 0;
    const chrome = {
        runtime: {
            lastError: null,
            onMessage: {
                addListener(handler) {
                    messageHandler = handler;
                }
            },
            onInstalled: {
                handler: null,
                addListener(handler) {
                    this.handler = handler;
                }
            },
            getURL(path) {
                return `chrome-extension://test/${path}`;
            },
            getManifest() {
                return { version: '1.5.5' };
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
        },
        tts: {
            stop() {
                ttsStopCalls += 1;
            },
            getVoices(callback) {
                callback([{ voiceName: 'Samantha', lang: 'en-US', remote: false }]);
            },
            speak(text, options, callback) {
                ttsCalls.push({ text, options });
                if (callback) callback();
            }
        }
    };

    globalThis.chrome = chrome;
    return {
        chrome,
        ttsCalls,
        getTtsStopCalls() {
            return ttsStopCalls;
        },
        getInstalledHandler() {
            return chrome.runtime.onInstalled.handler;
        },
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

test('fetchDictionary reads IPA from Learners alternate pronunciations', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' }
    });

    globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ([
            {
                meta: {
                    id: 'extreme',
                    stems: ['extreme', 'extremes']
                },
                hwi: {
                    hw: 'ex*treme',
                    altprs: {
                        pr: {
                            ipa: 'ɪkˈstriːm',
                            sound: { audio: 'extrem01' }
                        }
                    }
                },
                fl: 'adjective',
                shortdef: ['very great in degree']
            }
        ])
    });

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extremes'
    });

    assert.equal(response.success, true);
    assert.equal(response.data.word, 'extreme');
    assert.equal(response.data.phonetic, '/ɪkˈstriːm/');
    assert.deepEqual(response.data.phonetics, [{
        text: '/ɪkˈstriːm/',
        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extrem01.mp3',
        source: 'headword',
        sourceWord: 'extreme'
    }]);
});

test('fetchDictionary uses pronunciation from another same-headword entry', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' }
    });

    globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ([
            {
                meta: { id: 'extreme:1' },
                hwi: { hw: 'ex*treme' },
                fl: 'adjective',
                shortdef: ['very great in degree']
            },
            {
                meta: { id: 'extreme:2' },
                hwi: {
                    hw: 'ex*treme',
                    prs: [{
                        ipa: 'ɪkˈstriːm',
                        sound: { audio: 'extrem01' }
                    }]
                },
                fl: 'noun',
                shortdef: ['something extreme']
            }
        ])
    });

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extreme'
    });

    assert.equal(response.success, true);
    assert.equal(response.data.phonetic, '/ɪkˈstriːm/');
});

test('fetchDictionary prefers matching inflection pronunciation over headword pronunciation', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' }
    });

    globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ([
            {
                meta: {
                    id: 'extreme',
                    stems: ['extreme', 'extremes']
                },
                hwi: {
                    hw: 'ex*treme',
                    prs: [{
                        ipa: 'ɪkˈstriːm',
                        sound: { audio: 'extrem01' }
                    }]
                },
                ins: [{
                    if: 'extremes',
                    prs: [{
                        ipa: 'ɪkˈstriːmz',
                        sound: { audio: 'extremes01' }
                    }]
                }],
                fl: 'noun',
                shortdef: ['an extreme amount or degree']
            }
        ])
    });

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extremes'
    });

    assert.equal(response.success, true);
    assert.equal(response.data.phonetic, '/ɪkˈstriːmz/');
    assert.deepEqual(response.data.phonetics[0], {
        text: '/ɪkˈstriːmz/',
        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extremes01.mp3',
        source: 'inflection',
        sourceWord: 'extremes'
    });
});

test('fetchDictionary prefers matching inflection pronunciation from later same-headword entries', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' }
    });

    globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ([
            {
                meta: {
                    id: 'extreme:1',
                    stems: ['extreme', 'extremes']
                },
                hwi: {
                    hw: 'ex*treme',
                    prs: [{
                        ipa: 'ɪkˈstriːm',
                        sound: { audio: 'extrem01' }
                    }]
                },
                fl: 'adjective',
                shortdef: ['very great in degree']
            },
            {
                meta: {
                    id: 'extreme:2',
                    stems: ['extreme', 'extremes']
                },
                hwi: { hw: 'ex*treme' },
                ins: [{
                    if: 'extremes',
                    prs: [{
                        ipa: 'ɪkˈstriːmz',
                        sound: { audio: 'extremes01' }
                    }]
                }],
                fl: 'noun',
                shortdef: ['an extreme amount or degree']
            }
        ])
    });

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extremes'
    });

    assert.equal(response.success, true);
    assert.equal(response.data.phonetic, '/ɪkˈstriːmz/');
    assert.deepEqual(response.data.phonetics[0], {
        text: '/ɪkˈstriːmz/',
        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extremes01.mp3',
        source: 'inflection',
        sourceWord: 'extremes'
    });
});

test('fetchDictionary refreshes old cached dictionary entries before returning phonetics', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' },
        localData: {
            dictionaryCache: [
                [
                    'extremes',
                    {
                        timestamp: Date.now(),
                        data: {
                            word: 'extreme',
                            searchedWord: 'extremes',
                            phonetic: '',
                            phonetics: [],
                            meanings: [{
                                partOfSpeech: 'adjective',
                                definitions: [{ definition: 'very great in degree' }]
                            }]
                        }
                    }
                ]
            ]
        }
    });
    let fetchCalls = 0;

    globalThis.fetch = async () => {
        fetchCalls += 1;
        return {
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ([
                {
                    meta: {
                        id: 'extreme',
                        stems: ['extreme', 'extremes']
                    },
                    hwi: {
                        hw: 'ex*treme',
                        altprs: {
                            pr: {
                                ipa: 'ɪkˈstriːm',
                                sound: { audio: 'extrem01' }
                            }
                        }
                    },
                    fl: 'adjective',
                    shortdef: ['very great in degree']
                }
            ])
        };
    };

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extremes'
    });

    assert.equal(response.success, true);
    assert.equal(fetchCalls, 1);
    assert.equal(response.data.phonetic, '/ɪkˈstriːm/');
});

test('dictionary cache is cleared when the extension updates', async () => {
    const { chrome, getInstalledHandler } = installBackgroundChromeStub({
        localData: {
            dictionaryCache: [
                [
                    'extremes',
                    {
                        schemaVersion: 7,
                        timestamp: Date.now(),
                        data: { word: 'extreme', phonetic: '', phonetics: [] }
                    }
                ]
            ]
        }
    });

    await loadBackground();
    getInstalledHandler()({ reason: 'update' });

    assert.equal(chrome.storage.local.data.dictionaryCache, undefined);
});

test('fetchDictionary refreshes schema v2 stem cache entries without phonetics', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' },
        localData: {
            dictionaryCache: [
                [
                    'extremes',
                    {
                        schemaVersion: 2,
                        timestamp: Date.now(),
                        data: {
                            word: 'extreme',
                            searchedWord: 'extremes',
                            phonetic: '',
                            phonetics: [],
                            meanings: [{
                                partOfSpeech: 'noun',
                                definitions: [{ definition: 'either one of two opposite conditions' }]
                            }]
                        }
                    }
                ]
            ]
        }
    });
    const lookedUpWords = [];

    globalThis.fetch = async resource => {
        const lookedUpWord = decodeURIComponent(new URL(resource).pathname.split('/').pop());
        lookedUpWords.push(lookedUpWord);

        if (lookedUpWord === 'extremes') {
            return {
                ok: true,
                headers: { get: () => 'application/json' },
                json: async () => ([{
                    meta: { id: 'extreme', stems: ['extreme', 'extremes'] },
                    hwi: { hw: 'ex*treme' },
                    fl: 'noun',
                    shortdef: ['either one of two opposite conditions']
                }])
            };
        }

        return {
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ([{
                meta: { id: 'extreme' },
                hwi: {
                    hw: 'ex*treme',
                    prs: [{
                        ipa: 'ɪkˈstriːm',
                        sound: { audio: 'extrem01' }
                    }]
                },
                fl: 'adjective',
                shortdef: ['very great in degree']
            }])
        };
    };

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extremes'
    });

    assert.equal(response.success, true);
    assert.deepEqual(lookedUpWords, ['extremes', 'extreme']);
    assert.equal(response.data.phonetic, '/ɪkˈstriːm/');
});

test('fetchDictionary follows a resolved headword when a stem response has no phonetics', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' }
    });
    const lookedUpWords = [];

    globalThis.fetch = async resource => {
        const lookedUpWord = decodeURIComponent(new URL(resource).pathname.split('/').pop());
        lookedUpWords.push(lookedUpWord);

        if (lookedUpWord === 'extremes') {
            return {
                ok: true,
                headers: { get: () => 'application/json' },
                json: async () => ([
                    {
                        meta: {
                            id: 'extreme',
                            stems: ['extreme', 'extremes']
                        },
                        hwi: { hw: 'ex*treme' },
                        fl: 'adjective',
                        shortdef: ['very great in degree']
                    }
                ])
            };
        }

        return {
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ([
                {
                    meta: { id: 'extreme' },
                    hwi: {
                        hw: 'ex*treme',
                        prs: [{
                            ipa: 'ɪkˈstriːm',
                            sound: { audio: 'extrem01' }
                        }]
                    },
                    fl: 'adjective',
                    shortdef: ['very great in degree']
                }
            ])
        };
    };

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'extremes'
    });

    assert.equal(response.success, true);
    assert.deepEqual(lookedUpWords, ['extremes', 'extreme']);
    assert.equal(response.data.word, 'extreme');
    assert.equal(response.data.searchedWord, 'extremes');
    assert.equal(response.data.phonetic, '/ɪkˈstriːm/');
});

test('fetchDictionary falls back to likely base words when an exact derived entry has no phonetics', async () => {
    const { getMessageHandler } = installBackgroundChromeStub({
        syncData: { mwApiKey: 'mw-key' }
    });
    const lookedUpWords = [];

    globalThis.fetch = async resource => {
        const lookedUpWord = decodeURIComponent(new URL(resource).pathname.split('/').pop());
        lookedUpWords.push(lookedUpWord);

        if (lookedUpWord === 'prolonged') {
            return {
                ok: true,
                headers: { get: () => 'application/json' },
                json: async () => ([
                    {
                        meta: {
                            id: 'prolonged',
                            stems: ['prolonged']
                        },
                        hwi: { hw: 'pro*longed' },
                        fl: 'adjective',
                        shortdef: ['lasting longer than usual or expected']
                    }
                ])
            };
        }

        return {
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ([
                {
                    meta: {
                        id: 'prolong',
                        stems: ['prolong', 'prolonged', 'prolonging', 'prolongs']
                    },
                    hwi: {
                        hw: 'pro*long',
                        prs: [{
                            ipa: 'prəˈlɔːŋ',
                            sound: { audio: 'prolon01' }
                        }]
                    },
                    ins: [{
                        if: 'pro*longed'
                    }],
                    fl: 'verb',
                    shortdef: ['to lengthen in time']
                }
            ])
        };
    };

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'fetchDictionary',
        word: 'prolonged'
    });

    assert.equal(response.success, true);
    assert.deepEqual(lookedUpWords, ['prolonged', 'prolong']);
    assert.equal(response.data.word, 'prolonged');
    assert.equal(response.data.phonetic, '/prəˈlɔːŋd/');
    assert.deepEqual(response.data.phonetics[0], {
        text: '/prəˈlɔːŋd/',
        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/p/prolon01.mp3',
        source: 'derived-inflection',
        sourceWord: 'prolonged',
        audioSourceWord: 'prolong'
    });
});

test('speakText action uses Chrome TTS from the background context', async () => {
    const { getMessageHandler, ttsCalls, getTtsStopCalls } = installBackgroundChromeStub();

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'speakText',
        text: 'Hello from ChatGPT',
        options: {
            lang: 'en-US',
            rate: 0.9,
            volume: 0.7
        }
    });

    assert.equal(response.success, true);
    assert.equal(response.data.provider, 'chrome.tts');
    assert.equal(response.data.voiceName, 'Samantha');
    assert.equal(getTtsStopCalls(), 1);
    assert.deepEqual(ttsCalls, [{
        text: 'Hello from ChatGPT',
        options: {
            lang: 'en-US',
            rate: 0.9,
            pitch: 1,
            volume: 0.7,
            enqueue: false,
            voiceName: 'Samantha'
        }
    }]);
});

test('speakText action avoids extension-id-looking TTS voices when a system voice exists', async () => {
    const { chrome, getMessageHandler, ttsCalls } = installBackgroundChromeStub();
    chrome.tts.getVoices = callback => {
        callback([
            {
                voiceName: 'ppnfahcipommelgaapjalhooaeeblmeg',
                lang: 'en-US',
                extensionId: 'ppnfahcipommelgaapjalhooaeeblmeg'
            },
            { voiceName: 'Alex', lang: 'en-US', remote: false }
        ]);
    };

    await loadBackground();
    const response = await sendBackgroundMessage(getMessageHandler(), {
        action: 'speakText',
        text: 'approval'
    });

    assert.equal(response.success, true);
    assert.equal(response.data.voiceName, 'Alex');
    assert.equal(ttsCalls[0].options.voiceName, 'Alex');
});
