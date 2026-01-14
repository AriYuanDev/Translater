// 快译 - PDF 阅读器脚本
// 使用 PDF.js 渲染 PDF 并集成翻译功能

import * as pdfjsLib from './pdf.min.mjs';

// ==================== 初始化配置 ====================

// 设置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

// ==================== 状态管理 ====================

/** @type {pdfjsLib.PDFDocumentProxy | null} */
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let currentScale = 1.0;
let isRendering = false;
let pendingPage = null;

// 缓存美式英语语音
let cachedUSVoice = null;
let voicesLoaded = false;

// ==================== DOM 元素 ====================

const viewerContainer = document.getElementById('viewerContainer');
const viewer = document.getElementById('viewer');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const currentPageInput = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomLevelSpan = document.getElementById('zoomLevel');
const fitWidthBtn = document.getElementById('fitWidth');
const pdfTitleSpan = document.getElementById('pdfTitle');
const downloadBtn = document.getElementById('downloadPdf');
const translatorPopup = document.getElementById('translatorPopup');
const floatButtons = document.getElementById('floatButtons');

// ==================== 工具函数 ====================

/**
 * HTML 转义函数，防止 XSS 攻击
 * @param {string} text 
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return '';
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * 使用 TTS 朗读文本
 * @param {string} text 
 */
function speakText(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    if (cachedUSVoice) {
        utterance.voice = cachedUSVoice;
    }
    window.speechSynthesis.speak(utterance);
}

/**
 * 加载并缓存语音列表
 */
function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0 && !voicesLoaded) {
        cachedUSVoice = voices.find(v => v.name.includes('p5712') && v.lang.startsWith('en')) ||
            voices.find(v => v.name.includes('Piper') && v.lang.startsWith('en')) ||
            voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha')) ||
            voices.find(v => v.lang === 'en-US');
        voicesLoaded = true;
    }
}

/**
 * 安全发送消息到 background（带 SW 唤醒保护）
 * @param {object} message 
 * @returns {Promise<any>}
 */
async function sendMessageSafe(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        if (response === undefined) {
            // Service Worker 可能未响应，重试一次
            await new Promise(r => setTimeout(r, 100));
            return await chrome.runtime.sendMessage(message);
        }
        return response;
    } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
            throw new Error('扩展已更新，请刷新页面');
        }
        throw error;
    }
}

// ==================== PDF 渲染 ====================

/**
 * 渲染指定页面
 * @param {number} pageNum 
 */
async function renderPage(pageNum) {
    if (!pdfDoc) return;

    if (isRendering) {
        pendingPage = pageNum;
        return;
    }

    isRendering = true;

    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });

        // 清空之前的内容
        viewer.innerHTML = '';

        // 创建 canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.className = 'pdf-page-canvas';

        viewer.appendChild(canvas);

        // 渲染 PDF 页面到 canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // 渲染文本层（用于选中文本）
        const textContent = await page.getTextContent();
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'text-layer';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        viewer.appendChild(textLayerDiv);

        // 使用 PDF.js 的文本层渲染
        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        });

        // 更新 UI
        currentPageInput.value = pageNum;
        currentPage = pageNum;

    } catch (error) {
        console.error('渲染页面失败:', error);
        viewer.innerHTML = `<div class="pdf-error">页面渲染失败: ${escapeHtml(error.message)}</div>`;
    } finally {
        isRendering = false;

        if (pendingPage !== null) {
            const nextPage = pendingPage;
            pendingPage = null;
            renderPage(nextPage);
        }
    }
}

/**
 * 加载 PDF 文档
 * @param {string} url 
 */
async function loadPdf(url) {
    try {
        pdfTitleSpan.textContent = '加载中...';

        // 解码 URL（处理双重编码问题）
        let decodedUrl = url;
        try {
            // 检查是否需要解码
            if (url.includes('%')) {
                decodedUrl = decodeURIComponent(url);
            }
        } catch (e) {
            // 解码失败则使用原 URL
            decodedUrl = url;
        }

        const loadingTask = pdfjsLib.getDocument({
            url: decodedUrl,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
            cMapPacked: true,
        });

        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        totalPagesSpan.textContent = totalPages;

        // 提取文件名作为标题
        const filename = decodedUrl.split('/').pop()?.split('?')[0] || 'PDF 文档';
        pdfTitleSpan.textContent = decodeURIComponent(filename);

        // 初始适应宽度
        await fitToWidth();

        // 渲染第一页
        await renderPage(1);

    } catch (error) {
        console.error('加载 PDF 失败:', error);
        viewer.innerHTML = `
            <div class="pdf-error">
                <h3>⚠️ PDF 加载失败</h3>
                <p>${escapeHtml(error.message)}</p>
                <p>可能的原因：</p>
                <ul>
                    <li>PDF 文件不存在或 URL 无效</li>
                    <li>网络连接问题</li>
                    <li>PDF 文件已损坏或受密码保护</li>
                    <li>跨域资源限制 (CORS)</li>
                </ul>
                <button onclick="location.reload()">重新加载</button>
            </div>
        `;
        pdfTitleSpan.textContent = '加载失败';
    }
}

/**
 * 适应宽度
 */
async function fitToWidth() {
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = viewerContainer.clientWidth - 40; // 减去 padding
    currentScale = containerWidth / viewport.width;
    updateZoomLevel();
}

/**
 * 更新缩放显示
 */
function updateZoomLevel() {
    zoomLevelSpan.textContent = `${Math.round(currentScale * 100)}%`;
}

// ==================== 事件处理 ====================

// 上一页
prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        renderPage(currentPage - 1);
    }
});

// 下一页
nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        renderPage(currentPage + 1);
    }
});

// 页码输入
currentPageInput.addEventListener('change', () => {
    let pageNum = parseInt(currentPageInput.value, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (pageNum > totalPages) pageNum = totalPages;
    renderPage(pageNum);
});

// 缩小
zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.25) {
        currentScale -= 0.25;
        updateZoomLevel();
        renderPage(currentPage);
    }
});

// 放大
zoomInBtn.addEventListener('click', () => {
    if (currentScale < 4.0) {
        currentScale += 0.25;
        updateZoomLevel();
        renderPage(currentPage);
    }
});

// 适应宽度
fitWidthBtn.addEventListener('click', async () => {
    await fitToWidth();
    renderPage(currentPage);
});

// 下载 PDF
downloadBtn.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pdfUrl = urlParams.get('url');
    if (pdfUrl) {
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = '';
        a.click();
    }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
            if (currentPage > 1) renderPage(currentPage - 1);
            break;
        case 'ArrowRight':
        case 'PageDown':
            if (currentPage < totalPages) renderPage(currentPage + 1);
            break;
        case '+':
        case '=':
            zoomInBtn.click();
            break;
        case '-':
            zoomOutBtn.click();
            break;
    }
});

// 滚轮缩放（Ctrl + 滚轮）
viewerContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomInBtn.click();
        } else {
            zoomOutBtn.click();
        }
    }
});

// ==================== 翻译功能 ====================

let hideFloatButtonsTimeout = null;

// 移除悬浮按钮
function removeFloatButtons() {
    if (hideFloatButtonsTimeout) {
        clearTimeout(hideFloatButtonsTimeout);
        hideFloatButtonsTimeout = null;
    }
    floatButtons.style.display = 'none';
}

// 移除弹窗
function removePopup() {
    translatorPopup.style.display = 'none';
}

// 处理文本选中
document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // 如果点击在弹窗或按钮内，不处理
        if (e.target.closest('.translator-popup') ||
            e.target.closest('.translator-float-buttons')) {
            return;
        }

        removeFloatButtons();

        if (!text || !/[a-zA-Z]/.test(text)) {
            return;
        }

        // 显示悬浮按钮
        floatButtons.style.display = 'flex';
        floatButtons.style.left = `${e.clientX + 10}px`;
        floatButtons.style.top = `${e.clientY - 20}px`;

        // 绑定事件
        const speakBtn = floatButtons.querySelector('.speak-btn');
        const translateBtn = floatButtons.querySelector('.translate-btn');
        const closeBtn = floatButtons.querySelector('.close-floating-btn');

        // 移除旧的事件监听器
        const newSpeakBtn = speakBtn.cloneNode(true);
        const newTranslateBtn = translateBtn.cloneNode(true);
        const newCloseBtn = closeBtn.cloneNode(true);
        speakBtn.replaceWith(newSpeakBtn);
        translateBtn.replaceWith(newTranslateBtn);
        closeBtn.replaceWith(newCloseBtn);

        newSpeakBtn.addEventListener('mouseenter', () => speakText(text));
        newTranslateBtn.addEventListener('mouseenter', () => translateText(text, e.clientX, e.clientY));
        newCloseBtn.addEventListener('click', removeFloatButtons);

        // 鼠标离开后延迟隐藏
        floatButtons.addEventListener('mouseleave', () => {
            hideFloatButtonsTimeout = setTimeout(removeFloatButtons, 500);
        });

        floatButtons.addEventListener('mouseenter', () => {
            if (hideFloatButtonsTimeout) {
                clearTimeout(hideFloatButtonsTimeout);
                hideFloatButtonsTimeout = null;
            }
        });

    }, 50);
});

// 翻译文本
async function translateText(text, x, y) {
    removeFloatButtons();

    // 显示弹窗
    translatorPopup.style.display = 'block';
    translatorPopup.style.left = `${x + 10}px`;
    translatorPopup.style.top = `${y + 10}px`;

    const contentEl = translatorPopup.querySelector('.translator-popup-content');
    contentEl.innerHTML = '<div class="translator-loading">正在翻译...</div>';

    // 绑定关闭按钮
    translatorPopup.querySelector('.translator-close-btn').onclick = removePopup;

    try {
        const response = await sendMessageSafe({
            action: 'translate',
            text: text
        });

        if (response?.success) {
            contentEl.innerHTML = `<div class="translator-result">${escapeHtml(response.data.translated)}</div>`;
        } else {
            contentEl.innerHTML = `<div class="translator-error">❌ ${escapeHtml(response?.error || '翻译失败')}</div>`;
        }
    } catch (error) {
        contentEl.innerHTML = `<div class="translator-error">❌ ${escapeHtml(error.message)}</div>`;
    }
}

// 点击其他地方关闭
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.translator-popup') &&
        !e.target.closest('.translator-float-buttons')) {
        removePopup();
    }
});

// ==================== 初始化 ====================

// 预加载语音
if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

// 从 URL 参数获取 PDF 地址并加载
const urlParams = new URLSearchParams(window.location.search);
const pdfUrl = urlParams.get('url');

if (pdfUrl) {
    loadPdf(pdfUrl);
} else {
    viewer.innerHTML = `
        <div class="pdf-error">
            <h3>⚠️ 未指定 PDF 文件</h3>
            <p>请通过扩展程序打开 PDF 文件。</p>
        </div>
    `;
    pdfTitleSpan.textContent = '无文件';
}

console.log('快译 PDF 阅读器已加载');
