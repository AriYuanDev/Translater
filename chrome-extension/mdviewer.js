import { setupViewerSidebar } from './viewer-sidebar.js';
import {
    getFilenameFromUrl,
    getViewerSourceUrl,
    isFileUrl
} from './viewer-routing.js';
import { sanitizeMarkdownHtml, rewriteRelativePaths } from './markdown-helpers.js';
import { resetCurrentTabBrowserZoom } from './viewer-browser-zoom.js';
import {
    applyElementZoom,
    captureElementScrollAnchor,
    createZoomStateParams,
    getExplicitZoomParam,
    getClampedZoomPercent,
    restoreElementScrollAnchor
} from './viewer-zoom-helpers.js';
import {
    setViewerLoading,
    showViewerError
} from './viewer-ui.js';

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
    dismissTranslatorUiOnOutsideEvent,
    dismissTranslatorUiOnFrameBlur,
    openExternalUrl,
    appendNoRedirectParam
} = utils;

const {
    handleReaderSelectionRelease,
    handleWordLookupFromSelection
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
        const filename = getFilenameFromUrl(url, 'Untitled Markdown');
        mdTitleSpan.textContent = filename;
        document.title = filename;

        // Build TOC
        buildTableOfContents();
        updateZoomLevel();

        showLoading(false);
    } catch (error) {
        console.error('Failed to load Markdown:', error);
        let msg = 'Unable to load Markdown file.';
        if (isFileUrl(url)) {
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
    applyElementZoom(mdContent, currentZoom);
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
    const url = getViewerSourceUrl();
    if (url) {
        openExternalUrl(appendNoRedirectParam(url));
    }
};

// ==================== Translation Logic (Shadow DOM) ====================

mdContent.addEventListener('dblclick', (e) => {
    void handleWordLookupFromSelection(e).catch(error => {
        console.error('[Translater] Word lookup interaction failed:', error);
    });
});

mdContent.onmouseup = (e) => {
    handleReaderSelectionRelease(e, {
        getSentencePopupOptions: () => ({
            popupWidth: Math.min(SENTENCE_POPUP_WIDTH, window.innerWidth - 20),
            popupHeight: SENTENCE_POPUP_HEIGHT
        })
    });
};

window.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
document.addEventListener('mousedown', dismissTranslatorUiOnOutsideEvent, true);
window.addEventListener('blur', dismissTranslatorUiOnFrameBlur);

// ==================== Loading / Error UI ====================

function showLoading(show) {
    setViewerLoading(viewerContainer, show, 'Loading Markdown...');
}

function showError(message) {
    showViewerError({
        loadingContainer: viewerContainer,
        contentContainer: mdContent,
        message
    });
}

// ==================== Initialize ====================

const url = getViewerSourceUrl();
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
