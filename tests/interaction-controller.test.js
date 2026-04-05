import test from 'node:test';
import assert from 'node:assert/strict';

import {
    handleSelectionTranslation,
    handleWordLookupInteraction
} from '../chrome-extension/interaction-controller.js';
import {
    __resetUiStateForTests,
    __setStylesLoadedForTests,
    getShadowRoot
} from '../chrome-extension/utils.js';
import {
    createDeferred,
    installAudioStub,
    installChromeStub,
    installSpeechSynthesisStub,
    setupDom,
    teardownDom
} from './helpers/dom-test-utils.js';

function buildDictionaryResult(word) {
    return {
        word,
        phonetic: '/test/',
        phonetics: [],
        meanings: [
            {
                partOfSpeech: 'noun',
                definitions: [
                    { definition: `${word} definition` }
                ]
            }
        ]
    };
}

function getShadowText() {
    return getShadowRoot()?.textContent || '';
}

let dom;

test.beforeEach(() => {
    dom = setupDom();
    installSpeechSynthesisStub();
    installAudioStub();
    __resetUiStateForTests();
    __setStylesLoadedForTests();
});

test.afterEach(() => {
    __resetUiStateForTests();
    teardownDom(dom);
});

test('handleWordLookupInteraction renders loading state and then dictionary result', async () => {
    const dictionaryRequest = createDeferred();
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') return dictionaryRequest.promise;
        if (message.action === 'translate') return { success: true, data: { translated: '词义' } };
        throw new Error(`Unexpected action ${message.action}`);
    });

    const pendingInteraction = handleWordLookupInteraction({
        word: 'support',
        x: 120,
        y: 180
    });

    await Promise.resolve();
    assert.match(getShadowText(), /Searching\.\.\./);

    dictionaryRequest.resolve({ success: true, data: buildDictionaryResult('support') });
    await pendingInteraction;

    assert.match(getShadowText(), /support definition/);
    assert.match(getShadowText(), /noun/);
});

test('handleWordLookupInteraction falls back to translation when dictionary returns no data', async () => {
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return { success: true, data: null };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '支持' } };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'support',
        x: 120,
        y: 180
    });

    assert.match(getShadowText(), /支持/);
});

test('handleWordLookupInteraction shows an error when dictionary and translation both fail', async () => {
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return { success: true, data: null };
        }
        if (message.action === 'translate') {
            return { success: false, error: 'Translation failed' };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'support',
        x: 120,
        y: 180
    });

    assert.match(getShadowText(), /Translation failed/);
});

test('handleWordLookupInteraction ignores stale async responses after a newer popup replaces the old one', async () => {
    const firstDictionaryRequest = createDeferred();
    const secondDictionaryRequest = createDeferred();
    let requestCount = 0;

    installChromeStub(message => {
        if (message.action === 'translate') {
            return { success: true, data: { translated: '词义' } };
        }
        if (message.action !== 'fetchDictionary') {
            throw new Error(`Unexpected action ${message.action}`);
        }
        requestCount += 1;
        return requestCount === 1 ? firstDictionaryRequest.promise : secondDictionaryRequest.promise;
    });

    const firstInteraction = handleWordLookupInteraction({
        word: 'first',
        x: 100,
        y: 100
    });
    const secondInteraction = handleWordLookupInteraction({
        word: 'second',
        x: 200,
        y: 200
    });

    secondDictionaryRequest.resolve({ success: true, data: buildDictionaryResult('second') });
    await secondInteraction;

    firstDictionaryRequest.resolve({ success: true, data: buildDictionaryResult('first') });
    await firstInteraction;

    assert.match(getShadowText(), /second definition/);
    assert.doesNotMatch(getShadowText(), /first definition/);
});

test('handleSelectionTranslation renders loading state and then success result', async () => {
    const translationRequest = createDeferred();
    installChromeStub(message => {
        if (message.action === 'translate') return translationRequest.promise;
        throw new Error(`Unexpected action ${message.action}`);
    });

    const pendingInteraction = handleSelectionTranslation({
        text: 'Hello world',
        x: 220,
        y: 180
    });

    await Promise.resolve();
    assert.match(getShadowText(), /Translating\.\.\./);

    translationRequest.resolve({ success: true, data: { translated: '你好，世界' } });
    await pendingInteraction;

    assert.match(getShadowText(), /你好，世界/);
});

test('handleSelectionTranslation shows an error when translation fails', async () => {
    installChromeStub(message => {
        if (message.action === 'translate') {
            return { success: false, error: 'Translation unavailable' };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleSelectionTranslation({
        text: 'Hello world',
        x: 220,
        y: 180
    });

    assert.match(getShadowText(), /Translation unavailable/);
});
