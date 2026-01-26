/**
 * 快译 PDF 阅读器脚本 (Refactored)
 */

// 导入工具函数
let utils;
try {
    const utilsUrl = chrome.runtime.getURL('utils.js');
    utils = await import(utilsUrl);
} catch (e) {
    console.log('[Translater] 扩展上下文已失效，请刷新页面');
}

const {
    escapeHtml,
    isAllEnglish,
    createSpeakerSVG,
    calculatePopupPosition,
    sendMessageSafe,
    speakText,
    getURLSafe,
    isContextValid
} = utils || {};

// PDF.js 配置
const pdfjsLib = await import('./pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

// 状态变量
let pdfDoc = null;
let currentScale = 1.0;
let renderedPages = new Map();

// DOM 元素
const viewer = document.getElementById('viewer');
const viewerContainer = document.getElementById('viewerContainer');
const currentPageInput = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const zoomLevelSpan = document.getElementById('zoomLevel');
const pdfTitleSpan = document.getElementById('pdfTitle');
const sidebar = document.getElementById('sidebar');
const outlineContainer = document.getElementById('outlineContainer');
const sidebarToggle = document.getElementById('sidebarToggle');

// ==================== Shadow DOM 设置 (同步 content.js) ====================

let shadowHost = null;
let shadowRoot = null;
let currentPopup = null;
let currentFloatButtons = null;
let hideFloatButtonsTimeout = null;

function ensureShadowRoot() {
    if (!isContextValid()) return null;
    if (!shadowHost) {
        shadowHost = document.createElement('div');
        shadowHost.id = 'translator-extension-host';
        Object.assign(shadowHost.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: '2147483647', border: 'none', padding: '0', margin: '0'
        });
        document.body.appendChild(shadowHost);
        shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = getURLSafe('styles.css');
        shadowRoot.appendChild(styleLink);
    }
    return shadowRoot;
}

function removeFloatButtons() {
    if (hideFloatButtonsTimeout) { clearTimeout(hideFloatButtonsTimeout); hideFloatButtonsTimeout = null; }
    if (currentFloatButtons) { currentFloatButtons.remove(); currentFloatButtons = null; }
}

function removeAllPopups() {
    removeFloatButtons();
    if (currentPopup) { currentPopup.remove(); currentPopup = null; }
}

function createCloseButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'translator-close-btn';
    btn.textContent = '×';
    btn.onclick = onClick;
    return btn;
}

function createSpeakButton(text) {
    const btn = document.createElement('button');
    btn.className = 'translator-speak-btn';
    btn.innerHTML = createSpeakerSVG();
    btn.onclick = (e) => { e.stopPropagation(); speakText(text); };
    return btn;
}

// ==================== PDF 加载与渲染 ====================

function getPdfUrl() {
    return new URLSearchParams(window.location.search).get('url');
}

async function loadPdf(url) {
    try {
        showLoading(true);
        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
            cMapPacked: true,
        });

        pdfDoc = await loadingTask.promise;
        totalPagesSpan.textContent = pdfDoc.numPages;
        const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
        pdfTitleSpan.textContent = filename;
        document.title = filename;

        await renderOutline();
        currentScale = 1.9; // 默认 190%
        updateZoomLevel();
        await renderAllPages();
        showLoading(false);
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        showError('无法加载 PDF 文件，请检查 URL 是否正确。');
    }
}

async function calculateFitWidth() {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = viewerContainer.clientWidth - 40;
    currentScale = containerWidth / viewport.width;
    updateZoomLevel();
}

async function renderAllPages() {
    viewer.innerHTML = '';
    renderedPages.clear();

    const observer = new IntersectionObserver((entries) => {
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
        observer.observe(container);
    }
}

async function renderPageContent(pageNum, container) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
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
        textLayer.style.setProperty('--scale-factor', viewport.scale);
        container.appendChild(textLayer);

        await page.render({ canvasContext: context, viewport }).promise;

        const textContent = await page.getTextContent();
        const spansToAdjust = [];
        textContent.items.forEach(item => {
            if (!item.str || item.str.trim() === '') return;
            const span = document.createElement('span');
            span.textContent = item.str;
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            Object.assign(span.style, {
                position: 'absolute', left: `${tx[4]}px`, top: `${tx[5] - fontHeight}px`,
                fontSize: `${fontHeight}px`, fontFamily: textContent.styles[item.fontName]?.fontFamily || 'sans-serif',
                color: 'transparent', whiteSpace: 'pre', pointerEvents: 'all', transformOrigin: '0% 0%', lineHeight: '1'
            });
            const angle = Math.atan2(tx[1], tx[0]);
            if (Math.abs(angle) > 0.001) span.style.transform = `rotate(${angle}rad)`;
            textLayer.appendChild(span);
            if (item.width > 0) spansToAdjust.push({ span, targetWidth: item.width * viewport.scale, angle });
        });

        spansToAdjust.forEach(({ span, targetWidth, angle }) => {
            const naturalWidth = span.offsetWidth;
            if (naturalWidth > 0 && Math.abs(targetWidth - naturalWidth) > 0.5) {
                const scaleX = targetWidth / naturalWidth;
                span.style.transform = (Math.abs(angle) > 0.001 ? `rotate(${angle}rad) ` : '') + `scaleX(${scaleX})`;
            }
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="padding:20px;color:red;">页面加载失败</div>';
    }
}

// ==================== 工具栏与侧边栏 ====================

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
document.getElementById('zoomOut').onclick = () => { if (currentScale > 0.25) { currentScale -= 0.25; updateZoomLevel(); renderAllPages(); } };
document.getElementById('zoomIn').onclick = () => { if (currentScale < 4.0) { currentScale += 0.25; updateZoomLevel(); renderAllPages(); } };
document.getElementById('fitWidth').onclick = async () => { await calculateFitWidth(); renderAllPages(); };
document.getElementById('downloadPdf').onclick = () => {
    const url = getPdfUrl();
    if (url) { const a = document.createElement('a'); a.href = url; a.download = decodeURIComponent(url.split('/').pop().split('?')[0]); a.click(); }
};
sidebarToggle.onclick = () => { sidebar.classList.toggle('open'); viewerContainer.classList.toggle('sidebar-open'); };

function scrollToPage(pageNum) {
    const container = renderedPages.get(pageNum);
    if (container) { container.scrollIntoView({ behavior: 'smooth', block: 'start' }); currentPageInput.value = pageNum; }
}
function updateZoomLevel() { zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%'; }

viewerContainer.onscroll = () => {
    const centerY = viewerContainer.getBoundingClientRect().top + viewerContainer.clientHeight / 3;
    for (const [pageNum, container] of renderedPages) {
        const rect = container.getBoundingClientRect();
        if (rect.top <= centerY && rect.bottom >= centerY) { currentPageInput.value = pageNum; break; }
    }
};

async function renderOutline() {
    try {
        const outline = await pdfDoc.getOutline();
        outlineContainer.innerHTML = '';
        if (!outline || outline.length === 0) { outlineContainer.textContent = '暂无目录'; return; }

        async function createTree(items, level = 0) {
            const fragment = document.createDocumentFragment();
            if (level > 1) return fragment;
            for (const item of items) {
                const div = document.createElement('div');
                div.className = `outline-item level-${level}`;
                div.textContent = item.title;
                div.onclick = async () => {
                    document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    let dest = item.dest;
                    if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest);
                    if (Array.isArray(dest)) scrollToPage(await pdfDoc.getPageIndex(dest[0]) + 1);
                    else if (item.url) window.open(item.url, '_blank');
                };
                fragment.appendChild(div);
                if (item.items?.length) fragment.appendChild(await createTree(item.items, level + 1));
            }
            return fragment;
        }
        outlineContainer.appendChild(await createTree(outline));
    } catch (e) { console.error(e); outlineContainer.textContent = '获取目录失败'; }
}

// ==================== 翻译逻辑 (Shadow DOM) ====================

viewer.addEventListener('dblclick', async (e) => {
    if (!isContextValid()) return;
    const word = window.getSelection().toString().trim();
    if (!word || !isAllEnglish(word)) return;

    const root = ensureShadowRoot();
    removeAllPopups();
    currentPopup = document.createElement('div');
    currentPopup.className = 'translator-popup';
    currentPopup.style.pointerEvents = 'auto';

    const content = document.createElement('div');
    content.className = 'translator-popup-content';
    const header = document.createElement('div');
    header.className = 'translator-word-header';
    const wInfo = document.createElement('div');
    const wSpan = document.createElement('span'); wSpan.className = 'translator-word'; wSpan.textContent = word;
    wInfo.appendChild(wSpan);
    header.appendChild(wInfo);
    header.appendChild(createSpeakButton(word));
    const meanings = document.createElement('div'); meanings.className = 'translator-meanings';
    const loading = document.createElement('div'); loading.className = 'translator-loading'; loading.textContent = '正在查询...';
    meanings.appendChild(loading);
    content.appendChild(header); content.appendChild(meanings);

    currentPopup.appendChild(createCloseButton(removeAllPopups));
    currentPopup.appendChild(content);
    root.appendChild(currentPopup);

    const pos = calculatePopupPosition(e.clientX, e.clientY, 350, 200);
    currentPopup.style.left = pos.left + 'px';
    currentPopup.style.top = pos.top + 'px';

    const response = await sendMessageSafe({ action: 'fetchDictionary', word: word.toLowerCase() });
    if (response && response.success && response.data) {
        updatePopupWithData(response.data, word);
        const best = response.data.phonetics?.find(p => p.audio && (p.audio.includes('us_pron') || p.audio.includes('-us')))?.audio;
        if (best) new Audio(best).play().catch(() => speakText(word)); else speakText(word);
    } else if (response && response.error && (response.error.includes('更新') || response.error.includes('失效'))) {
        meanings.innerHTML = ''; const err = document.createElement('div'); err.className = 'translator-error'; err.textContent = `❌ ${response.error}`; meanings.appendChild(err);
    } else {
        const tr = await sendMessageSafe({ action: 'translate', text: word });
        meanings.innerHTML = '';
        if (tr && tr.success && tr.data) {
            const res = document.createElement('div'); res.className = 'translator-translation'; res.textContent = tr.data.translated || '翻译结果为空';
            meanings.appendChild(res);
        } else {
            const errText = (tr && tr.error) || (response && response.error) || '查询失败';
            const err = document.createElement('div'); err.className = 'translator-error'; err.textContent = `❌ ${errText}`;
            meanings.appendChild(err);
        }
    }
});

function updatePopupWithData(data, word) {
    if (!currentPopup || !data) {
        console.error('[Translater] updatePopupWithData 收到无效数据:', data);
        return;
    }
    const content = currentPopup.querySelector('.translator-popup-content');
    content.innerHTML = '';
    const header = document.createElement('div'); header.className = 'translator-word-header';
    const info = document.createElement('div');
    const w = document.createElement('span'); w.className = 'translator-word'; w.textContent = word;
    info.appendChild(w);
    if (data.phonetic) { const p = document.createElement('span'); p.className = 'translator-phonetic'; p.textContent = data.phonetic; info.appendChild(p); }
    header.appendChild(info);
    const best = data.phonetics?.find(p => p.audio && (p.audio.includes('us_pron') || p.audio.includes('-us')))?.audio;
    const sBtn = createSpeakButton(word);
    if (best) sBtn.onclick = (e) => { e.stopPropagation(); new Audio(best).play().catch(() => speakText(word)); };
    header.appendChild(sBtn);

    const meaningsCont = document.createElement('div'); meaningsCont.className = 'translator-meanings';
    if (data.meanings?.length) {
        data.meanings.slice(0, 3).forEach(m => {
            const item = document.createElement('div'); item.className = 'translator-meaning-item';
            const pos = document.createElement('span'); pos.className = 'translator-pos'; pos.textContent = m.partOfSpeech;
            item.appendChild(pos);
            m.definitions.slice(0, 2).forEach(d => {
                const def = document.createElement('div'); def.className = 'translator-definition'; def.textContent = d.definition;
                item.appendChild(def);
                if (d.example) { const ex = document.createElement('div'); ex.className = 'translator-example'; ex.textContent = `"${d.example}"`; item.appendChild(ex); }
            });
            meaningsCont.appendChild(item);
        });
    } else { const empty = document.createElement('div'); empty.className = 'translator-definition'; empty.textContent = '暂无详细释义'; meaningsCont.appendChild(empty); }
    content.appendChild(header); content.appendChild(meaningsCont);
}

viewer.onmouseup = (e) => {
    if (!isContextValid()) return;
    setTimeout(() => {
        const text = window.getSelection().toString().trim();
        if (e.target.id === 'translator-extension-host') return;
        removeFloatButtons();
        if (!text || (text.split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text)) || !isAllEnglish(text)) return;
        const root = ensureShadowRoot();
        currentFloatButtons = document.createElement('div');
        currentFloatButtons.className = 'translator-float-buttons';
        const sBtn = document.createElement('button'); sBtn.className = 'translator-float-btn speak-btn'; sBtn.innerHTML = createSpeakerSVG(); sBtn.setAttribute('data-tooltip', '朗读'); sBtn.onmouseenter = () => speakText(text);
        const tBtn = document.createElement('button'); tBtn.className = 'translator-float-btn translate-btn'; tBtn.textContent = '译'; tBtn.setAttribute('data-tooltip', '翻译'); tBtn.onmouseenter = () => translateSelection(text, e.clientX, e.clientY);
        const cBtn = document.createElement('button'); cBtn.className = 'translator-float-btn close-floating-btn'; cBtn.textContent = '×'; cBtn.onmouseenter = removeFloatButtons;
        currentFloatButtons.append(sBtn, tBtn, cBtn);
        currentFloatButtons.style.pointerEvents = 'auto';
        root.appendChild(currentFloatButtons);
        const btnW = 32, gap = 30, contW = btnW * 3 + gap + 6;
        let left = Math.max(10, Math.min(e.clientX - btnW - gap / 2, window.innerWidth - contW - 10));
        let top = Math.max(60, Math.min(e.clientY - btnW / 2, window.innerHeight - btnW - 10));
        currentFloatButtons.style.left = left + 'px'; currentFloatButtons.style.top = top + 'px'; currentFloatButtons.style.gap = gap + 'px';
        currentFloatButtons.onmouseleave = () => { hideFloatButtonsTimeout = setTimeout(removeFloatButtons, 500); };
        currentFloatButtons.onmouseenter = () => { if (hideFloatButtonsTimeout) clearTimeout(hideFloatButtonsTimeout); };
    }, 50);
};

async function translateSelection(text, x, y) {
    removeFloatButtons(); const root = ensureShadowRoot();
    currentPopup = document.createElement('div'); currentPopup.className = 'translator-sentence-popup';
    const content = document.createElement('div'); content.className = 'translator-sentence-content';
    const loading = document.createElement('div'); loading.className = 'translator-loading'; loading.textContent = '正在翻译...';
    content.appendChild(loading);
    currentPopup.appendChild(createCloseButton(removeAllPopups));
    currentPopup.appendChild(content);
    currentPopup.style.pointerEvents = 'auto';
    root.appendChild(currentPopup);
    const pos = calculatePopupPosition(x, y, 400, 150);
    currentPopup.style.left = pos.left + 'px'; currentPopup.style.top = pos.top + 'px';

    const response = await sendMessageSafe({ action: 'translate', text });
    if (response && response.success && response.data) {
        content.innerHTML = '';
        const res = document.createElement('div');
        res.className = 'translator-result';
        res.textContent = response.data.translated || '翻译结果为空';
        content.appendChild(res);
    } else {
        content.textContent = `❌ ${(response && response.error) || '翻译失败'}`;
    }
}

document.onmousedown = (e) => {
    if (!isContextValid()) return;
    const path = e.composedPath();
    const isClickInside = path.some(el =>
        el === shadowHost ||
        (el.classList && (el.classList.contains('translator-popup') || el.classList.contains('translator-float-buttons') || el.classList.contains('translator-sentence-popup')))
    );
    if (!isClickInside && currentPopup) removeAllPopups();
};

function showLoading(show) {
    let overlay = document.querySelector('.loading-overlay');
    if (show && !overlay) {
        overlay = document.createElement('div'); overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">正在加载 PDF...</div>';
        document.body.appendChild(overlay);
    } else if (!show && overlay) overlay.remove();
}

function showError(message) {
    showLoading(false);
    viewer.innerHTML = `<div class="error-container"><div class="error-icon">📄</div><div class="error-message">${escapeHtml(message)}</div><button class="error-retry-btn" id="retryBtn">重试</button></div>`;
    document.getElementById('retryBtn').onclick = () => location.reload();
}

const url = getPdfUrl();
if (url) loadPdf(url); else showError('未指定 PDF 文件地址');
console.log('快译 PDF 阅读器已加载 (Shadow DOM 版)');
