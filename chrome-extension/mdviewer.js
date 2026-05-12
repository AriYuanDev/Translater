import { setupViewerSidebar } from './viewer-sidebar.js';
import { sanitizeMarkdownHtml, rewriteRelativePaths } from './markdown-helpers.js';
import { resetCurrentTabBrowserZoom } from './viewer-browser-zoom.js';
import {
    captureElementScrollAnchor,
    createZoomStateParams,
    getExplicitZoomParam,
    getClampedZoomPercent,
    restoreElementScrollAnchor
} from './viewer-zoom-helpers.js';

/**
 * Translater Markdown Reader Script
 */

// Import utility functions
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
    throw new Error('Failed to initialize extension utilities');
}

if (!utils || !interactionController) {
    throw new Error('Extension utilities not available');
}

const {
    escapeHtml,
    isAllEnglish,
    isProbablyWord,
    isContextValid,
    getTextSelectionAction,
    dismissTranslatorUiOnOutsideEvent,
    dismissTranslatorUiOnFrameBlur,
    showSelectionToolbar,
    openExternalUrl,
    appendNoRedirectParam
} = utils;

const {
    handleSelectionTranslation,
    handleWordLookupInteraction
} = interactionController;

// DOM Elements
const mdContent = document.getElementById('mdContent');
const viewerContainer = document.getElementById('viewerContainer');
const mdTitleSpan = document.getElementById('mdTitle');
const zoomLevelSpan = document.getElementById('zoomLevel');
const sidebar = document.getElementById('sidebar');
const outlineContainer = document.getElementById('outlineContainer');
const sidebarToggle = document.getElementById('sidebarToggle');
const fileBrowserContainer = document.getElementById('fileBrowserContainer');
const sidebarFolderName = document.getElementById('sidebarFolderName');

// Constants
const SENTENCE_POPUP_WIDTH = 420;
const SENTENCE_POPUP_HEIGHT = 180;

const MIN_ZOOM = 60;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
const DEFAULT_ZOOM = 100;
const initialViewerParams = new URLSearchParams(window.location.search);
const initialZoomParam = getExplicitZoomParam(initialViewerParams);
let currentZoom = getClampedZoomPercent(
    initialZoomParam,
    DEFAULT_ZOOM,
    MIN_ZOOM,
    MAX_ZOOM
);


// ==================== Markdown Loading and Rendering ====================

function getMdUrl() {
    return new URLSearchParams(window.location.search).get('url');
}

function isFileUrl(url) {
    return typeof url === 'string' && url.startsWith('file://');
}

async function loadMarkdown(url) {
    try {
        showLoading(true);
        const response = await fetch(url);
        const isReadableFileResponse = isFileUrl(url) && response.status === 0;
        if (!response.ok && !isReadableFileResponse) throw new Error(`HTTP ${response.status}`);
        const rawText = await response.text();

        // Parse markdown
        const html = window.marked.parse(rawText);
        mdContent.innerHTML = sanitizeMarkdownHtml(html);

        // Fix relative paths
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        rewriteRelativePaths(mdContent, baseUrl);

        // Set title
        const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
        mdTitleSpan.textContent = filename;
        document.title = filename;

        // Build TOC
        buildTableOfContents();
        updateZoomLevel();

        showLoading(false);
    } catch (error) {
        console.error('Failed to load Markdown:', error);
        let msg = 'Unable to load Markdown file.';
        if (url.startsWith('file://')) {
            msg += ' For local files, enable "Allow access to file URLs" in chrome://extensions.';
        }
        showError(msg);
    }
}

// ==================== Table of Contents ====================

function buildTableOfContents() {
    const headings = mdContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) return;

    outlineContainer.innerHTML = '';
    headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName[1]);
        const id = `md-heading-${index}`;
        heading.id = id;

        const item = document.createElement('div');
        item.className = `outline-item level-${level}`;
        item.textContent = heading.textContent;
        item.onclick = () => {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        outlineContainer.appendChild(item);
    });
}

// ==================== Zoom ====================

function updateZoomLevel() {
    zoomLevelSpan.textContent = currentZoom + '%';
    const scale = currentZoom / 100;
    mdContent.style.transform = `scale(${scale})`;
    mdContent.style.transformOrigin = 'top center';
    // Adjust wrapper height so the scrollable area matches the scaled content
    const naturalHeight = mdContent.scrollHeight;
    mdContent.style.marginBottom = `${naturalHeight * (scale - 1)}px`;
}

function applyZoom(newZoom) {
    const targetZoom = getClampedZoomPercent(newZoom, currentZoom, MIN_ZOOM, MAX_ZOOM);
    if (targetZoom === currentZoom) return;

    const anchor = captureElementScrollAnchor(viewerContainer, mdContent);
    currentZoom = targetZoom;
    updateZoomLevel();
    restoreElementScrollAnchor(viewerContainer, mdContent, anchor);
}

document.getElementById('zoomOut').onclick = () => applyZoom(currentZoom - ZOOM_STEP);

document.getElementById('zoomIn').onclick = () => applyZoom(currentZoom + ZOOM_STEP);

// ==================== Toolbar ====================

document.getElementById('openOriginal').onclick = () => {
    const url = getMdUrl();
    if (url) {
        openExternalUrl(appendNoRedirectParam(url));
    }
};

// ==================== Translation Logic (Shadow DOM) ====================

mdContent.addEventListener('dblclick', async (e) => {
    if (!isContextValid()) return;
    const word = window.getSelection().toString().trim();
    if (!word || !isAllEnglish(word) || !isProbablyWord(word)) return;
    await handleWordLookupInteraction({
        word,
        x: e.clientX,
        y: e.clientY
    });
});

mdContent.onmouseup = async (e) => {
    if (!isContextValid()) return;
    if (e.detail > 1) return;
    setTimeout(async () => {
        try {
            const text = window.getSelection().toString().trim();
            const action = getTextSelectionAction(text);
            if (e.target.id === 'translator-extension-host') return;
            if (action === 'none') return;
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
                minTop: 60,
                onTranslate: (selectedText, x, y) => handleSelectionTranslation({
                    text: selectedText,
                    x,
                    y,
                    popupWidth: Math.min(SENTENCE_POPUP_WIDTH, window.innerWidth - 20),
                    popupHeight: SENTENCE_POPUP_HEIGHT
                })
            });
        } catch (err) {
            console.error('[Translater] Mouseup error:', err);
        }
    }, 50);
};

window.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
document.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
window.addEventListener('blur', dismissTranslatorUiOnFrameBlur);

// ==================== Loading / Error UI ====================

function showLoading(show) {
    let overlay = document.querySelector('.loading-overlay');
    if (show && !overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        const text = document.createElement('div');
        text.className = 'loading-text';
        text.textContent = 'Loading Markdown...';
        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.body.appendChild(overlay);
    } else if (!show && overlay) overlay.remove();
}

function showError(message) {
    showLoading(false);
    mdContent.innerHTML = `<div class="error-container"><div class="error-icon">📄</div><div class="error-message">${escapeHtml(message)}</div><button class="error-retry-btn" id="retryBtn">Retry</button></div>`;
    document.getElementById('retryBtn').onclick = () => location.reload();
}

// ==================== Initialize ====================

const url = getMdUrl();
if (url) {
    resetCurrentTabBrowserZoom();
    setupViewerSidebar({
        currentUrl: url,
        sidebar,
        viewerContainer,
        sidebarToggle,
        fileBrowserContainer,
        sidebarFolderName,
        getViewerStateParams: () => createZoomStateParams(currentZoom, {
            defaultZoom: DEFAULT_ZOOM
        })
    });
    loadMarkdown(url);
} else {
    showError('No Markdown file specified');
}
console.log('Translater Markdown Reader Loaded (Shadow DOM)');
