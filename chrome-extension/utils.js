/**
 * Translater - Shared Utility Functions
 */

// HTML escape function to prevent XSS attacks
/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} text - The string to escape.
 * @returns {string}
 */
export function escapeHtml(text) {
    if (!text) return '';
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
}

// Detect if text is entirely English (and does not contain CJK characters)
/**
 * Checks if a string consists entirely of English characters and symbols.
 * Now allows common English punctuation and whitespace.
 * @param {string} text
 * @returns {boolean}
 */
export function isAllEnglish(text) {
    if (!text) return false;
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
    return !cjkRegex.test(text);
}

/**
 * Heuristic to determine if the text is probably a single word or a short compound word.
 * @param {string} text 
 * @returns {boolean}
 */
export function isProbablyWord(text) {
    if (!text) return false;
    const trimmed = text.trim();
    // A word should not have spaces inside (excluding trailing/leading)
    if (/\s/.test(trimmed)) return false;
    // Check if it's mostly alphabetical/numeric with common word connectors like '-' or '''
    return /^[a-zA-Z0-9\-\']+$/.test(trimmed);
}

/**
 * Routes selected text to the appropriate interaction surface.
 * @param {string} text
 * @returns {'none'|'word-lookup'|'selection-toolbar'}
 */
export function getTextSelectionAction(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || !isAllEnglish(trimmed)) return 'none';
    if (isProbablyWord(trimmed)) return 'word-lookup';
    return 'selection-toolbar';
}

/**
 * Determines whether a mouse release is likely the end of a drag selection.
 * @param {{x:number,y:number}|null} start
 * @param {{x:number,y:number,detail?:number}} end
 * @returns {boolean}
 */
export function shouldHandleMouseSelectionRelease(start, end) {
    if (!start || !end) return false;
    if ((end.detail || 0) > 1) return false;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.hypot(dx, dy) >= 6;
}

/**
 * Returns the live selection text, or a fresh cached selection if the page cleared it.
 * @param {string} currentText
 * @param {string} cachedText
 * @param {number} cachedAt
 * @param {number} [now=Date.now()]
 * @param {number} [maxAgeMs=800]
 * @returns {string}
 */
export function getFreshSelectionText(currentText, cachedText, cachedAt, now = Date.now(), maxAgeMs = 800) {
    const current = (currentText || '').trim();
    if (current) return current;

    const cached = (cachedText || '').trim();
    if (!cached) return '';
    if (now - cachedAt > maxAgeMs) return '';
    return cached;
}

// Create pronunciation icon SVG
/**
 * Returns the SVG markup for the speaker icon.
 * @returns {string}
 */
export function createSpeakerSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; fill:currentColor;">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>`;
}

// Check if extension context is valid
/**
 * Checks if the extension context is still valid.
 * @returns {boolean}
 */
export function isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

// Safely get extension resource URL
/**
 * Safely resolves a path to a chrome extension URL.
 * @param {string} path 
 * @returns {string}
 */
export function getURLSafe(path) {
    if (!isContextValid()) return '';
    try {
        return chrome.runtime.getURL(path);
    } catch {
        return '';
    }
}

/**
 * Opens an external URL using the best available extension context.
 * @param {string} url
 */
export function openExternalUrl(url) {
    if (!url) return;
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
        chrome.tabs.create({ url });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Adds a no-redirect flag to a URL so the background script can bypass custom viewers.
 * @param {string} url
 * @param {string} [paramName='translater_no_redirect']
 * @returns {string}
 */
export function appendNoRedirectParam(url, paramName = 'translater_no_redirect') {
    if (!url) return '';
    try {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.set(paramName, '1');
        return parsedUrl.toString();
    } catch {
        if (url.includes(`${paramName}=`)) {
            return url;
        }
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}${paramName}=1`;
    }
}

// Calculate popup position
/**
 * Calculates the optimal position for a popup element relative to click coordinates.
 * @param {number} x - Click X coordinate.
 * @param {number} y - Click Y coordinate.
 * @param {number} popupWidth - Estimated popup width.
 * @param {number} popupHeight - Estimated popup height.
 * @returns {{left: number, top: number}} The calculated position.
 */
export function calculatePopupPosition(x, y, popupWidth, popupHeight, options = {}) {
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const {
        preferBelow = true,
        alignCenter = false,
        anchorX = x,
        anchorY = y
    } = options;

    let left;
    if (alignCenter) {
        left = anchorX - popupWidth / 2;
    } else {
        left = anchorX + padding;
        if (left + popupWidth > viewportWidth - padding) {
            left = anchorX - popupWidth - padding;
        }
    }

    let top;
    if (preferBelow) {
        top = anchorY + padding;
        if (top + popupHeight > viewportHeight - padding) {
            top = anchorY - popupHeight - padding;
        }
    } else {
        top = anchorY - popupHeight - padding;
        if (top < padding) {
            top = anchorY + padding;
        }
    }

    if (alignCenter) {
        if (left < padding) left = padding;
        if (left + popupWidth > viewportWidth - padding) {
            left = viewportWidth - popupWidth - padding;
        }
    } else {
        left = Math.max(padding, left);
    }

    if (top < padding) {
        top = padding;
    }
    if (top + popupHeight > viewportHeight - padding) {
        top = Math.max(padding, viewportHeight - popupHeight - padding);
    }

    return { left, top };
}

// Safely send message to background with timeout
/**
 * Safely sends a message to the background script with error handling and timeout.
 * @param {Object} message - The message object.
 * @param {number} [timeoutMs=15000] - Timeout in milliseconds.
 * @returns {Promise<Object>} The response data.
 */
export async function sendMessageSafe(message, timeoutMs = 15000) {
    if (!isContextValid()) {
        return { success: false, error: 'Extension context invalidated, please refresh the page.' };
    }

    const sendAction = async () => {
        try {
            const response = await chrome.runtime.sendMessage(message);
            // If undefined, background might not be ready, retry once
            if (response === undefined) {
                console.log('[Translater] Received undefined response, retrying...');
                await new Promise(r => setTimeout(r, 200));
                const retryResponse = await chrome.runtime.sendMessage(message);
                return retryResponse || { success: false, error: 'No response from background' };
            }
            return response;
        } catch (error) {
            console.error('[Translater] Failed to send message:', error);
            if (error.message?.includes('Extension context invalidated')) {
                return { success: false, error: 'Extension updated, please refresh the page.' };
            }
            return { success: false, error: 'Network communication error' };
        }
    };

    let timeoutId;
    const timeoutPromise = new Promise(resolve => {
        timeoutId = setTimeout(() => {
            resolve({ success: false, error: 'Request timed out' });
        }, timeoutMs);
    });

    try {
        return await Promise.race([sendAction(), timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

const definitionTranslationCache = new Map();
const DEFAULT_TRANSLATE_TRIGGER_MODE = 'click';

function normalizeTranslateTriggerMode(mode) {
    return mode === 'hover' ? 'hover' : DEFAULT_TRANSLATE_TRIGGER_MODE;
}

async function resolveTranslateTriggerMode(explicitMode) {
    if (explicitMode) return normalizeTranslateTriggerMode(explicitMode);

    const response = await sendMessageSafe({ action: 'getTranslationTriggerMode' }, 1000);
    if (response && response.success && response.data) {
        return normalizeTranslateTriggerMode(response.data.mode);
    }
    return DEFAULT_TRANSLATE_TRIGGER_MODE;
}

function getFriendlyTranslationError(result) {
    if (result && result.errorCode === 'TEXT_TOO_LONG') {
        return 'Selected text exceeds 500 characters. Please shorten the selection.';
    }
    if (result && result.errorCode === 'QUOTA_EXCEEDED') {
        return 'DeepL quota exceeded. Please wait for quota reset or update your API plan.';
    }
    if (result && result.error === 'Please configure DeepL API Key') {
        return 'Please configure a DeepL API Key in extension options';
    }
    return (result && result.error) || 'Translation unavailable';
}

/**
 * Retrieves or creates a cached translation request for a dictionary definition.
 * @param {string} text
 * @returns {Promise<Object>}
 */
export function getDefinitionTranslationPromise(text) {
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
 * Creates a paired English/Chinese definition block with lazy translation.
 * @param {string} definitionText
 * @returns {HTMLDivElement}
 */
export function createDefinitionPair(definitionText) {
    const trimmed = (definitionText || '').trim();
    const pair = document.createElement('div');
    pair.className = 'translator-definition-pair';

    const english = document.createElement('div');
    english.className = 'translator-definition translator-definition-en';
    english.textContent = definitionText || '—';
    pair.appendChild(english);

    const chinese = document.createElement('div');
    chinese.className = 'translator-definition translator-definition-zh';
    chinese.dataset.definitionKey = trimmed;
    pair.appendChild(chinese);

    if (trimmed) {
        const translateButton = document.createElement('button');
        translateButton.type = 'button';
        translateButton.className = 'translator-translate-definition-btn';
        translateButton.textContent = 'Translate';

        const resultText = document.createElement('div');
        resultText.className = 'translator-definition-translation-result';
        resultText.textContent = 'Click Translate to save DeepL quota.';

        translateButton.addEventListener('click', async event => {
            event.stopPropagation();
            translateButton.disabled = true;
            resultText.textContent = 'Translating…';
            try {
                const result = await getDefinitionTranslationPromise(trimmed);
                if (!chinese.isConnected || chinese.dataset.definitionKey != trimmed) return;
                if (result && result.success && result.data && result.data.translated) {
                    resultText.textContent = result.data.translated;
                    chinese.classList.remove('translator-definition-zh-error');
                } else {
                    resultText.textContent = getFriendlyTranslationError(result);
                    chinese.classList.add('translator-definition-zh-error');
                    translateButton.disabled = false;
                }
            } catch {
                if (!chinese.isConnected || chinese.dataset.definitionKey != trimmed) return;
                resultText.textContent = 'Translation failed';
                chinese.classList.add('translator-definition-zh-error');
                translateButton.disabled = false;
            }
        });

        chinese.append(translateButton, resultText);
    } else {
        chinese.textContent = '—';
    }

    return pair;
}

let cachedSpeechVoices = [];

function getSpeechSynthesisApi() {
    if (typeof globalThis !== 'undefined' && globalThis.speechSynthesis) {
        return globalThis.speechSynthesis;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        return window.speechSynthesis;
    }
    if (typeof speechSynthesis !== 'undefined') {
        return speechSynthesis;
    }
    return null;
}

function getSpeechSynthesisUtteranceCtor() {
    if (typeof globalThis !== 'undefined' && globalThis.SpeechSynthesisUtterance) {
        return globalThis.SpeechSynthesisUtterance;
    }
    if (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) {
        return window.SpeechSynthesisUtterance;
    }
    if (typeof SpeechSynthesisUtterance !== 'undefined') {
        return SpeechSynthesisUtterance;
    }
    return null;
}

function refreshSpeechVoices(speechApi) {
    if (!speechApi || typeof speechApi.getVoices !== 'function') {
        return cachedSpeechVoices;
    }

    const voices = speechApi.getVoices();
    if (voices.length > 0) {
        cachedSpeechVoices = voices;
    }
    return cachedSpeechVoices;
}

function findPreferredSpeechVoice(voices) {
    return voices.find(v => v.name.includes('p5712') && v.lang.startsWith('en'))
        || voices.find(v => v.name.includes('Piper') && v.lang.startsWith('en'))
        || voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha'))
        || voices.find(v => v.lang.startsWith('en-US'))
        || voices.find(v => v.lang.startsWith('en'));
}

function resumeSpeechIfPaused(speechApi) {
    if (typeof speechApi.resume !== 'function') return;

    speechApi.resume();
    setTimeout(() => {
        if (speechApi.paused) {
            speechApi.resume();
        }
    }, 0);
}

export function preloadSpeechVoices() {
    const speechApi = getSpeechSynthesisApi();
    if (!speechApi || !getSpeechSynthesisUtteranceCtor()) return false;

    refreshSpeechVoices(speechApi);

    if (typeof speechApi.addEventListener === 'function') {
        speechApi.addEventListener('voiceschanged', () => {
            refreshSpeechVoices(speechApi);
        }, { once: true });
    }

    return true;
}

async function speakTextWithExtensionTts(text, options) {
    if (typeof chrome === 'undefined'
        || !chrome.runtime
        || typeof chrome.runtime.sendMessage !== 'function') {
        return false;
    }

    const response = await sendMessageSafe({
        action: 'speakText',
        text,
        options
    }, 3000);

    if (response && response.success) {
        return true;
    }

    if (response?.errorCode && response.errorCode !== 'TTS_UNAVAILABLE') {
        console.warn('[Translater] Chrome TTS failed:', response.error || response.errorCode);
    }
    return false;
}

function speakTextWithWebSpeech(text, options = {}) {
    const speechApi = getSpeechSynthesisApi();
    const Utterance = getSpeechSynthesisUtteranceCtor();
    if (!speechApi || !Utterance || typeof speechApi.speak !== 'function') {
        return false;
    }

    if ((speechApi.speaking || speechApi.pending || speechApi.paused) && typeof speechApi.cancel === 'function') {
        speechApi.cancel();
    }
    resumeSpeechIfPaused(speechApi);

    const { lang = 'en-US', rate = 1.0, pitch = 1.0, volume = 0.8 } = options;
    const utterance = new Utterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    const usVoice = findPreferredSpeechVoice(refreshSpeechVoices(speechApi));

    if (usVoice) {
        utterance.voice = usVoice;
    }

    speechApi.speak(utterance);
    resumeSpeechIfPaused(speechApi);
    return true;
}

// Generic TTS speech driver
/**
 * Speaks the given text through extension TTS, with Web Speech as a fallback.
 * @param {string} text - The text to speak.
 * @param {Object} [options={}] - Speech options (lang, rate, pitch).
 * @returns {Promise<void>}
 */
export async function speakText(text, options = {}) {
    if (!text) return;

    const spokeWithExtensionTts = await speakTextWithExtensionTts(text, options);
    if (spokeWithExtensionTts) {
        return;
    }

    speakTextWithWebSpeech(text, options);
}

/**
 * Finds the best available audio URL from a list of phonetics.
 * Prioritizes US accents and specific providers.
 * @param {Array} phonetics - Array of phonetic objects from the API.
 * @returns {string} The selected audio URL or empty string.
 */
export function findBestAudioUrl(phonetics) {
    if (!phonetics || !Array.isArray(phonetics)) return '';

    // Prioritize US accents or known high-quality sources
    const best = phonetics.find(p => p.audio && (
        p.audio.includes('us_pron') ||
        p.audio.includes('-us') ||
        p.audio.includes('merriam-webster.com')
    ));

    return best ? best.audio : (phonetics.find(p => p.audio)?.audio || '');
}

// ==================== Shared UI Components & State ====================

let shadowHost = null;
let shadowRoot = null;
let currentPopup = null;
let currentFloatButtons = null;
let hideFloatButtonsTimeout = null;
let stylesLoaded = false;
let stylesLoadPromise = null;

/**
 * Ensures the Shadow DOM host is present and initialized.
 * @param {string} hostId - ID for the host element.
 * @param {boolean} isFullScreen - Whether the host should cover the full viewport.
 * @returns {Promise<ShadowRoot|null>} The initialized ShadowRoot.
 */
export async function ensureShadowRoot(hostId = 'translator-extension-host', isFullScreen = true) {
    if (!isContextValid()) return null;
    if (!shadowHost) {
        shadowHost = document.createElement('div');
        shadowHost.id = hostId;
        if (isFullScreen) {
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
        }
        (document.body || document.documentElement).appendChild(shadowHost);
        shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = getURLSafe('styles.css');
        shadowRoot.appendChild(styleLink);

        stylesLoadPromise = new Promise((resolve) => {
            styleLink.onload = () => { stylesLoaded = true; resolve(); };
            styleLink.onerror = () => { stylesLoaded = true; resolve(); };
            setTimeout(() => { if (!stylesLoaded) { stylesLoaded = true; resolve(); } }, 500);
        });
    }

    if (stylesLoadPromise && !stylesLoaded) {
        await stylesLoadPromise;
    }
    return shadowRoot;
}

/**
 * Creates a standard Close button for popups.
 * @param {Function} onClick - Callback for the click event.
 * @returns {HTMLButtonElement}
 */
export function createCloseButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'translator-close-btn';
    btn.title = 'Close';
    btn.textContent = '×';
    btn.style.zIndex = '2147483647';
    btn.style.pointerEvents = 'auto';
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * Creates a standard Speak button for popups.
 * @param {Function} [onClick] - Optional callback for the click event.
 * @returns {HTMLButtonElement}
 */
export function createSpeakButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'translator-speak-btn';
    btn.title = 'Speak';
    btn.innerHTML = createSpeakerSVG();
    if (onClick) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            Promise.resolve(onClick()).catch(error => {
                console.warn('[Translater] Speak failed:', error);
            });
        });
    }
    return btn;
}

/**
 * Creates and shows a sentence translation popup with loading content.
 * @param {number} x
 * @param {number} y
 * @param {{width?: number, height?: number, loadingText?: string}} [options]
 * @returns {Promise<{popup: HTMLElement|null, content: HTMLElement|null}>}
 */
export async function showSentencePopup(x, y, options = {}) {
    removeAllPopups();
    const root = await ensureShadowRoot();
    if (!root) {
        return { popup: null, content: null };
    }

    const {
        width = Math.min(420, window.innerWidth - 20),
        height = 180,
        loadingText = 'Translating...'
    } = options;

    const popup = document.createElement('div');
    popup.className = 'translator-sentence-popup';
    popup.style.pointerEvents = 'auto';

    const content = document.createElement('div');
    content.className = 'translator-sentence-content';
    const loading = document.createElement('div');
    loading.className = 'translator-loading';
    loading.textContent = loadingText;
    content.appendChild(loading);

    popup.appendChild(content);
    popup.appendChild(createCloseButton(removeAllPopups));
    root.appendChild(popup);
    setCurrentPopup(popup);

    const pos = calculatePopupPosition(x, y, width, height, {
        preferBelow: true,
        alignCenter: true,
        anchorX: x,
        anchorY: y
    });
    popup.style.left = pos.left + 'px';
    popup.style.top = pos.top + 'px';

    return { popup, content };
}

/**
 * Shows the shared floating selection toolbar.
 * @param {{text: string, x: number, y: number, onTranslate: Function, minTop?: number}} options
 * @returns {Promise<HTMLElement|null>}
 */
export async function showSelectionToolbar(options) {
    const { text, x, y, onTranslate, minTop = 44, translateTriggerMode } = options;
    const resolvedTriggerMode = await resolveTranslateTriggerMode(translateTriggerMode);
    removeFloatButtons();

    const root = await ensureShadowRoot();
    if (!root) return null;

    const buttonWidth = 32;
    const buttonGap = 30;
    const floatButtons = document.createElement('div');
    floatButtons.className = 'translator-float-buttons';
    floatButtons.style.pointerEvents = 'auto';

    const speakBtn = document.createElement('button');
    speakBtn.className = 'translator-float-btn speak-btn';
    speakBtn.innerHTML = createSpeakerSVG();
    speakBtn.setAttribute('data-tooltip', 'Speak');
    speakBtn.onclick = event => {
        event.stopPropagation();
        void speakText(text).catch(error => {
            console.warn('[Translater] Speak failed:', error);
        });
    };

    const transBtn = document.createElement('button');
    transBtn.className = 'translator-float-btn translate-btn';
    transBtn.textContent = 'T';
    transBtn.setAttribute('data-tooltip', resolvedTriggerMode === 'hover' ? 'Hover to translate' : 'Click to translate');
    if (resolvedTriggerMode === 'hover') {
        transBtn.onmouseenter = () => onTranslate(text, x, y);
    } else {
        transBtn.onclick = event => {
            event.stopPropagation();
            onTranslate(text, x, y);
        };
    }

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
    googleBtn.onclick = () => {
        openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(text)}`);
    };

    floatButtons.append(speakBtn, transBtn, closeBtn, googleBtn);
    root.appendChild(floatButtons);
    setCurrentFloatButtons(floatButtons);

    const containerWidth = buttonWidth * 3 + buttonGap + 6;
    const left = Math.max(10, Math.min(x - buttonWidth - buttonGap / 2, window.innerWidth - containerWidth - 10));
    const top = Math.max(minTop, Math.min(y - buttonWidth / 2, window.innerHeight - buttonWidth - minTop));

    floatButtons.style.left = left + 'px';
    floatButtons.style.top = top + 'px';
    floatButtons.style.gap = buttonGap + 'px';

    floatButtons.addEventListener('mouseleave', () => {
        setHideFloatButtonsTimeout(setTimeout(removeFloatButtons, 500));
    });
    floatButtons.addEventListener('mouseenter', () => {
        if (getHideFloatButtonsTimeout()) clearTimeout(getHideFloatButtonsTimeout());
    });

    return floatButtons;
}

/**
 * Removes all active popups and floating buttons from the Shadow DOM.
 */
export function removeAllPopups() {
    if (shadowRoot) {
        shadowRoot.querySelectorAll('.translator-popup, .translator-sentence-popup, .translator-float-buttons').forEach(el => el.remove());
    }
    currentPopup = null;
    currentFloatButtons = null;
    if (hideFloatButtonsTimeout) {
        clearTimeout(hideFloatButtonsTimeout);
        hideFloatButtonsTimeout = null;
    }
}

/**
 * Removes floating buttons specifically.
 */
export function removeFloatButtons() {
    if (hideFloatButtonsTimeout) {
        clearTimeout(hideFloatButtonsTimeout);
        hideFloatButtonsTimeout = null;
    }
    if (shadowRoot) {
        shadowRoot.querySelectorAll('.translator-float-buttons').forEach(el => el.remove());
    }
    currentFloatButtons = null;
}

/**
 * Gets or sets the current popup reference.
 */
export function getCurrentPopup() { return currentPopup; }
export function setCurrentPopup(el) { currentPopup = el; }

/**
 * Gets or sets the current float buttons reference.
 */
export function getCurrentFloatButtons() { return currentFloatButtons; }
export function setCurrentFloatButtons(el) { currentFloatButtons = el; }

/**
 * Gets or sets the hide timeout for float buttons.
 */
export function getHideFloatButtonsTimeout() { return hideFloatButtonsTimeout; }
export function setHideFloatButtonsTimeout(t) { hideFloatButtonsTimeout = t; }

/**
 * Gets the shadow root reference.
 */
export function getShadowRoot() { return shadowRoot; }
export function getShadowHost() { return shadowHost; }

export function isTranslatorUiClickPath(path) {
    return Array.from(path || []).some(el =>
        el === getShadowHost() ||
        (el.classList && (
            el.classList.contains('translator-popup') ||
            el.classList.contains('translator-float-buttons') ||
            el.classList.contains('translator-sentence-popup')
        ))
    );
}

export function dismissTranslatorUiOnOutsideEvent(event) {
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    if (!isTranslatorUiClickPath(path) && getCurrentPopup()) {
        removeAllPopups();
        return true;
    }
    return false;
}

export function dismissTranslatorUiOnFrameBlur() {
    if (!getCurrentPopup()) return false;

    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'IFRAME' || activeTag === 'FRAME') {
        removeAllPopups();
        return true;
    }
    return false;
}

export function __resetUiStateForTests() {
    if (hideFloatButtonsTimeout) {
        clearTimeout(hideFloatButtonsTimeout);
        hideFloatButtonsTimeout = null;
    }
    removeAllPopups();
    if (shadowHost?.isConnected) {
        shadowHost.remove();
    }
    shadowHost = null;
    shadowRoot = null;
    currentPopup = null;
    currentFloatButtons = null;
    stylesLoaded = false;
    stylesLoadPromise = null;
}

export function __setStylesLoadedForTests() {
    stylesLoaded = true;
    stylesLoadPromise = Promise.resolve();
}
