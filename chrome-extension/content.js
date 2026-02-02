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
        getURLSafe
    } = utils;

    // Preload speech engine
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.getVoices();
        speechSynthesis.addEventListener('voiceschanged', () => {
            console.log('[Translater] Speech engine ready');
        }, { once: true });
    }

    // ==================== Shadow DOM Setup ====================

    let shadowHost = null;
    let shadowRoot = null;
    let currentPopup = null;
    let currentFloatButtons = null;
    let hideFloatButtonsTimeout = null;
    let stylesLoaded = false;
    let stylesLoadPromise = null;

    async function ensureShadowRoot() {
        if (!isContextValid()) return null;
        if (!shadowHost) {
            shadowHost = document.createElement('div');
            shadowHost.id = 'translator-extension-host';
            // Set Host to fixed full screen but non-interactive, only its children are interactive
            Object.assign(shadowHost.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: '2147483647',
                border: 'none',
                padding: '0',
                margin: '0',
                visibility: 'visible',
                display: 'block'
            });
            document.documentElement.appendChild(shadowHost);
            shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

            const styleLink = document.createElement('link');
            styleLink.rel = 'stylesheet';
            styleLink.href = getURLSafe('styles.css');
            shadowRoot.appendChild(styleLink);

            // Wait for styles to load to prevent FOUC (Flash of Unstyled Content)
            stylesLoadPromise = new Promise((resolve) => {
                styleLink.onload = () => {
                    stylesLoaded = true;
                    resolve();
                };
                styleLink.onerror = () => {
                    // Even on error, mark as loaded to prevent blocking
                    stylesLoaded = true;
                    resolve();
                };
                // Fallback timeout in case onload doesn't fire
                setTimeout(() => {
                    if (!stylesLoaded) {
                        stylesLoaded = true;
                        resolve();
                    }
                }, 500);
            });
        }

        // Wait for styles to be loaded before returning
        if (stylesLoadPromise && !stylesLoaded) {
            await stylesLoadPromise;
        }
        return shadowRoot;
    }

    // ==================== UI Construction Tools (Safe DOM API) ====================

    function createCloseButton(onClick) {
        const btn = document.createElement('button');
        btn.className = 'translator-close-btn';
        btn.title = 'Close';
        btn.textContent = '×';
        btn.addEventListener('click', onClick);
        return btn;
    }

    function createSpeakButton(onClick) {
        const btn = document.createElement('button');
        btn.className = 'translator-speak-btn';
        btn.title = 'Speak';
        btn.innerHTML = createSpeakerSVG();
        if (onClick) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
        }
        return btn;
    }

    function removeAllPopups() {
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        if (currentFloatButtons) {
            currentFloatButtons.remove();
            currentFloatButtons = null;
        }
    }

    // ==================== Translation Popup Rendering ====================

    async function showPopup(x, y, initialContent) {
        const root = await ensureShadowRoot();
        removeAllPopups();

        currentPopup = document.createElement('div');
        currentPopup.className = 'translator-popup';
        currentPopup.style.pointerEvents = 'auto'; // Ensure content is clickable
        currentPopup.appendChild(initialContent);

        root.appendChild(currentPopup);

        // Initial positioning using fixed width estimate, as getBoundingClientRect might not be rendered yet
        const pos = calculatePopupPosition(x, y, 350, 200);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

        return currentPopup;
    }

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
        fragment.appendChild(createCloseButton(removeAllPopups));
        fragment.appendChild(container);

        return fragment;
    }

    function updatePopupWithData(data, word) {
        if (!currentPopup || !data) {
            console.error('[Translater] updatePopupWithData received invalid data:', data);
            return;
        }

        const container = currentPopup.querySelector('.translator-popup-content');
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
        let audioUrl = '';
        if (data.phonetics) {
            const best = data.phonetics.find(p => p.audio && (p.audio.includes('us_pron') || p.audio.includes('-us')));
            audioUrl = best ? best.audio : (data.phonetics[0]?.audio || '');
        }

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
                    const d = document.createElement('div');
                    d.className = 'translator-definition';
                    d.textContent = def.definition;
                    item.appendChild(d);

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

    function updatePopupWithError(word, message) {
        if (!currentPopup) return;
        const meanings = currentPopup.querySelector('.translator-meanings');
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

        if (!word || !isAllEnglish(word)) return;

        await showPopup(e.clientX, e.clientY, createLoadingPopup(word));

        const response = await sendMessageSafe({
            action: 'fetchDictionary',
            word: word.toLowerCase()
        });

        if (!isContextValid() || !currentPopup) return;

        if (response && response.success && response.data) {
            updatePopupWithData(response.data, word);

            const isMorphed = response.data.word && response.data.word.toLowerCase() !== word.toLowerCase();

            if (isMorphed) {
                // Morphed word: Force AI speak for the variant
                speakText(word);
            } else {
                // Standard word: prioritize dictionary audio
                const bestAudio = response.data.phonetics?.find(p => p.audio && (
                    p.audio.includes('us_pron') ||
                    p.audio.includes('-us') ||
                    p.audio.includes('merriam-webster.com')
                ))?.audio || response.data.phonetics?.find(p => p.audio)?.audio;

                if (bestAudio) new Audio(bestAudio).play().catch(() => speakText(word));
                else speakText(word);
            }
        }
        else if (response && response.error) {
            updatePopupWithError(word, response.error);
        } else {
            const trRes = await sendMessageSafe({ action: 'translate', text: word });
            if (!isContextValid() || !currentPopup) return;
            if (trRes && trRes.success && trRes.data) {
                const container = currentPopup.querySelector('.translator-meanings');
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

    // ==================== Floating Buttons (Refactored) ====================

    function removeFloatButtons() {
        if (hideFloatButtonsTimeout) {
            clearTimeout(hideFloatButtonsTimeout);
            hideFloatButtonsTimeout = null;
        }
        if (currentFloatButtons) {
            currentFloatButtons.remove();
            currentFloatButtons = null;
        }
    }

    document.addEventListener('mouseup', (e) => {
        if (!isContextValid()) return;
        setTimeout(async () => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (e.target.id === 'translator-extension-host') return;
            removeFloatButtons();

            if (!text || (text.split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text)) || !isAllEnglish(text)) return;

            const root = await ensureShadowRoot();
            currentFloatButtons = document.createElement('div');
            currentFloatButtons.className = 'translator-float-buttons';

            const speakBtn = document.createElement('button');
            speakBtn.className = 'translator-float-btn speak-btn';
            speakBtn.innerHTML = createSpeakerSVG();
            speakBtn.setAttribute('data-tooltip', 'Speak');
            speakBtn.onmouseenter = () => speakText(text);

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

            currentFloatButtons.appendChild(speakBtn);
            currentFloatButtons.appendChild(transBtn);
            currentFloatButtons.appendChild(closeBtn);
            currentFloatButtons.style.pointerEvents = 'auto';
            root.appendChild(currentFloatButtons);

            // Position
            const btnWidth = 32;
            const gap = 30;
            const containerWidth = btnWidth * 3 + gap + 6;
            let left = Math.max(10, Math.min(e.clientX - btnWidth - gap / 2, window.innerWidth - containerWidth - 10));
            let top = Math.max(10, Math.min(e.clientY - btnWidth / 2, window.innerHeight - btnWidth - 10));

            currentFloatButtons.style.left = left + 'px';
            currentFloatButtons.style.top = top + 'px';
            currentFloatButtons.style.gap = gap + 'px';

            currentFloatButtons.addEventListener('mouseleave', () => {
                hideFloatButtonsTimeout = setTimeout(removeFloatButtons, 500);
            });
            currentFloatButtons.addEventListener('mouseenter', () => {
                if (hideFloatButtonsTimeout) clearTimeout(hideFloatButtonsTimeout);
            });
        }, 20);
    });

    async function translateSelection(text, x, y) {
        removeFloatButtons();
        const root = await ensureShadowRoot();

        currentPopup = document.createElement('div');
        currentPopup.className = 'translator-sentence-popup';
        currentPopup.style.pointerEvents = 'auto';

        const closeBtn = createCloseButton(removeAllPopups);
        const content = document.createElement('div');
        content.className = 'translator-sentence-content';
        const loading = document.createElement('div');
        loading.className = 'translator-loading';
        loading.textContent = 'Translating...';
        content.appendChild(loading);

        currentPopup.appendChild(closeBtn);
        currentPopup.appendChild(content);
        root.appendChild(currentPopup);

        const pos = calculatePopupPosition(x, y, 350, 150);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

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
            el === shadowHost ||
            (el.classList && (
                el.classList.contains('translator-popup') ||
                el.classList.contains('translator-float-buttons') ||
                el.classList.contains('translator-sentence-popup')
            ))
        );

        if (!isClickInside && currentPopup) {
            removeAllPopups();
        }

        // Only continue for other logic if context is valid
        if (!isContextValid()) return;
    });
    console.log('Translater Extension Loaded (Shadow DOM)');
})();
