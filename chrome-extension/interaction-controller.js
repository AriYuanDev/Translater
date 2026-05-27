import {
    createSpeakerSVG,
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

function updateWordPopupWithData(popup, data, word) {
    if (!popup || !data) return;

    const content = popup.querySelector('.translator-popup-content');
    if (!content) return;

    content.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'translator-word-header';

    const info = document.createElement('div');
    info.className = 'translator-word-info';

    const resolvedWord = data.word || word;
    const wordSpan = document.createElement('span');
    wordSpan.className = 'translator-word';
    wordSpan.textContent = resolvedWord;
    info.appendChild(wordSpan);

    if (data.word && word && data.word.toLowerCase() !== word.toLowerCase()) {
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'translator-source-word';
        sourceSpan.textContent = `(from ${word}) `;

        const miniSpeakButton = document.createElement('span');
        miniSpeakButton.className = 'translator-mini-speak';
        miniSpeakButton.innerHTML = createSpeakerSVG();
        miniSpeakButton.onclick = event => {
            event.stopPropagation();
            void speakText(word).catch(error => {
                console.warn('[Translater] Speak failed:', error);
            });
        };

        sourceSpan.appendChild(miniSpeakButton);
        info.appendChild(sourceSpan);
    }

    if (data.phonetic) {
        const phonetic = document.createElement('span');
        phonetic.className = 'translator-phonetic';
        phonetic.textContent = data.phonetic;
        info.appendChild(phonetic);
    }

    header.appendChild(info);

    const bestAudioUrl = findBestAudioUrl(data.phonetics);
    header.appendChild(createSpeakButton(() => playLookupAudio(data, word, bestAudioUrl)));

    const meanings = document.createElement('div');
    meanings.className = 'translator-meanings';

    if (data.meanings?.length) {
        data.meanings.slice(0, 3).forEach(meaning => {
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

async function playLookupAudio(data, word, bestAudioUrl = findBestAudioUrl(data?.phonetics)) {
    const isMorphed = data?.word && word && data.word.toLowerCase() !== word.toLowerCase();

    if (isMorphed) {
        await speakText(word);
        return;
    }

    if (!bestAudioUrl) {
        await speakText(word);
        return;
    }

    try {
        const AudioCtor = getAudioCtor();
        if (!AudioCtor) {
            await speakText(word);
            return;
        }
        await new AudioCtor(bestAudioUrl).play();
    } catch {
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

    if (response && response.success && response.data) {
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
        content.textContent = 'Selected text exceeds 500 characters. Please shorten the selection.';
        return popup;
    }

    const response = await sendMessageSafe({ action: 'translate', text });
    if (!isContextValid() || getCurrentPopup() !== popup) {
        return popup;
    }

    if (response && response.success && response.data) {
        content.innerHTML = '';
        const result = document.createElement('div');
        result.className = 'translator-result';
        result.textContent = response.data.translated || 'No translation results';
        content.appendChild(result);
    } else {
        content.textContent = `❌ ${(response && response.error) || 'Translation failed'}`;
    }

    return popup;
}
