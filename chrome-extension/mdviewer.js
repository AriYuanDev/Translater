/**
 * Translater Markdown Reader Script
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
    openExternalUrl,
    appendNoRedirectParam
} = utils;

// DOM Elements
const mdContent = document.getElementById('mdContent');
const viewerContainer = document.getElementById('viewerContainer');
const mdTitleSpan = document.getElementById('mdTitle');
const zoomLevelSpan = document.getElementById('zoomLevel');
const sidebar = document.getElementById('sidebar');
const outlineContainer = document.getElementById('outlineContainer');

// Constants
const POPUP_WIDTH = 760;
const POPUP_HEIGHT = 260;
const SENTENCE_POPUP_WIDTH = 420;
const SENTENCE_POPUP_HEIGHT = 180;

const MIN_ZOOM = 60;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
let currentZoom = 100;


// ==================== Markdown Loading and Rendering ====================

function getMdUrl() {
    return new URLSearchParams(window.location.search).get('url');
}

function isFileUrl(url) {
    return typeof url === 'string' && url.startsWith('file://');
}

function sanitizeMarkdownHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    template.content.querySelectorAll('script, iframe, object, embed, link, meta, style, base, form').forEach(node => {
        node.remove();
    });

    template.content.querySelectorAll('*').forEach(element => {
        Array.from(element.attributes).forEach(attribute => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (name.startsWith('on') || name === 'srcdoc') {
                element.removeAttribute(attribute.name);
                return;
            }
            if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'formaction') && /^javascript:/i.test(value)) {
                element.removeAttribute(attribute.name);
            }
        });
    });

    return template.innerHTML;
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
        fixRelativePaths(baseUrl);

        // Set title
        const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
        mdTitleSpan.textContent = filename;
        document.title = filename;

        // Build TOC
        buildTableOfContents();

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

function fixRelativePaths(baseUrl) {
    mdContent.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.match(/^(https?:|data:|file:)/i)) {
            img.src = new URL(src, baseUrl).href;
        }
    });
    mdContent.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.match(/^(https?:|data:|file:|#|mailto:|javascript:)/i)) {
            a.href = new URL(href, baseUrl).href;
        }
        // Open links in new tab
        if (href && !href.startsWith('#')) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
    });
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

document.getElementById('zoomOut').onclick = () => {
    if (currentZoom > MIN_ZOOM) {
        currentZoom -= ZOOM_STEP;
        updateZoomLevel();
    }
};

document.getElementById('zoomIn').onclick = () => {
    if (currentZoom < MAX_ZOOM) {
        currentZoom += ZOOM_STEP;
        updateZoomLevel();
    }
};

// ==================== Toolbar ====================

document.getElementById('sidebarToggle').onclick = () => {
    sidebar.classList.toggle('open');
    viewerContainer.classList.toggle('sidebar-open');
};

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
    header.appendChild(createSpeakButton(() => { speakText(word); }));
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
        preferBelow: true, alignCenter: true, anchorX: e.clientX, anchorY: e.clientY
    });
    popup.style.left = pos.left + 'px';
    popup.style.top = pos.top + 'px';

    const response = await sendMessageSafe({ action: 'fetchDictionary', word: word.toLowerCase() });
    if (!isContextValid() || getCurrentPopup() !== activePopup) return;
    if (response && response.success && response.data) {
        updatePopupWithData(response.data, word);
        const isMorphed = response.data.word && response.data.word.toLowerCase() !== word.toLowerCase();
        if (isMorphed) {
            speakText(word);
        } else {
            const best = findBestAudioUrl(response.data.phonetics);
            if (best) new Audio(best).play().catch(() => speakText(word)); else speakText(word);
        }
    } else if (response && response.error) {
        meanings.innerHTML = '';
        const err = document.createElement('div'); err.className = 'translator-error'; err.textContent = `❌ ${response.error}`;
        meanings.appendChild(err);
    } else {
        const tr = await sendMessageSafe({ action: 'translate', text: word });
        if (!isContextValid() || getCurrentPopup() !== activePopup) return;
        meanings.innerHTML = '';
        if (tr && tr.success && tr.data) {
            const res = document.createElement('div'); res.className = 'translator-translation'; res.textContent = tr.data.translated || 'No results';
            meanings.appendChild(res);
            speakText(word);
        } else {
            const errText = (tr && tr.error) || 'Query failed';
            const err = document.createElement('div'); err.className = 'translator-error'; err.textContent = `❌ ${errText}`;
            meanings.appendChild(err);
        }
    }
});

function updatePopupWithData(data, word) {
    if (!getCurrentPopup() || !data) return;
    const content = getCurrentPopup().querySelector('.translator-popup-content');
    content.innerHTML = '';
    const header = document.createElement('div'); header.className = 'translator-word-header';
    const info = document.createElement('div');
    info.className = 'translator-word-info';
    const w = document.createElement('span');
    w.className = 'translator-word';
    w.textContent = data.word || word;
    info.appendChild(w);

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
        if (best) new Audio(best).play().catch(() => speakText(data.word || word));
        else speakText(data.word || word);
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

mdContent.onmouseup = async (e) => {
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
if (url) loadMarkdown(url); else showError('No Markdown file specified');
console.log('Translater Markdown Reader Loaded (Shadow DOM)');
