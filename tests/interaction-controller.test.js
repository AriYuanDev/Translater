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

test('handleWordLookupInteraction does not auto-translate definitions and translates one definition on click', async () => {
    let translateCalls = 0;
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return { success: true, data: buildDictionaryResult('support') };
        }
        if (message.action === 'translate') {
            translateCalls += 1;
            return { success: true, data: { translated: '支持释义' } };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'support',
        x: 120,
        y: 180
    });

    assert.equal(translateCalls, 0);
    assert.match(getShadowText(), /support definition/);
    assert.doesNotMatch(getShadowText(), /支持释义/);

    const translateButton = getShadowRoot().querySelector('.translator-translate-definition-btn');
    assert.ok(translateButton);
    translateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(translateCalls, 1);
    assert.match(getShadowText(), /支持释义/);
});

test('handleWordLookupInteraction waits for a speaker click before playing dictionary audio', async () => {
    const AudioStub = installAudioStub();
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('support'),
                    phonetics: [{ audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/s/support.mp3' }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '支持释义' } };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'support',
        x: 120,
        y: 180
    });

    assert.deepEqual(AudioStub.playCalls, []);

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.ok(speakButton);
    speakButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(AudioStub.playCalls, [
        'https://media.merriam-webster.com/audio/prons/en/us/mp3/s/support.mp3'
    ]);
});

test('handleWordLookupInteraction speaks the selected form when morphed data only has headword audio', async () => {
    const AudioStub = installAudioStub();
    const speechSynthesisStub = installSpeechSynthesisStub();
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('extreme'),
                    phonetics: [{
                        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extrem01.mp3',
                        source: 'headword',
                        sourceWord: 'extreme'
                    }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '释义' } };
        }
        if (message.action === 'speakText') {
            return { success: false };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'extremes',
        x: 120,
        y: 180
    });

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.ok(speakButton);
    speakButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(AudioStub.playCalls, []);
    assert.equal(speechSynthesisStub.speakCalls.at(-1).text, 'extremes');
});

test('handleWordLookupInteraction falls back to headword audio when selected-form TTS is unavailable', async () => {
    const AudioStub = installAudioStub();
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
    Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        configurable: true
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: undefined,
        configurable: true
    });

    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('extreme'),
                    phonetics: [{
                        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extrem01.mp3',
                        source: 'headword',
                        sourceWord: 'extreme'
                    }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '释义' } };
        }
        if (message.action === 'speakText') {
            return { success: false, errorCode: 'TTS_UNAVAILABLE' };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'extremes',
        x: 120,
        y: 180
    });

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.ok(speakButton);
    speakButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(AudioStub.playCalls, [
        'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extrem01.mp3'
    ]);
});

test('handleWordLookupInteraction treats derived inflection audio as headword audio', async () => {
    const AudioStub = installAudioStub();
    const speechSynthesisStub = installSpeechSynthesisStub();
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('prolonged'),
                    phonetics: [{
                        text: '/prəˈlɔːŋd/',
                        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/p/prolon01.mp3',
                        source: 'derived-inflection',
                        sourceWord: 'prolonged',
                        audioSourceWord: 'prolong'
                    }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '释义' } };
        }
        if (message.action === 'speakText') {
            return { success: false };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'prolonged',
        x: 120,
        y: 180
    });

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.ok(speakButton);
    speakButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(AudioStub.playCalls, []);
    assert.equal(speechSynthesisStub.speakCalls.at(-1).text, 'prolonged');
});

test('handleWordLookupInteraction labels IPA and audio source ownership', async () => {
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('prolonged'),
                    phonetic: '/prəˈlɔːŋd/',
                    phonetics: [{
                        text: '/prəˈlɔːŋd/',
                        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/p/prolon01.mp3',
                        source: 'derived-inflection',
                        sourceWord: 'prolonged',
                        audioSourceWord: 'prolong'
                    }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '释义' } };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'prolonged',
        x: 120,
        y: 180
    });

    const ownership = getShadowRoot().querySelector('.translator-pronunciation-ownership');
    assert.ok(ownership);
    assert.match(ownership.textContent, /IPA shown:\s*prolonged\s*\(inferred\)/);
    assert.match(ownership.textContent, /Audio file:\s*prolong/);
    assert.match(ownership.textContent, /Button plays:\s*prolonged\s*\(TTS first\)/);

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.equal(speakButton.getAttribute('title'), 'Play: prolonged via TTS; fallback audio file: prolong');
});

test('handleWordLookupInteraction keeps selected inflection as the header word', async () => {
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('year'),
                    phonetic: '/ˈjiə/',
                    phonetics: [{
                        text: '/ˈjiə/',
                        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/y/year0001.mp3',
                        source: 'headword',
                        sourceWord: 'year'
                    }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '释义' } };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'years',
        x: 120,
        y: 180
    });

    assert.equal(getShadowRoot().querySelector('.translator-word')?.textContent, 'years');
    assert.match(getShadowRoot().querySelector('.translator-entry-word')?.textContent || '', /Dictionary entry:\s*year/);
    assert.doesNotMatch(getShadowText(), /\(from years\)/);

    const ownership = getShadowRoot().querySelector('.translator-pronunciation-ownership');
    assert.ok(ownership);
    assert.match(ownership.textContent, /IPA shown:\s*year/);
    assert.match(ownership.textContent, /Audio file:\s*year/);
    assert.match(ownership.textContent, /Button plays:\s*years\s*\(TTS first\)/);

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.equal(speakButton.getAttribute('title'), 'Play: years via TTS; fallback audio file: year');
});

test('handleWordLookupInteraction plays dictionary audio when it belongs to the selected inflection', async () => {
    const AudioStub = installAudioStub();
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    ...buildDictionaryResult('extreme'),
                    phonetics: [{
                        audio: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extremes01.mp3',
                        source: 'inflection',
                        sourceWord: 'extremes'
                    }]
                }
            };
        }
        if (message.action === 'translate') {
            return { success: true, data: { translated: '释义' } };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleWordLookupInteraction({
        word: 'extremes',
        x: 120,
        y: 180
    });

    const speakButton = getShadowRoot().querySelector('.translator-speak-btn');
    assert.ok(speakButton);
    speakButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(AudioStub.playCalls, [
        'https://media.merriam-webster.com/audio/prons/en/us/mp3/e/extremes01.mp3'
    ]);
});

test('handleSelectionTranslation surfaces long text guard errors without generic copy', async () => {
    installChromeStub(message => {
        if (message.action === 'translate') {
            return {
                success: false,
                errorCode: 'TEXT_TOO_LONG',
                error: 'Selected text exceeds 500 characters. Please shorten the selection.'
            };
        }
        throw new Error(`Unexpected action ${message.action}`);
    });

    await handleSelectionTranslation({
        text: 'a'.repeat(501),
        x: 220,
        y: 180
    });

    assert.match(getShadowText(), /500 characters/);
    assert.ok(getShadowRoot().querySelector('.translator-sentence-content .translator-error'));
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

test('handleWordLookupInteraction falls back to translation when dictionary data has no definitions', async () => {
    installChromeStub(message => {
        if (message.action === 'fetchDictionary') {
            return {
                success: true,
                data: {
                    word: 'support',
                    meanings: [{ partOfSpeech: 'noun' }]
                }
            };
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
    assert.ok(getShadowRoot().querySelector('.translator-sentence-content .translator-error'));
});
