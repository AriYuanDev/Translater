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

// Ensure speech voices are loaded with timeout protection
function waitForVoices(timeoutMs = 3000) {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        const timeoutId = setTimeout(() => {
            window.speechSynthesis.onvoiceschanged = null;
            resolve(window.speechSynthesis.getVoices()); // Return whatever is available
        }, timeoutMs);
        const handler = () => {
            clearTimeout(timeoutId);
            window.speechSynthesis.onvoiceschanged = null;
            resolve(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.onvoiceschanged = handler;
        // Some browsers need an explicit call to getVoices to trigger the event
        window.speechSynthesis.getVoices();
    });
}

// Generic TTS speech driver
/**
 * Uses the Web Speech API to speak the given text.
 * @param {string} text - The text to speak.
 * @param {Object} [options={}] - Speech options (lang, rate, pitch).
 * @returns {Promise<void>}
 */
export async function speakText(text, options = {}) {
    if (!text) return;

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const { lang = 'en-US', rate = 1.0, pitch = 1.0, volume = 0.8 } = options;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    // Select the best voice
    const voices = await waitForVoices();
    const usVoice = voices.find(v => v.name.includes('p5712') && v.lang.startsWith('en'))
        || voices.find(v => v.name.includes('Piper') && v.lang.startsWith('en'))
        || voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha'))
        || voices.find(v => v.lang.startsWith('en-US'))
        || voices.find(v => v.lang.startsWith('en'));

    if (usVoice) {
        utterance.voice = usVoice;
    }

    window.speechSynthesis.speak(utterance);
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
            onClick();
        });
    }
    return btn;
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
