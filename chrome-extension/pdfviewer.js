/**
 * Translater PDF Reader Script
 */

// Import utility functions
let utils;
try {
    const utilsUrl = chrome.runtime.getURL('utils.js');
    utils = await import(utilsUrl);
} catch (e) {
    console.log('[Translater] Extension context invalidated, please refresh the page');
    throw new Error('Failed to initialize extension utilities');
}

if (!utils) {
    throw new Error('Extension utilities not available');
}

const {
    escapeHtml,
    isAllEnglish,
    isProbablyWord,
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
    findBestAudioUrl,
    getShadowHost,
    createDefinitionPair,
    showSelectionToolbar,
    showSentencePopup,
    openExternalUrl
} = utils;

// PDF.js configuration
const pdfjsLib = await import('./pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

// State variables
let pdfDoc = null;
let currentScale = 1.0;
let renderedPages = new Map();
const outlineEntries = [];
let activeOutlineIndex = -1;

// DOM Elements
const viewer = document.getElementById('viewer');
const viewerContainer = document.getElementById('viewerContainer');
const currentPageInput = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const zoomLevelSpan = document.getElementById('zoomLevel');
const pdfTitleSpan = document.getElementById('pdfTitle');
const sidebar = document.getElementById('sidebar');
const outlineContainer = document.getElementById('outlineContainer');
const sidebarToggle = document.getElementById('sidebarToggle');

// Constants
const DEFAULT_SCALE = 1.9;
const ZOOM_STEP = 0.25;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;
const POPUP_WIDTH = 760;
const POPUP_HEIGHT = 260;
const SENTENCE_POPUP_WIDTH = 420;
const SENTENCE_POPUP_HEIGHT = 180;

let pageObserver = null;
const textLayerEndDivs = new Map();
let textLayerSelectionAbortController = null;
let previousSelectionRange = null;

function normalizeClipboardText(text) {
    return pdfjsLib.normalizeUnicode(String(text || '').replace(/\u0000/g, ''));
}

function stopTextLayerEvent(event) {
    event.preventDefault();
    event.stopPropagation();
}

function resetTextLayerSelection(endDiv, textLayer) {
    if (!endDiv || !textLayer) return;
    textLayer.append(endDiv);
    endDiv.style.width = '';
    endDiv.style.height = '';
    endDiv.style.userSelect = '';
    textLayer.classList.remove('selecting');
}

function resetAllTextLayerSelections() {
    textLayerEndDivs.forEach((endDiv, textLayer) => resetTextLayerSelection(endDiv, textLayer));
    previousSelectionRange = null;
}

function clearTextLayerRegistry() {
    resetAllTextLayerSelections();
    textLayerEndDivs.clear();
    textLayerSelectionAbortController?.abort();
    textLayerSelectionAbortController = null;
}

function enableGlobalTextLayerSelectionListener() {
    if (textLayerSelectionAbortController) return;

    textLayerSelectionAbortController = new AbortController();
    const { signal } = textLayerSelectionAbortController;
    let isPointerDown = false;
    let isFirefox;

    const reset = (endDiv, textLayer) => {
        resetTextLayerSelection(endDiv, textLayer);
    };

    document.addEventListener('pointerdown', () => {
        isPointerDown = true;
    }, { signal });

    document.addEventListener('pointerup', () => {
        isPointerDown = false;
        textLayerEndDivs.forEach(reset);
        previousSelectionRange = null;
    }, { signal });

    window.addEventListener('blur', () => {
        isPointerDown = false;
        textLayerEndDivs.forEach(reset);
        previousSelectionRange = null;
    }, { signal });

    document.addEventListener('keyup', () => {
        if (!isPointerDown) {
            textLayerEndDivs.forEach(reset);
            previousSelectionRange = null;
        }
    }, { signal });

    document.addEventListener('selectionchange', () => {
        const selection = document.getSelection();
        if (!selection || selection.rangeCount === 0) {
            textLayerEndDivs.forEach(reset);
            previousSelectionRange = null;
            return;
        }

        const activeTextLayers = new Set();
        for (let index = 0; index < selection.rangeCount; index++) {
            const range = selection.getRangeAt(index);
            for (const textLayer of textLayerEndDivs.keys()) {
                if (activeTextLayers.has(textLayer)) continue;
                try {
                    if (range.intersectsNode(textLayer)) {
                        activeTextLayers.add(textLayer);
                    }
                } catch {
                    // Ignore detached nodes during rerender.
                }
            }
        }

        for (const [textLayer, endDiv] of textLayerEndDivs) {
            if (activeTextLayers.has(textLayer)) {
                textLayer.classList.add('selecting');
            } else {
                reset(endDiv, textLayer);
            }
        }

        isFirefox ??= getComputedStyle(textLayerEndDivs.values().next().value)
            .getPropertyValue('-moz-user-select') === 'none';
        if (isFirefox) {
            previousSelectionRange = selection.getRangeAt(0).cloneRange();
            return;
        }

        const range = selection.getRangeAt(0);
        const modifyStart = previousSelectionRange && (
            range.compareBoundaryPoints(Range.END_TO_END, previousSelectionRange) === 0 ||
            range.compareBoundaryPoints(Range.START_TO_END, previousSelectionRange) === 0
        );

        let anchor = modifyStart ? range.startContainer : range.endContainer;
        if (anchor?.nodeType === Node.TEXT_NODE) {
            anchor = anchor.parentNode;
        }
        if (anchor?.classList?.contains('highlight')) {
            anchor = anchor.parentNode;
        }

        if (!modifyStart && anchor && range.endOffset === 0) {
            do {
                while (anchor && !anchor.previousSibling) {
                    anchor = anchor.parentNode;
                }
                anchor = anchor?.previousSibling || null;
            } while (anchor && !anchor.childNodes.length);
        }

        const parentTextLayer = anchor?.parentElement?.closest('.textLayer') || null;
        const endDiv = parentTextLayer ? textLayerEndDivs.get(parentTextLayer) : null;
        if (endDiv && anchor?.parentElement) {
            endDiv.style.width = parentTextLayer.style.width;
            endDiv.style.height = parentTextLayer.style.height;
            endDiv.style.userSelect = 'text';
            anchor.parentElement.insertBefore(endDiv, modifyStart ? anchor : anchor.nextSibling);
        }

        previousSelectionRange = range.cloneRange();
    }, { signal });
}

function bindTextLayerInteractions(textLayer, endOfContent) {
    textLayer.tabIndex = 0;
    textLayer.addEventListener('mousedown', () => {
        textLayer.classList.add('selecting');
    });
    textLayer.addEventListener('copy', event => {
        const selection = document.getSelection();
        if (selection && event.clipboardData) {
            event.clipboardData.setData('text/plain', normalizeClipboardText(selection.toString()));
        }
        stopTextLayerEvent(event);
    });

    textLayerEndDivs.set(textLayer, endOfContent);
    enableGlobalTextLayerSelectionListener();
}

function clampScale(scale) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function captureScrollAnchor() {
    if (!renderedPages.size) return null;
    const centerY = viewerContainer.getBoundingClientRect().top + viewerContainer.clientHeight / 2;
    for (const [pageNum, container] of renderedPages) {
        const rect = container.getBoundingClientRect();
        if (rect.top <= centerY && rect.bottom >= centerY) {
            const offsetRatio = rect.height ? (centerY - rect.top) / rect.height : 0;
            return { pageNum, offsetRatio: Math.min(Math.max(offsetRatio, 0), 1) };
        }
    }
    const iterator = renderedPages.entries().next();
    if (!iterator.done) {
        const [firstPage] = iterator.value;
        return { pageNum: firstPage, offsetRatio: 0 };
    }
    return null;
}

function restoreScrollAnchor(anchor) {
    if (!anchor) return;
    const container = renderedPages.get(anchor.pageNum);
    if (!container) return;
    const vcRect = viewerContainer.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relativeTop = containerRect.top - vcRect.top + viewerContainer.scrollTop;
    const ratio = Math.min(Math.max(anchor.offsetRatio ?? 0, 0), 1);
    const target = relativeTop + ratio * containerRect.height - viewerContainer.clientHeight / 2;
    viewerContainer.scrollTo({ top: Math.max(target, 0), behavior: 'auto' });
}

function updateOutlineSelection(targetPage) {
    if (!outlineEntries.length || !targetPage) return;
    let newIndex = -1;
    for (let i = 0; i < outlineEntries.length; i++) {
        if (outlineEntries[i].page <= targetPage) newIndex = i; else break;
    }
    if (newIndex === activeOutlineIndex) return;
    if (activeOutlineIndex >= 0 && outlineEntries[activeOutlineIndex]) {
        outlineEntries[activeOutlineIndex].element.classList.remove('active');
    }
    activeOutlineIndex = newIndex;
    if (activeOutlineIndex >= 0 && outlineEntries[activeOutlineIndex]) {
        const entry = outlineEntries[activeOutlineIndex];
        entry.element.classList.add('active');
        entry.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

async function resolveOutlinePage(item) {
    try {
        let dest = item.dest;
        if (!dest) return null;
        if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest);
        if (!Array.isArray(dest)) return null;
        const [ref] = dest;
        if (!ref) return null;
        const pageIndex = await pdfDoc.getPageIndex(ref);
        return pageIndex + 1;
    } catch (error) {
        console.warn('[Translater] Failed to resolve outline destination', error);
        return null;
    }
}

async function applyScale(newScale) {
    if (!pdfDoc) return;
    const targetScale = clampScale(typeof newScale === 'number' ? newScale : currentScale);
    if (Math.abs(targetScale - currentScale) < 0.001) return;
    const anchor = captureScrollAnchor();
    currentScale = targetScale;
    updateZoomLevel();
    await renderAllPages();
    restoreScrollAnchor(anchor);
}

// ==================== PDF Loading and Rendering ====================

function getPdfUrl() {
    return new URLSearchParams(window.location.search).get('url');
}

function isFileUrl(url) {
    return typeof url === 'string' && url.startsWith('file://');
}

function getPdfFilename(url) {
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.split('/').pop();
        return decodeURIComponent(filename || 'Untitled PDF');
    } catch {
        return decodeURIComponent(url.split('/').pop().split('?')[0]);
    }
}

async function fetchPdfData(url) {
    const response = await fetch(url);
    const isReadableFileResponse = isFileUrl(url) && response.status === 0;

    if (!response.ok && !isReadableFileResponse) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = new Uint8Array(await response.arrayBuffer());
    if (!data.byteLength) {
        throw new Error('Empty PDF response');
    }

    return data;
}

function getPdfLoadErrorMessage(url, error) {
    const parts = [];
    const rawMessage = error?.message || error?.reason || '';
    const normalizedMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';

    parts.push('Unable to load PDF file.');

    if (isFileUrl(url)) {
        parts.push('For local files, enable "Allow access to file URLs" in chrome://extensions.');
    }

    if (normalizedMessage) {
        parts.push(`Details: ${normalizedMessage}`);
    }

    return parts.join(' ');
}

/**
 * Loads and initializes a PDF document from a URL.
 * @param {string} url - The URL of the PDF to load.
 */
async function loadPdf(url) {
    try {
        showLoading(true);
        const pdfData = await fetchPdfData(url);
        const loadingTask = pdfjsLib.getDocument({
            data: pdfData,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
            cMapPacked: true,
        });

        pdfDoc = await loadingTask.promise;
        totalPagesSpan.textContent = pdfDoc.numPages;
        const filename = getPdfFilename(url);
        pdfTitleSpan.textContent = filename;
        document.title = filename;

        await renderOutline();
        currentScale = 1.9; // Default 190%
        updateZoomLevel();
        await renderAllPages();
        showLoading(false);
    } catch (error) {
        console.error('Failed to load PDF:', error);
        showError(getPdfLoadErrorMessage(url, error));
    }
}

/**
 * Calculates the zoom scale needed to fit the PDF width to the viewer container.
 */
async function calculateFitWidth() {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = viewerContainer.clientWidth - 40;
    return containerWidth / viewport.width;
}

/**
 * Renders placeholders for all pages and sets up an IntersectionObserver for lazy rendering.
 */
async function renderAllPages() {
    clearTextLayerRegistry();
    viewer.innerHTML = '';
    renderedPages.clear();

    if (pageObserver) pageObserver.disconnect();

    pageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageContainer = entry.target;
                const pageNum = parseInt(pageContainer.dataset.pageNum);
                if (!pageContainer.dataset.rendered) {
                    renderPageContent(pageNum, pageContainer);
                    pageContainer.dataset.rendered = 'true';
                }
            }
        });
    }, { root: viewerContainer, rootMargin: '200px' });

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        const container = document.createElement('div');
        container.className = 'pdf-page-container';
        container.dataset.pageNum = pageNum;
        container.style.width = viewport.width + 'px';
        container.style.height = viewport.height + 'px';

        const loading = document.createElement('div');
        loading.className = 'page-loading';
        loading.textContent = `Loading Page ${pageNum}...`;
        container.appendChild(loading);
        viewer.appendChild(container);
        renderedPages.set(pageNum, container);
        pageObserver.observe(container);
    }
}

/**
 * Renders the content of a specific PDF page into its container.
 * @param {number} pageNum - The page number to render.
 * @param {HTMLElement} container - The container for the page.
 */
async function renderPageContent(pageNum, container) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        const textViewport = viewport.clone({ dontFlip: true });
        container.innerHTML = '';

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width * window.devicePixelRatio;
        canvas.height = viewport.height * window.devicePixelRatio;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        context.scale(window.devicePixelRatio, window.devicePixelRatio);
        container.appendChild(canvas);

        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.width = viewport.width + 'px';
        textLayer.style.height = viewport.height + 'px';
        textLayer.style.setProperty('--scale-factor', textViewport.scale);
        container.appendChild(textLayer);

        await page.render({ canvasContext: context, viewport }).promise;

        const textLayerTask = pdfjsLib.renderTextLayer({
            textContentSource: page.streamTextContent({ includeMarkedContent: true }),
            container: textLayer,
            viewport: textViewport
        });
        await textLayerTask.promise;

        const endOfContent = document.createElement('div');
        endOfContent.className = 'endOfContent';
        textLayer.appendChild(endOfContent);
        bindTextLayerInteractions(textLayer, endOfContent);
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="padding:20px;color:red;">Failed to load page</div>';
    }
}

// ==================== Toolbar and Sidebar ====================

document.getElementById('prevPage').onclick = () => {
    const page = parseInt(currentPageInput.value);
    if (page > 1) scrollToPage(page - 1);
};
document.getElementById('nextPage').onclick = () => {
    const page = parseInt(currentPageInput.value);
    if (page < pdfDoc.numPages) scrollToPage(page + 1);
};
currentPageInput.onchange = () => {
    let page = Math.max(1, Math.min(parseInt(currentPageInput.value), pdfDoc.numPages));
    scrollToPage(page);
};
document.getElementById('zoomOut').onclick = async () => {
    await applyScale(currentScale - ZOOM_STEP);
};
document.getElementById('zoomIn').onclick = async () => {
    await applyScale(currentScale + ZOOM_STEP);
};
document.getElementById('fitWidth').onclick = async () => {
    const fitScale = await calculateFitWidth();
    await applyScale(fitScale);
};
document.getElementById('downloadPdf').onclick = () => {
    const url = getPdfUrl();
    if (url) { const a = document.createElement('a'); a.href = url; a.download = decodeURIComponent(url.split('/').pop().split('?')[0]); a.click(); }
};
sidebarToggle.onclick = () => { sidebar.classList.toggle('open'); viewerContainer.classList.toggle('sidebar-open'); };

function scrollToPage(pageNum) {
    const container = renderedPages.get(pageNum);
    if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        currentPageInput.value = pageNum;
    }
    updateOutlineSelection(pageNum);
}
function updateZoomLevel() { zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%'; }

viewerContainer.onscroll = () => {
    const centerY = viewerContainer.getBoundingClientRect().top + viewerContainer.clientHeight / 3;
    let activePage = null;
    for (const [pageNum, container] of renderedPages) {
        const rect = container.getBoundingClientRect();
        if (rect.top <= centerY && rect.bottom >= centerY) {
            currentPageInput.value = pageNum;
            activePage = pageNum;
            break;
        }
    }
    if (activePage) updateOutlineSelection(activePage);
};

async function renderOutline() {
    try {
        const outline = await pdfDoc.getOutline();
        outlineContainer.innerHTML = '';
        outlineEntries.length = 0;
        activeOutlineIndex = -1;
        if (!outline || outline.length === 0) { outlineContainer.textContent = 'No outline available'; return; }

        async function createTree(items, level = 0) {
            const fragment = document.createDocumentFragment();
            if (level > 1) return fragment;
            for (const item of items) {
                const div = document.createElement('div');
                div.className = `outline-item level-${level}`;
                div.textContent = item.title;
                const pageNum = await resolveOutlinePage(item);
                if (pageNum) {
                    div.dataset.page = pageNum;
                    outlineEntries.push({ element: div, page: pageNum });
                    div.onclick = () => scrollToPage(pageNum);
                } else if (item.url) {
                    div.onclick = () => {
                        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                            chrome.tabs.create({ url: item.url });
                        } else {
                            openExternalUrl(item.url);
                        }
                    };
                }
                fragment.appendChild(div);
                if (item.items?.length) fragment.appendChild(await createTree(item.items, level + 1));
            }
            return fragment;
        }
        outlineContainer.appendChild(await createTree(outline));
        outlineEntries.sort((a, b) => a.page - b.page);
        const initialPage = parseInt(currentPageInput.value, 10) || 1;
        updateOutlineSelection(initialPage);
    } catch (e) { console.error(e); outlineContainer.textContent = 'Failed to load outline'; }
}

// ==================== Translation Logic (Shadow DOM) ====================

/**
 * Handles the double-click event to show the dictionary popup for a word.
 * @param {MouseEvent} e
 */
viewer.addEventListener('dblclick', async (e) => {
    if (!isContextValid()) return;
    const word = window.getSelection().toString().trim();
    if (!word || !isAllEnglish(word) || !isProbablyWord(word)) return;

    const root = await ensureShadowRoot();
    if (!root) return;
    removeAllPopups();
    const popup = document.createElement('div');
    popup.className = 'translator-popup';
    popup.style.pointerEvents = 'auto';

    const content = document.createElement('div');
    content.className = 'translator-popup-content';
    const header = document.createElement('div');
    header.className = 'translator-word-header';
    const wInfo = document.createElement('div');
    wInfo.className = 'translator-word-info';
    const wSpan = document.createElement('span'); wSpan.className = 'translator-word'; wSpan.textContent = word;
    wInfo.appendChild(wSpan);
    header.appendChild(wInfo);
    header.appendChild(createSpeakButton(() => {
        speakText(word);
    }));
    const meanings = document.createElement('div'); meanings.className = 'translator-meanings';
    const loading = document.createElement('div'); loading.className = 'translator-loading'; loading.textContent = 'Searching...';
    meanings.appendChild(loading);
    content.appendChild(header); content.appendChild(meanings);

    popup.appendChild(content);
    popup.appendChild(createCloseButton(removeAllPopups));
    root.appendChild(popup);
    setCurrentPopup(popup);
    const activePopup = popup;

    const width = Math.min(POPUP_WIDTH, window.innerWidth - 20);
    const pos = calculatePopupPosition(e.clientX, e.clientY, width, POPUP_HEIGHT, {
        preferBelow: true,
        alignCenter: true,
        anchorX: e.clientX,
        anchorY: e.clientY
    });
    popup.style.left = pos.left + 'px';
    popup.style.top = pos.top + 'px';

    const response = await sendMessageSafe({ action: 'fetchDictionary', word: word.toLowerCase() });
    if (!isContextValid() || getCurrentPopup() !== activePopup) return;
    if (response && response.success && response.data) {
        updatePopupWithData(response.data, word);
        const isMorphed = response.data.word && response.data.word.toLowerCase() !== word.toLowerCase();

        if (isMorphed) {
            // Morphed word: Force AI speak for the variant
            speakText(word);
        } else {
            // Standard word: Prioritize dictionary audio
            const best = findBestAudioUrl(response.data.phonetics);

            if (best) new Audio(best).play().catch(() => speakText(word)); else speakText(word);
        }
    } else if (response && response.error) {
        meanings.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'translator-error';
        err.textContent = `❌ ${response.error}`;
        meanings.appendChild(err);
    } else {
        const tr = await sendMessageSafe({ action: 'translate', text: word });
        if (!isContextValid() || getCurrentPopup() !== activePopup) return;
        meanings.innerHTML = '';
        if (tr && tr.success && tr.data) {
            const res = document.createElement('div'); res.className = 'translator-translation'; res.textContent = tr.data.translated || 'No results';
            meanings.appendChild(res);
            // Auto speak for translation
            speakText(word);
        } else {
            const errText = (tr && tr.error) || 'Query failed';
            const err = document.createElement('div'); err.className = 'translator-error'; err.textContent = `❌ ${errText}`;
            meanings.appendChild(err);
        }
    }
});

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
    const content = getCurrentPopup().querySelector('.translator-popup-content');
    content.innerHTML = '';
    const header = document.createElement('div'); header.className = 'translator-word-header';
    const info = document.createElement('div');
    info.className = 'translator-word-info';
    const w = document.createElement('span');
    w.className = 'translator-word';
    w.textContent = data.word || word;
    info.appendChild(w);

    // Show source word if it differs from the headword
    if (data.word && word && data.word.toLowerCase() !== word.toLowerCase()) {
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'translator-source-word';
        sourceSpan.textContent = `(from ${word}) `;

        const miniBtn = document.createElement('span');
        miniBtn.className = 'translator-mini-speak';
        miniBtn.innerHTML = createSpeakerSVG();
        miniBtn.onclick = (e) => { e.stopPropagation(); speakText(word); };
        sourceSpan.appendChild(miniBtn);

        info.appendChild(sourceSpan);
    }
    if (data.phonetic) { const p = document.createElement('span'); p.className = 'translator-phonetic'; p.textContent = data.phonetic; info.appendChild(p); }
    header.appendChild(info);
    const best = findBestAudioUrl(data.phonetics);

    const speakHandler = () => {
        if (best) {
            new Audio(best).play().catch(() => speakText(data.word || word));
        } else {
            speakText(data.word || word);
        }
    };
    header.appendChild(createSpeakButton(speakHandler));

    const meaningsCont = document.createElement('div'); meaningsCont.className = 'translator-meanings';
    if (data.meanings?.length) {
        data.meanings.slice(0, 3).forEach(m => {
            const item = document.createElement('div'); item.className = 'translator-meaning-item';
            const pos = document.createElement('span'); pos.className = 'translator-pos'; pos.textContent = m.partOfSpeech;
            item.appendChild(pos);
            m.definitions.slice(0, 2).forEach(d => {
                const pair = createDefinitionPair(d.definition);
                item.appendChild(pair);
                if (d.example) { const ex = document.createElement('div'); ex.className = 'translator-example'; ex.textContent = `"${d.example}"`; item.appendChild(ex); }
            });
            meaningsCont.appendChild(item);
        });
    } else { const empty = document.createElement('div'); empty.className = 'translator-definition'; empty.textContent = 'No detailed definitions found.'; meaningsCont.appendChild(empty); }
    content.appendChild(header); content.appendChild(meaningsCont);
}

viewer.onmouseup = async (e) => {
    if (!isContextValid()) return;
    setTimeout(async () => {
        try {
            const text = window.getSelection().toString().trim();
            if (e.target.id === 'translator-extension-host') return;
            if (!text || !isAllEnglish(text) || isProbablyWord(text)) return;
            await showSelectionToolbar({
                text,
                x: e.clientX,
                y: e.clientY,
                minTop: 60,
                onTranslate: translateSelection
            });
        } catch (err) {
            console.error('[Translater] Mouseup error:', err);
        }
    }, 50);
};

/**
 * Translates the selection and displays a popup.
 * @param {string} text - Text to translate.
 * @param {number} x - X coordinate.
 * @param {number} y - Y coordinate.
 */
async function translateSelection(text, x, y) {
    const { popup, content } = await showSentencePopup(x, y, {
        width: Math.min(SENTENCE_POPUP_WIDTH, window.innerWidth - 20),
        height: SENTENCE_POPUP_HEIGHT
    });
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

document.addEventListener('mousedown', (e) => {
    const path = e.composedPath();
    const isClickInside = path.some(el =>
        el === getShadowHost() ||
        (el.classList && (el.classList.contains('translator-popup') || el.classList.contains('translator-float-buttons') || el.classList.contains('translator-sentence-popup')))
    );
    if (!isClickInside && getCurrentPopup()) removeAllPopups();
    if (!isContextValid()) return;
});

function showLoading(show) {
    let overlay = document.querySelector('.loading-overlay');
    if (show && !overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        const text = document.createElement('div');
        text.className = 'loading-text';
        text.textContent = 'Loading PDF...';
        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.body.appendChild(overlay);
    } else if (!show && overlay) overlay.remove();
}

function showError(message) {
    showLoading(false);
    viewer.innerHTML = `<div class="error-container"><div class="error-icon">📄</div><div class="error-message">${escapeHtml(message)}</div><button class="error-retry-btn" id="retryBtn">Retry</button></div>`;
    document.getElementById('retryBtn').onclick = () => location.reload();
}

const url = getPdfUrl();
if (url) loadPdf(url); else showError('No PDF file specified');
console.log('Translater PDF Reader Loaded (Shadow DOM)');
