import {
    calculatePopupPosition,
    sendMessageSafe,
    speakText,
    isContextValid,
    ensureShadowRoot,
    createCloseButton,
    createSpeakButton,
    removeAllPopups,
    getCurrentPopup,
    setCurrentPopup,
    findBestAudioUrl,
    createDefinitionPair,
    showSentencePopup
} from './utils.js';

const MAX_TRANSLATION_TEXT_CHARS = 500;

function replaceSentenceContent(content, className, message) {
    content.innerHTML = '';
    const node = document.createElement('div');
    node.className = className;
    node.textContent = message;
    content.appendChild(node);
}

function createWordPopup(word, x, y, popupWidth, popupHeight) {
    const popup = document.createElement('div');
    popup.className = 'translator-popup';
    popup.style.pointerEvents = 'auto';

    const content = document.createElement('div');
    content.className = 'translator-popup-content';

    const header = document.createElement('div');
    header.className = 'translator-word-header';

    const wordInfo = document.createElement('div');
    wordInfo.className = 'translator-word-info';
    const wordSpan = document.createElement('span');
    wordSpan.className = 'translator-word';
    wordSpan.textContent = word;
    wordInfo.appendChild(wordSpan);

    header.appendChild(wordInfo);
    header.appendChild(createSpeakButton(() => speakText(word)));

    const meanings = document.createElement('div');
    meanings.className = 'translator-meanings';
    const loading = document.createElement('div');
    loading.className = 'translator-loading';
    loading.textContent = 'Searching...';
    meanings.appendChild(loading);

    content.appendChild(header);
    content.appendChild(meanings);
    popup.appendChild(content);
    popup.appendChild(createCloseButton(removeAllPopups));

    const position = calculatePopupPosition(x, y, popupWidth, popupHeight, {
        preferBelow: true,
        alignCenter: true,
        anchorX: x,
        anchorY: y
    });

    popup.style.left = position.left + 'px';
    popup.style.top = position.top + 'px';

    return popup;
}

function updateWordPopupWithError(popup, message) {
    const meanings = popup?.querySelector('.translator-meanings');
    if (!meanings) return;

    meanings.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'translator-error';
    error.textContent = `❌ ${message}`;
    meanings.appendChild(error);
}

function updateWordPopupWithTranslation(popup, translatedText) {
    const meanings = popup?.querySelector('.translator-meanings');
    if (!meanings) return;

    meanings.innerHTML = '';
    const result = document.createElement('div');
    result.className = 'translator-translation';
    result.textContent = translatedText || 'No translation results';
    meanings.appendChild(result);
}

function getRenderableMeanings(data) {
    if (!Array.isArray(data?.meanings)) return [];

    return data.meanings
        .map(meaning => {
            const definitions = Array.isArray(meaning?.definitions)
                ? meaning.definitions
                    .map(definition => ({
                        definition: String(definition?.definition || '').trim(),
                        example: String(definition?.example || '').trim()
                    }))
                    .filter(definition => definition.definition)
                : [];

            return {
                partOfSpeech: String(meaning?.partOfSpeech || 'word'),
                definitions
            };
        })
        .filter(meaning => meaning.definitions.length > 0);
}

function hasRenderableDictionaryData(data) {
    return getRenderableMeanings(data).length > 0;
}

function updateWordPopupWithData(popup, data, word) {
    if (!popup || !data) return;

    const content = popup.querySelector('.translator-popup-content');
    if (!content) return;

    content.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'translator-word-header';

    const info = document.createElement('div');
    info.className = 'translator-word-info';

    const selectedWord = word || data.word;
    const resolvedWord = data.word || selectedWord;
    const wordSpan = document.createElement('span');
    wordSpan.className = 'translator-word';
    wordSpan.textContent = selectedWord;
    info.appendChild(wordSpan);

    if (resolvedWord && selectedWord && normalizeLookupWord(resolvedWord) !== normalizeLookupWord(selectedWord)) {
        const entrySpan = document.createElement('span');
        entrySpan.className = 'translator-entry-word';
        entrySpan.textContent = `Dictionary entry: ${resolvedWord}`;
        info.appendChild(entrySpan);
    }

    if (data.phonetic) {
        const phonetic = document.createElement('span');
        phonetic.className = 'translator-phonetic';
        phonetic.textContent = data.phonetic;
        info.appendChild(phonetic);
    }

    const bestAudioUrl = findBestAudioUrl(data.phonetics);
    const ownership = createPronunciationOwnership(data, word, bestAudioUrl);
    if (ownership) {
        info.appendChild(ownership);
    }

    header.appendChild(info);

    const speakButton = createSpeakButton(() => playLookupAudio(data, word, bestAudioUrl));
    speakButton.title = getLookupAudioTitle(data, word, bestAudioUrl);
    header.appendChild(speakButton);

    const meanings = document.createElement('div');
    meanings.className = 'translator-meanings';
    const renderableMeanings = getRenderableMeanings(data);

    if (renderableMeanings.length) {
        renderableMeanings.slice(0, 3).forEach(meaning => {
            const item = document.createElement('div');
            item.className = 'translator-meaning-item';

            const pos = document.createElement('span');
            pos.className = 'translator-pos';
            pos.textContent = meaning.partOfSpeech;
            item.appendChild(pos);

            meaning.definitions.slice(0, 2).forEach(definition => {
                item.appendChild(createDefinitionPair(definition.definition));
                if (definition.example) {
                    const example = document.createElement('div');
                    example.className = 'translator-example';
                    example.textContent = `"${definition.example}"`;
                    item.appendChild(example);
                }
            });

            meanings.appendChild(item);
        });
    } else {
        const empty = document.createElement('div');
        empty.className = 'translator-definition';
        empty.textContent = 'No detailed definitions found.';
        meanings.appendChild(empty);
    }

    content.appendChild(header);
    content.appendChild(meanings);
}

function getAudioCtor() {
    if (typeof globalThis !== 'undefined' && globalThis.Audio) {
        return globalThis.Audio;
    }
    if (typeof window !== 'undefined' && window.Audio) {
        return window.Audio;
    }
    if (typeof Audio !== 'undefined') {
        return Audio;
    }
    return null;
}

function normalizeLookupWord(value) {
    return String(value || '').trim().toLowerCase();
}

function findPhoneticByText(phonetics, phoneticText) {
    if (!Array.isArray(phonetics)) return null;
    return phonetics.find(phonetic => phonetic?.text && phonetic.text === phoneticText) || null;
}

function findPhoneticByAudio(phonetics, audioUrl) {
    if (!audioUrl || !Array.isArray(phonetics)) return null;
    return phonetics.find(phonetic => phonetic?.audio === audioUrl) || null;
}

function getPronunciationSourceWord(phonetic, fallbackWord) {
    return normalizeLookupWord(phonetic?.sourceWord || fallbackWord);
}

function getAudioOwnerWord(data, word, audioUrl) {
    if (!audioUrl) return '';
    const audioPhonetic = findPhoneticByAudio(data?.phonetics, audioUrl);
    return normalizeLookupWord(audioPhonetic?.audioSourceWord || audioPhonetic?.sourceWord || word);
}

function appendOwnershipPill(container, label, value, detail = '') {
    const pill = document.createElement('span');
    pill.className = 'translator-pronunciation-pill';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'translator-pronunciation-label';
    labelSpan.textContent = `${label}:`;
    pill.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'translator-pronunciation-value';
    valueSpan.textContent = value || 'TTS';
    pill.appendChild(valueSpan);

    if (detail) {
        const detailSpan = document.createElement('span');
        detailSpan.className = 'translator-pronunciation-detail';
        detailSpan.textContent = ` ${detail}`;
        pill.appendChild(detailSpan);
    }

    container.appendChild(pill);
}

function createPronunciationOwnership(data, word, audioUrl) {
    const phonetic = findPhoneticByText(data?.phonetics, data?.phonetic);
    const ipaOwner = getPronunciationSourceWord(phonetic, data?.word || word);
    const audioOwner = getAudioOwnerWord(data, word, audioUrl);
    const buttonOwner = getLookupPlaybackOwner(data, word, audioUrl);
    if (!ipaOwner && !audioOwner && !buttonOwner) return null;

    const ownership = document.createElement('div');
    ownership.className = 'translator-pronunciation-ownership';

    if (ipaOwner) {
        const detail = phonetic?.source === 'derived-inflection' ? '(inferred)' : '';
        appendOwnershipPill(ownership, 'IPA shown', ipaOwner, detail);
    }

    if (audioOwner) {
        appendOwnershipPill(ownership, 'Audio file', audioOwner);
    }

    if (buttonOwner) {
        const selectedWord = normalizeLookupWord(word);
        const detail = audioOwner && audioOwner !== selectedWord ? '(TTS first)' : '';
        appendOwnershipPill(ownership, 'Button plays', buttonOwner, detail);
    }

    return ownership.childElementCount ? ownership : null;
}

function getLookupPlaybackOwner(data, word, audioUrl) {
    const selectedWord = normalizeLookupWord(word);
    const audioOwner = getAudioOwnerWord(data, word, audioUrl);
    if (audioOwner && audioOwner !== selectedWord) {
        return selectedWord;
    }
    return audioOwner || selectedWord;
}

function getLookupAudioTitle(data, word, audioUrl) {
    const selectedWord = normalizeLookupWord(word);
    const audioOwner = getAudioOwnerWord(data, word, audioUrl);
    if (audioOwner && audioOwner !== selectedWord) {
        return `Play: ${selectedWord} via TTS; fallback audio file: ${audioOwner}`;
    }
    if (audioOwner) {
        return `Play audio file: ${audioOwner}`;
    }
    return `Play: ${selectedWord || 'word'} via TTS`;
}

function getAudioSourceWord(phonetics, audioUrl) {
    if (!audioUrl || !Array.isArray(phonetics)) return '';

    const match = findPhoneticByAudio(phonetics, audioUrl);
    return normalizeLookupWord(match?.audioSourceWord || match?.sourceWord);
}

async function playDictionaryAudio(audioUrl) {
    if (!audioUrl) return false;

    try {
        const AudioCtor = getAudioCtor();
        if (!AudioCtor) return false;
        await new AudioCtor(audioUrl).play();
        return true;
    } catch {
        return false;
    }
}

async function playLookupAudio(data, word, bestAudioUrl = findBestAudioUrl(data?.phonetics)) {
    const selectedWord = normalizeLookupWord(word);
    const audioSourceWord = getAudioSourceWord(data?.phonetics, bestAudioUrl);
    const audioBelongsToDifferentWord = audioSourceWord && audioSourceWord !== selectedWord;

    if (audioBelongsToDifferentWord) {
        const spokeSelectedWord = await speakText(word);
        if (spokeSelectedWord) return;
        await playDictionaryAudio(bestAudioUrl);
        return;
    }

    const playedDictionaryAudio = await playDictionaryAudio(bestAudioUrl);
    if (!playedDictionaryAudio) {
        await speakText(word);
    }
}

export async function handleWordLookupInteraction({
    word,
    x,
    y,
    popupWidth = Math.min(760, window.innerWidth - 20),
    popupHeight = 260
}) {
    if (!isContextValid() || !word) return null;

    const root = await ensureShadowRoot();
    if (!root) return null;

    removeAllPopups();

    const popup = createWordPopup(word, x, y, popupWidth, popupHeight);
    root.appendChild(popup);
    setCurrentPopup(popup);

    const response = await sendMessageSafe({
        action: 'fetchDictionary',
        word: word.toLowerCase()
    });

    if (!isContextValid() || getCurrentPopup() !== popup) {
        return popup;
    }

    if (response && response.success && hasRenderableDictionaryData(response.data)) {
        updateWordPopupWithData(popup, response.data, word);
        return popup;
    }

    if (response && response.error) {
        updateWordPopupWithError(popup, response.error);
        return popup;
    }

    const translation = await sendMessageSafe({ action: 'translate', text: word });
    if (!isContextValid() || getCurrentPopup() !== popup) {
        return popup;
    }

    if (translation && translation.success && translation.data) {
        updateWordPopupWithTranslation(popup, translation.data.translated || 'No results');
    } else {
        updateWordPopupWithError(popup, (translation && translation.error) || 'Query failed');
    }

    return popup;
}

export async function handleSelectionTranslation({
    text,
    x,
    y,
    popupWidth = Math.min(420, window.innerWidth - 20),
    popupHeight = 180,
    loadingText = 'Translating...'
}) {
    if (!text) return null;

    const { popup, content } = await showSentencePopup(x, y, {
        width: popupWidth,
        height: popupHeight,
        loadingText
    });
    if (!popup || !content) return null;

    if (text.trim().length > MAX_TRANSLATION_TEXT_CHARS) {
        replaceSentenceContent(
            content,
            'translator-error',
            'Selected text exceeds 500 characters. Please shorten the selection.'
        );
        return popup;
    }

    const response = await sendMessageSafe({ action: 'translate', text });
    if (!isContextValid() || getCurrentPopup() !== popup) {
        return popup;
    }

    if (response && response.success && response.data) {
        replaceSentenceContent(
            content,
            'translator-result',
            response.data.translated || 'No translation results'
        );
    } else {
        replaceSentenceContent(
            content,
            'translator-error',
            `❌ ${(response && response.error) || 'Translation failed'}`
        );
    }

    return popup;
}
