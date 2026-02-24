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
    createSpeakerSVG,
    calculatePopupPosition,
    sendMessageSafe,
    speakText,
    getURLSafe,
    isContextValid,
    ensureShadowRoot,
    createCloseButton,
    createSpeakButton,
    removeAllPopups,
    removeFloatButtons,
    getCurrentPopup,
    setCurrentPopup,
    setCurrentFloatButtons,
    getHideFloatButtonsTimeout,
    setHideFloatButtonsTimeout,
    findBestAudioUrl,
    getShadowHost
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
const FLOAT_BTN_WIDTH = 32;
const FLOAT_BTN_GAP = 30;

const MIN_ZOOM = 60;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
let currentZoom = 100;

const definitionTranslationCache = new Map();

// ==================== Markdown Loading and Rendering ====================

function getMdUrl() {
    return new URLSearchParams(window.location.search).get('url');
}

async function loadMarkdown(url) {
    try {
        showLoading(true);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawText = await response.text();

        // Parse markdown
        const html = window.marked.parse(rawText);
        mdContent.innerHTML = html;

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
    let url = getMdUrl();
    if (url) {
        if (!url.includes('#no_redirect')) {
            url += (url.includes('#') ? '_no_redirect' : '#no_redirect');
        }
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: url });
        } else {
            window.open(url, '_blank');
        }
    }
};

// ==================== Translation Logic (Shadow DOM) ====================

function createDefinitionPair(definitionText) {
    const trimmed = (definitionText || '').trim();
    const pair = document.createElement('div');
    pair.className = 'translator-definition-pair';

    const english = document.createElement('div');
    english.className = 'translator-definition translator-definition-en';
    english.textContent = definitionText || '—';
    pair.appendChild(english);

    const chinese = document.createElement('div');
    chinese.className = 'translator-definition translator-definition-zh';
    chinese.textContent = trimmed ? 'Translating…' : '—';
    chinese.dataset.definitionKey = trimmed;
    pair.appendChild(chinese);

    if (trimmed) {
        translateDefinitionToChinese(trimmed, chinese);
    }

    return pair;
}

function translateDefinitionToChinese(text, targetEl) {
    const translationPromise = getDefinitionTranslationPromise(text);
    translationPromise.then(result => {
        if (!targetEl.isConnected || targetEl.dataset.definitionKey !== text) return;
        if (result && result.success && result.data && result.data.translated) {
            targetEl.textContent = result.data.translated;
            targetEl.classList.remove('translator-definition-zh-error');
        } else {
            const localizedError = (result && result.error === 'Please configure DeepL API Key')
                ? 'Please configure a DeepL API Key in extension options'
                : (result && result.error) || 'Translation unavailable';
            targetEl.textContent = localizedError;
            targetEl.classList.add('translator-definition-zh-error');
        }
    }).catch(() => {
        if (!targetEl.isConnected || targetEl.dataset.definitionKey !== text) return;
        targetEl.textContent = 'Translation failed';
        targetEl.classList.add('translator-definition-zh-error');
    });
}

function getDefinitionTranslationPromise(text) {
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

mdContent.addEventListener('dblclick', async (e) => {
    if (!isContextValid()) return;
    const word = window.getSelection().toString().trim();
    if (!word || !isAllEnglish(word)) return;

    const root = await ensureShadowRoot();
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

    const width = Math.min(POPUP_WIDTH, window.innerWidth - 20);
    const pos = calculatePopupPosition(e.clientX, e.clientY, width, POPUP_HEIGHT, {
        preferBelow: true, alignCenter: true, anchorX: e.clientX, anchorY: e.clientY
    });
    popup.style.left = pos.left + 'px';
    popup.style.top = pos.top + 'px';

    const response = await sendMessageSafe({ action: 'fetchDictionary', word: word.toLowerCase() });
    if (!isContextValid() || !getCurrentPopup()) return;
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
        if (!isContextValid() || !getCurrentPopup()) return;
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
            removeFloatButtons();
            if (!text || (text.split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text)) || !isAllEnglish(text)) return;
            const root = await ensureShadowRoot();
            const floatButtons = document.createElement('div');
            floatButtons.className = 'translator-float-buttons';
            const sBtn = document.createElement('button'); sBtn.className = 'translator-float-btn speak-btn'; sBtn.innerHTML = createSpeakerSVG(); sBtn.setAttribute('data-tooltip', 'Speak'); sBtn.onclick = () => speakText(text);
            const tBtn = document.createElement('button'); tBtn.className = 'translator-float-btn translate-btn'; tBtn.textContent = 'T'; tBtn.setAttribute('data-tooltip', 'Translate'); tBtn.onmouseenter = () => translateSelection(text, e.clientX, e.clientY);
            const cBtn = document.createElement('button'); cBtn.className = 'translator-float-btn close-floating-btn'; cBtn.textContent = '×'; cBtn.onmouseenter = removeFloatButtons;
            const gBtn = document.createElement('button'); gBtn.className = 'translator-float-btn google-search-btn'; gBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:white;"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`; gBtn.setAttribute('data-tooltip', 'Google'); gBtn.onclick = () => window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');
            floatButtons.append(sBtn, tBtn, cBtn, gBtn);
            floatButtons.style.pointerEvents = 'auto';
            root.appendChild(floatButtons);
            setCurrentFloatButtons(floatButtons);

            const contW = FLOAT_BTN_WIDTH * 3 + FLOAT_BTN_GAP + 6;
            let left = Math.max(10, Math.min(e.clientX - FLOAT_BTN_WIDTH - FLOAT_BTN_GAP / 2, window.innerWidth - contW - 10));
            let top = Math.max(60, Math.min(e.clientY - FLOAT_BTN_WIDTH / 2, window.innerHeight - FLOAT_BTN_WIDTH - 44));
            floatButtons.style.left = left + 'px'; floatButtons.style.top = top + 'px'; floatButtons.style.gap = FLOAT_BTN_GAP + 'px';
            floatButtons.onmouseleave = () => { setHideFloatButtonsTimeout(setTimeout(removeFloatButtons, 500)); };
            floatButtons.onmouseenter = () => { if (getHideFloatButtonsTimeout()) clearTimeout(getHideFloatButtonsTimeout()); };
        } catch (err) {
            console.error('[Translater] Mouseup error:', err);
        }
    }, 50);
};

async function translateSelection(text, x, y) {
    removeAllPopups();
    const root = await ensureShadowRoot();
    const popup = document.createElement('div');
    popup.className = 'translator-sentence-popup';
    const content = document.createElement('div');
    content.className = 'translator-sentence-content';
    const loading = document.createElement('div');
    loading.className = 'translator-loading';
    loading.textContent = 'Translating...';
    content.appendChild(loading);
    popup.appendChild(content);
    popup.appendChild(createCloseButton(removeAllPopups));
    popup.style.pointerEvents = 'auto';
    root.appendChild(popup);
    setCurrentPopup(popup);

    const width = Math.min(SENTENCE_POPUP_WIDTH, window.innerWidth - 20);
    const pos = calculatePopupPosition(x, y, width, SENTENCE_POPUP_HEIGHT, {
        preferBelow: true, alignCenter: true, anchorX: x, anchorY: y
    });
    popup.style.left = pos.left + 'px';
    popup.style.top = pos.top + 'px';

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

document.onmousedown = (e) => {
    const path = e.composedPath();
    const isClickInside = path.some(el =>
        el === getShadowHost() ||
        (el.classList && (el.classList.contains('translator-popup') || el.classList.contains('translator-float-buttons') || el.classList.contains('translator-sentence-popup')))
    );
    if (!isClickInside && getCurrentPopup()) removeAllPopups();
    if (!isContextValid()) return;
};

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
