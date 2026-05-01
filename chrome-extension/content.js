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
        isProbablyWord,
        getFreshSelectionText,
        getTextSelectionAction,
        shouldHandleMouseSelectionRelease,
        dismissTranslatorUiOnOutsideEvent,
        dismissTranslatorUiOnFrameBlur,
        showSelectionToolbar
    } = utils;

    const {
        handleSelectionTranslation,
        handleWordLookupInteraction
    } = interactionController;

    let mouseSelectionStart = null;
    let lastHandledSelectionAt = 0;
    let lastSelectedText = '';
    let lastSelectionChangedAt = 0;

    function rememberMouseSelectionStart(e) {
        mouseSelectionStart = {
            x: e.clientX,
            y: e.clientY
        };
    }

    function rememberSelectionText() {
        const text = window.getSelection()?.toString().trim() || '';
        if (!text) return;

        lastSelectedText = text;
        lastSelectionChangedAt = Date.now();
    }

    async function handleSelectedTextInteraction(e, delayMs, allowCachedSelection = false) {
        setTimeout(async () => {
            try {
                if (Date.now() - lastHandledSelectionAt < 150) return;

                const selection = window.getSelection();
                const currentText = selection.toString().trim();
                const text = allowCachedSelection
                    ? getFreshSelectionText(currentText, lastSelectedText, lastSelectionChangedAt)
                    : currentText;
                const action = getTextSelectionAction(text);

                if (e.target.id === 'translator-extension-host') return;
                if (action === 'none') return;

                lastHandledSelectionAt = Date.now();

                if (action === 'word-lookup') {
                    await handleWordLookupInteraction({
                        word: text,
                        x: e.clientX,
                        y: e.clientY
                    });
                    return;
                }

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
                console.error('[Translater] Selection interaction failed:', err);
            }
        }, delayMs);
    }

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

    document.addEventListener('selectionchange', rememberSelectionText);
    document.addEventListener('mousedown', rememberMouseSelectionStart, true);

    document.addEventListener('mouseup', (e) => {
        if (!isContextValid()) return;
        const shouldHandleDragSelection = shouldHandleMouseSelectionRelease(mouseSelectionStart, {
            x: e.clientX,
            y: e.clientY,
            detail: e.detail
        });
        mouseSelectionStart = null;
        if (!shouldHandleDragSelection) return;

        handleSelectedTextInteraction(e, 40, true);
    }, true);

    document.addEventListener('mouseup', (e) => {
        if (!isContextValid()) return;
        if (e.detail > 1) return;
        if (Date.now() - lastHandledSelectionAt < 200) return;
        handleSelectedTextInteraction(e, 20);
    });

    // Dismissal
    window.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
    document.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
    window.addEventListener('blur', dismissTranslatorUiOnFrameBlur);
    console.log('Translater Extension Loaded (Shadow DOM)');
})();
