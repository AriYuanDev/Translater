/**
 * Translater - Shared Utility Functions
 */

// HTML escape function to prevent XSS attacks
export function escapeHtml(text) {
    if (!text) return '';
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
}

// Detect if text is entirely English (and does not contain CJK characters)
export function isAllEnglish(text) {
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
    return !cjkRegex.test(text);
}

// Create pronunciation icon SVG
export function createSpeakerSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; fill:currentColor;">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>`;
}

// Check if extension context is valid
export function isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

// Safely get extension resource URL
export function getURLSafe(path) {
    if (!isContextValid()) return '';
    try {
        return chrome.runtime.getURL(path);
    } catch {
        return '';
    }
}

// Calculate popup position
export function calculatePopupPosition(x, y, popupWidth, popupHeight) {
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + padding;
    let top = y + padding;

    if (left + popupWidth > viewportWidth - padding) {
        left = x - popupWidth - padding;
    }

    if (top + popupHeight > viewportHeight - padding) {
        top = y - popupHeight - padding;
    }

    left = Math.max(padding, left);
    top = Math.max(padding, top);

    return { left, top };
}

// Safely send message to background with timeout
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

// Ensure speech voices are loaded
function waitForVoices() {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        const handler = () => {
            window.speechSynthesis.onvoiceschanged = null;
            resolve(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.onvoiceschanged = handler;
        // Some browsers need an explicit call to getVoices to trigger the event
        window.speechSynthesis.getVoices();
    });
}

// Generic TTS speech driver
export async function speakText(text, options = {}) {
    if (!text) return;

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const { lang = 'en-US', rate = 0.9, pitch = 1 } = options;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

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
