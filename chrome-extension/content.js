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
    let interactionController;
    try {
        const utilsUrl = chrome.runtime.getURL('utils.js');
        const interactionControllerUrl = chrome.runtime.getURL('interaction-controller.js');
        [utils, interactionController] = await Promise.all([
            import(utilsUrl),
            import(interactionControllerUrl)
        ]);
    } catch (e) {
        console.log('[Translater] Extension context invalidated, please refresh the page');
        return;
    }

    const {
        isAllEnglish,
        isContextValid,
        removeAllPopups,
        getCurrentPopup,
        isProbablyWord,
        isTranslatorUiClickPath,
        showSelectionToolbar
    } = utils;

    const {
        handleSelectionTranslation,
        handleWordLookupInteraction
    } = interactionController;


    // Preload speech engine
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.getVoices();
        speechSynthesis.addEventListener('voiceschanged', () => {
            console.log('[Translater] Speech engine ready');
        }, { once: true });
    }

    // ==================== Shadow DOM Setup ====================

    // State management is now partially delegated to utils.js (singletons in this context)

    // ==================== Event Listeners ====================

    document.addEventListener('dblclick', async (e) => {
        if (!isContextValid()) return;
        const selection = window.getSelection();
        const word = selection.toString().trim();

        if (!word || !isAllEnglish(word) || !isProbablyWord(word)) return;

        await handleWordLookupInteraction({
            word,
            x: e.clientX,
            y: e.clientY
        });
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
                    onTranslate: (selectedText, x, y) => handleSelectionTranslation({
                        text: selectedText,
                        x,
                        y
                    })
                });
            } catch (err) {
                console.error('[Translater] Mouseup event failed:', err);
            }
        }, 20);
    });

    // Dismissal
    document.addEventListener('mousedown', (e) => {
        if (!isTranslatorUiClickPath(e.composedPath()) && getCurrentPopup()) {
            removeAllPopups();
        }

        // Only continue for other logic if context is valid
        if (!isContextValid()) return;
    });
    console.log('Translater Extension Loaded (Shadow DOM)');
})();
