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
        ensureShadowRoot,
        createCloseButton,
        createSpeakButton,
        removeAllPopups,
        getCurrentPopup,
        setCurrentPopup,
        getShadowHost,
        findBestAudioUrl,
        isProbablyWord,
        createDefinitionPair,
        showSelectionToolbar,
        showSentencePopup
    } = utils;


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
        if (!root) return null;
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

        const popup = await showPopup(e.clientX, e.clientY, createLoadingPopup(word));

        const response = await sendMessageSafe({
            action: 'fetchDictionary',
            word: word.toLowerCase()
        });

        if (!isContextValid() || getCurrentPopup() !== popup) return;

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
            if (!isContextValid() || getCurrentPopup() !== popup) return;
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
                if (!text || !isAllEnglish(text) || isProbablyWord(text)) return;

                await showSelectionToolbar({
                    text,
                    x: e.clientX,
                    y: e.clientY,
                    onTranslate: translateSelection
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
        const { popup, content } = await showSentencePopup(x, y);
        if (!popup || !content) return;

        const response = await sendMessageSafe({ action: 'translate', text });
        if (!isContextValid() || getCurrentPopup() !== popup) return;
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
