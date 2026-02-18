/**
 * Translater - Chrome Extension Content Script
 */

(async function () {
    'use strict';

    // Prevent duplicate injection
    if (window.__translatorExtensionLoaded) return;
    window.__translatorExtensionLoaded = true;

    // Dynamically import utility functions
    let utils;
    try {
        const utilsUrl = chrome.runtime.getURL('utils.js');
        utils = await import(utilsUrl);
    } catch (e) {
        console.log('[Translater] Extension context invalidated, please refresh the page');
        return;
    }

    const {
        escapeHtml,
        isAllEnglish,
        createSpeakerSVG,
        calculatePopupPosition,
        sendMessageSafe,
        speakText,
        isContextValid,
        getURLSafe,
        ensureShadowRoot,
        createCloseButton,
        createSpeakButton,
        removeAllPopups,
        removeFloatButtons,
        getCurrentPopup,
        setCurrentPopup,
        getShadowRoot,
        getHideFloatButtonsTimeout,
        setHideFloatButtonsTimeout,
        setCurrentFloatButtons,
        getCurrentFloatButtons,
        getShadowHost,
        findBestAudioUrl,
        isProbablyWord
    } = utils;

    const definitionTranslationCache = new Map();

    // Preload speech engine
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.getVoices();
        speechSynthesis.addEventListener('voiceschanged', () => {
            console.log('[Translater] Speech engine ready');
        }, { once: true });
    }

    // ==================== Shadow DOM Setup ====================

    // State management is now partially delegated to utils.js (singletons in this context)

    // ==================== Translation Popup Rendering ====================

    /**
     * Renders the translation popup at the specified coordinates.
     * @param {number} x - Viewport X coordinate.
     * @param {number} y - Viewport Y coordinate.
     * @param {DocumentFragment|HTMLElement} initialContent - Content to display initially.
     * @returns {Promise<HTMLElement>} The popup element.
     */
    async function showPopup(x, y, initialContent) {
        const root = await ensureShadowRoot();
        removeAllPopups();

        const popup = document.createElement('div');
        popup.className = 'translator-popup';
        popup.style.pointerEvents = 'auto'; // Ensure content is clickable
        popup.appendChild(initialContent);

        root.appendChild(popup);
        setCurrentPopup(popup);

        // Initial positioning using fixed width estimate
        const popupWidth = Math.min(760, window.innerWidth - 20);
        const popupHeightEstimate = 260;
        const pos = calculatePopupPosition(x, y, popupWidth, popupHeightEstimate, {
            preferBelow: true,
            alignCenter: true,
            anchorX: x,
            anchorY: y
        });
        popup.style.left = pos.left + 'px';
        popup.style.top = pos.top + 'px';

        return popup;
    }

    /**
     * Creates a loading placeholder for the dictionary popup.
     * @param {string} word - The word being searched.
     * @returns {DocumentFragment}
     */
    function createLoadingPopup(word) {
        const container = document.createElement('div');
        container.className = 'translator-popup-content';

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

        container.appendChild(header);
        container.appendChild(meanings);

        const fragment = document.createDocumentFragment();
        // DOM Order: content first, close button last (ensures z-index stacking)
        fragment.appendChild(container);
        fragment.appendChild(createCloseButton(removeAllPopups));

        return fragment;
    }

    function createDefinitionPair(definitionText) {
        const trimmed = (definitionText || '').trim();
        const pair = document.createElement('div');
        pair.className = 'translator-definition-pair';

        const english = document.createElement('div');
        english.className = 'translator-definition translator-definition-en';
        english.textContent = definitionText;
        pair.appendChild(english);

        const chinese = document.createElement('div');
        chinese.className = 'translator-definition translator-definition-zh';
        chinese.textContent = trimmed ? 'Translating…' : '—';
        chinese.dataset.definitionKey = trimmed;
        pair.appendChild(chinese);

        if (trimmed) {
            translateDefinitionToChinese(trimmed, chinese);
        }

        return pair;
    }

    function translateDefinitionToChinese(text, targetEl) {
        const translationPromise = getDefinitionTranslationPromise(text);
        translationPromise.then(result => {
            if (!targetEl.isConnected || targetEl.dataset.definitionKey !== text) return;
            if (result && result.success && result.data && result.data.translated) {
                targetEl.textContent = result.data.translated;
                targetEl.classList.remove('translator-definition-zh-error');
            } else {
                const localizedError = (result && result.error === 'Please configure DeepL API Key')
                    ? 'Please configure a DeepL API Key in extension options'
                    : (result && result.error) || 'Translation unavailable';
                targetEl.textContent = localizedError;
                targetEl.classList.add('translator-definition-zh-error');
            }
        }).catch(() => {
            if (!targetEl.isConnected || targetEl.dataset.definitionKey !== text) return;
            targetEl.textContent = 'Translation failed';
            targetEl.classList.add('translator-definition-zh-error');
        });
    }

    function getDefinitionTranslationPromise(text) {
        if (definitionTranslationCache.has(text)) {
            return definitionTranslationCache.get(text);
        }

        const promise = sendMessageSafe({
            action: 'translate',
            text,
            targetLang: 'zh-CN'
        }).then(response => {
            if (response) return response;
            return { success: false, error: 'Translation unavailable' };
        }).catch(error => ({ success: false, error: error?.message || 'Translation failed' }));

        definitionTranslationCache.set(text, promise);
        return promise;
    }

    /**
     * Updates the popup content with dictionary data.
     * @param {Object} data - The dictionary API response.
     * @param {string} word - The original searched word.
     */
    function updatePopupWithData(data, word) {
        if (!getCurrentPopup() || !data) {
            console.error('[Translater] updatePopupWithData received invalid data:', data);
            return;
        }

        const container = getCurrentPopup().querySelector('.translator-popup-content');
        if (!container) return;

        container.innerHTML = ''; // Clear loading state

        // Header
        const header = document.createElement('div');
        header.className = 'translator-word-header';

        const wordInfo = document.createElement('div');
        wordInfo.className = 'translator-word-info';
        const wordSpan = document.createElement('span');
        wordSpan.className = 'translator-word';
        wordSpan.textContent = data.word || word;
        wordInfo.appendChild(wordSpan);

        // Show source word if it differs from the headword
        if (data.word && word && data.word.toLowerCase() !== word.toLowerCase()) {
            const sourceSpan = document.createElement('span');
            sourceSpan.className = 'translator-source-word';
            sourceSpan.textContent = `(from ${word}) `;

            // Add a mini speak button for the source word
            const miniSpeakBtn = document.createElement('span');
            miniSpeakBtn.className = 'translator-mini-speak';
            miniSpeakBtn.innerHTML = createSpeakerSVG();
            miniSpeakBtn.title = `Speak selected: ${word}`;
            miniSpeakBtn.onclick = (e) => {
                e.stopPropagation();
                speakText(word);
            };
            sourceSpan.appendChild(miniSpeakBtn);

            wordInfo.appendChild(sourceSpan);
        }

        if (data.phonetic) {
            const phoneticSpan = document.createElement('span');
            phoneticSpan.className = 'translator-phonetic';
            phoneticSpan.textContent = data.phonetic;
            wordInfo.appendChild(phoneticSpan);
        }

        header.appendChild(wordInfo);

        // Find best audio
        const audioUrl = findBestAudioUrl(data.phonetics);

        const speakHandler = () => {
            if (audioUrl) {
                new Audio(audioUrl).play().catch(() => speakText(data.word || word));
            } else {
                speakText(data.word || word);
            }
        };

        header.appendChild(createSpeakButton(speakHandler));

        // Meanings
        const meaningsCont = document.createElement('div');
        meaningsCont.className = 'translator-meanings';

        if (data.meanings && data.meanings.length > 0) {
            data.meanings.slice(0, 3).forEach(meaning => {
                const item = document.createElement('div');
                item.className = 'translator-meaning-item';

                const pos = document.createElement('span');
                pos.className = 'translator-pos';
                pos.textContent = meaning.partOfSpeech;
                item.appendChild(pos);

                meaning.definitions.slice(0, 2).forEach(def => {
                    const definitionPair = createDefinitionPair(def.definition);
                    item.appendChild(definitionPair);

                    if (def.example) {
                        const ex = document.createElement('div');
                        ex.className = 'translator-example';
                        ex.textContent = `"${def.example}"`;
                        item.appendChild(ex);
                    }
                });
                meaningsCont.appendChild(item);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'translator-definition';
            empty.textContent = 'No detailed definitions found.';
            meaningsCont.appendChild(empty);
        }

        container.appendChild(header);
        container.appendChild(meaningsCont);

        // Realignment if width changes significantly (optional), currently maintaining position is smoother
    }

    /**
     * Updates the existing popup with an error message.
     * @param {string} word - The word that failed.
     * @param {string} message - Error message to display.
     */
    function updatePopupWithError(word, message) {
        if (!getCurrentPopup()) return;
        const meanings = getCurrentPopup().querySelector('.translator-meanings');
        if (meanings) {
            meanings.innerHTML = '';
            const err = document.createElement('div');
            err.className = 'translator-error';
            err.textContent = `❌ ${message}`;
            meanings.appendChild(err);
        }
    }

    // ==================== Event Listeners ====================

    document.addEventListener('dblclick', async (e) => {
        if (!isContextValid()) return;
        const selection = window.getSelection();
        const word = selection.toString().trim();

        if (!word || !isAllEnglish(word) || !isProbablyWord(word)) return;

        await showPopup(e.clientX, e.clientY, createLoadingPopup(word));

        const response = await sendMessageSafe({
            action: 'fetchDictionary',
            word: word.toLowerCase()
        });

        if (!isContextValid() || !getCurrentPopup()) return;

        if (response && response.success && response.data) {
            updatePopupWithData(response.data, word);

            const isMorphed = response.data.word && response.data.word.toLowerCase() !== word.toLowerCase();

            if (isMorphed) {
                // Morphed word: Force AI speak for the variant
                speakText(word);
            } else {
                // Standard word: prioritize dictionary audio
                const bestAudio = findBestAudioUrl(response.data.phonetics);

                if (bestAudio) new Audio(bestAudio).play().catch(() => speakText(word));
                else speakText(word);
            }
        }
        else if (response && response.error) {
            updatePopupWithError(word, response.error);
        } else {
            const trRes = await sendMessageSafe({ action: 'translate', text: word });
            if (!isContextValid() || !getCurrentPopup()) return;
            if (trRes && trRes.success && trRes.data) {
                const container = getCurrentPopup().querySelector('.translator-meanings');
                if (container) {
                    container.innerHTML = '';
                    const res = document.createElement('div');
                    res.className = 'translator-translation';
                    res.textContent = trRes.data.translated || 'No translation results';
                    container.appendChild(res);
                }
                // Auto speak for translation as well
                speakText(word);
            } else {
                updatePopupWithError(word, (trRes && trRes.error) || 'Query failed');
            }
        }
    });

    // ==================== Floating Buttons (Shared via utils.js) ====================

    document.addEventListener('mouseup', (e) => {
        if (!isContextValid()) return;
        setTimeout(async () => {
            try {
                const selection = window.getSelection();
                const text = selection.toString().trim();

                if (e.target.id === 'translator-extension-host') return;
                removeFloatButtons();

                if (!text || !isAllEnglish(text) || isProbablyWord(text)) return;

                const root = await ensureShadowRoot();
                const floatButtons = document.createElement('div');
                floatButtons.className = 'translator-float-buttons';

                // Constants for floating buttons
                const FLOAT_BTN_WIDTH = 32;
                const FLOAT_BTN_GAP = 30;

                const speakBtn = document.createElement('button');
                speakBtn.className = 'translator-float-btn speak-btn';
                speakBtn.innerHTML = createSpeakerSVG();
                speakBtn.setAttribute('data-tooltip', 'Speak');
                speakBtn.onclick = () => speakText(text);

                const transBtn = document.createElement('button');
                transBtn.className = 'translator-float-btn translate-btn';
                transBtn.textContent = 'T';
                transBtn.setAttribute('data-tooltip', 'Translate');
                transBtn.onmouseenter = () => translateSelection(text, e.clientX, e.clientY);

                const closeBtn = document.createElement('button');
                closeBtn.className = 'translator-float-btn close-floating-btn';
                closeBtn.textContent = '×';
                closeBtn.setAttribute('data-tooltip', 'Close');
                closeBtn.onclick = removeFloatButtons;
                closeBtn.onmouseenter = removeFloatButtons;

                const googleBtn = document.createElement('button');
                googleBtn.className = 'translator-float-btn google-search-btn';
                googleBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:white;"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
                googleBtn.setAttribute('data-tooltip', 'Google');
                googleBtn.onclick = () => window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');

                floatButtons.appendChild(speakBtn);
                floatButtons.appendChild(transBtn);
                floatButtons.appendChild(closeBtn);
                floatButtons.appendChild(googleBtn);
                floatButtons.style.pointerEvents = 'auto';
                root.appendChild(floatButtons);
                setCurrentFloatButtons(floatButtons);

                // Position
                const containerWidth = FLOAT_BTN_WIDTH * 3 + FLOAT_BTN_GAP + 6;
                let left = Math.max(10, Math.min(e.clientX - FLOAT_BTN_WIDTH - FLOAT_BTN_GAP / 2, window.innerWidth - containerWidth - 10));
                let top = Math.max(44, Math.min(e.clientY - FLOAT_BTN_WIDTH / 2, window.innerHeight - FLOAT_BTN_WIDTH - 44));

                floatButtons.style.left = left + 'px';
                floatButtons.style.top = top + 'px';
                floatButtons.style.gap = FLOAT_BTN_GAP + 'px';

                floatButtons.addEventListener('mouseleave', () => {
                    setHideFloatButtonsTimeout(setTimeout(removeFloatButtons, 500));
                });
                floatButtons.addEventListener('mouseenter', () => {
                    if (getHideFloatButtonsTimeout()) clearTimeout(getHideFloatButtonsTimeout());
                });
            } catch (err) {
                console.error('[Translater] Mouseup event failed:', err);
            }
        }, 20);
    });

    /**
     * Translates the selected text and displays it in a sentence popup.
     * @param {string} text - Text to translate.
     * @param {number} x - Viewport X coordinate.
     * @param {number} y - Viewport Y coordinate.
     */
    async function translateSelection(text, x, y) {
        removeAllPopups();
        const root = await ensureShadowRoot();

        const popup = document.createElement('div');
        popup.className = 'translator-sentence-popup';
        popup.style.pointerEvents = 'auto';

        const closeBtn = createCloseButton(removeAllPopups);
        const content = document.createElement('div');
        content.className = 'translator-sentence-content';
        const loading = document.createElement('div');
        loading.className = 'translator-loading';
        loading.textContent = 'Translating...';
        content.appendChild(loading);

        popup.appendChild(content);
        popup.appendChild(closeBtn); // Append button last
        root.appendChild(popup);
        setCurrentPopup(popup);

        const sentenceWidth = Math.min(420, window.innerWidth - 20);
        const pos = calculatePopupPosition(x, y, sentenceWidth, 180, {
            preferBelow: true,
            alignCenter: true,
            anchorX: x,
            anchorY: y
        });
        popup.style.left = pos.left + 'px';
        popup.style.top = pos.top + 'px';

        const response = await sendMessageSafe({ action: 'translate', text });
        if (!isContextValid()) return;
        if (response && response.success && response.data) {
            content.innerHTML = '';
            const res = document.createElement('div');
            res.className = 'translator-result';
            res.textContent = response.data.translated || 'No translation results';
            content.appendChild(res);
        } else {
            content.textContent = `❌ ${(response && response.error) || 'Translation failed'}`;
        }
    }

    // Dismissal
    document.addEventListener('mousedown', (e) => {
        // Use composedPath() to detect clicks across Shadow DOM boundaries
        const path = e.composedPath();
        const isClickInside = path.some(el =>
            el === getShadowHost() ||
            (el.classList && (
                el.classList.contains('translator-popup') ||
                el.classList.contains('translator-float-buttons') ||
                el.classList.contains('translator-sentence-popup')
            ))
        );

        if (!isClickInside && getCurrentPopup()) {
            removeAllPopups();
        }

        // Only continue for other logic if context is valid
        if (!isContextValid()) return;
    });
    console.log('Translater Extension Loaded (Shadow DOM)');
})();
