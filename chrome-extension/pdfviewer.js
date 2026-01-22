// 快译 PDF 阅读器脚本

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
const translatorPopup = document.getElementById('translatorPopup');
const floatButtons = document.getElementById('floatButtons');

// ==================== PDF 加载与渲染 ====================

// 从 URL 参数获取 PDF 地址
function getPdfUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('url');
}

// 加载 PDF
async function loadPdf(url) {
    try {
        showLoading(true);

        // 加载 PDF 文档
        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
            cMapPacked: true,
        });

        pdfDoc = await loadingTask.promise;

        // 更新 UI
        totalPagesSpan.textContent = pdfDoc.numPages;
        pdfTitleSpan.textContent = decodeURIComponent(url.split('/').pop().split('?')[0]);

        // 设置默认缩放为 190%
        await setDefaultZoom();

        // 渲染所有页面
        await renderAllPages();

        showLoading(false);
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        showError('无法加载 PDF 文件，请检查 URL 是否正确。');
    }
}

// 设置默认缩放比例为 190%
async function setDefaultZoom() {
    currentScale = 1.9; // 默认 190% 缩放
    updateZoomLevel();
}

// 计算适应宽度的缩放比例
async function calculateFitWidth() {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = viewerContainer.clientWidth - 40; // 减去 padding
    currentScale = containerWidth / viewport.width;
    updateZoomLevel();
}

// 渲染所有页面（懒加载：先占位，后渲染）
async function renderAllPages() {
    viewer.innerHTML = '';
    renderedPages.clear();

    // 创建 IntersectionObserver
    const observerOptions = {
        root: viewerContainer,
        rootMargin: '200px', // 提前 200px 开始渲染
        threshold: 0
    };

    const intersectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageContainer = entry.target;
                const pageNum = parseInt(pageContainer.dataset.pageNum);

                // 只有当页面尚未渲染内容时才渲染
                if (!pageContainer.dataset.rendered) {
                    renderPageContent(pageNum, pageContainer);
                    pageContainer.dataset.rendered = 'true';
                }

                // 停止观察已进入视口的元素（可选：如果需要回收内存，可以不停止观察，在离开视口时清空内容）
                observer.unobserve(pageContainer);
            }
        });
    }, observerOptions);

    // 预先获取页面尺寸信息并创建占位元素
    // 注意：获取 viewport 比较快，render 比较慢
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        await createPagePlaceholder(pageNum, intersectionObserver);
    }
}

// 创建页面占位符
async function createPagePlaceholder(pageNum, observer) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });

    // 创建页面容器
    const pageContainer = document.createElement('div');
    pageContainer.className = 'pdf-page-container';
    pageContainer.dataset.pageNum = pageNum;
    pageContainer.style.width = viewport.width + 'px';
    pageContainer.style.height = viewport.height + 'px';

    // 添加加载 Loading 效果
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'page-loading';
    loadingDiv.textContent = `Loading Page ${pageNum}...`;
    loadingDiv.style.display = 'flex';
    loadingDiv.style.alignItems = 'center';
    loadingDiv.style.justifyContent = 'center';
    loadingDiv.style.height = '100%';
    loadingDiv.style.color = '#888';

    pageContainer.appendChild(loadingDiv);
    viewer.appendChild(pageContainer);

    // 记录到 Map 中以便跳转
    renderedPages.set(pageNum, pageContainer);

    // 开始观察
    observer.observe(pageContainer);
}

// 渲染单个页面内容（canvas 和 textLayer）
async function renderPageContent(pageNum, pageContainer) {
    console.log(`[Debug] 开始渲染页面内容 ${pageNum}`);

    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });

        // 清空占位 Loading
        pageContainer.innerHTML = '';

        // 创建 canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width * window.devicePixelRatio;
        canvas.height = viewport.height * window.devicePixelRatio;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        context.scale(window.devicePixelRatio, window.devicePixelRatio);

        pageContainer.appendChild(canvas);

        // 创建文本层
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        // PDF.js 4.x 需要设置 --scale-factor CSS 变量
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        pageContainer.appendChild(textLayerDiv);

        // 渲染页面内容到 canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        console.log(`[Debug] 页面 ${pageNum} Canvas 渲染完成`);

        // 获取文本内容 - 尝试不同选项来处理自定义字体编码
        const textContent = await page.getTextContent({
            includeMarkedContent: true,
            disableNormalization: false
        });

        // 手动创建文本层
        const items = textContent.items;
        const styles = textContent.styles;

        // 存储需要调整宽度的 span
        const spansToAdjust = [];

        for (const item of items) {
            if (!item.str || item.str.trim() === '') continue;

            const span = document.createElement('span');
            span.textContent = item.str;

            // 获取字体样式
            const style = styles[item.fontName];
            const fontFamily = style?.fontFamily || 'sans-serif';

            // 使用 viewport 转换坐标
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);

            // 计算字体大小和位置
            const fontHeight = Math.hypot(tx[2], tx[3]);

            span.style.position = 'absolute';
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.fontFamily = fontFamily;
            span.style.color = 'transparent';
            span.style.whiteSpace = 'pre';
            span.style.pointerEvents = 'all';
            span.style.transformOrigin = '0% 0%';
            span.style.lineHeight = '1';

            // 计算旋转
            const angle = Math.atan2(tx[1], tx[0]);
            if (Math.abs(angle) > 0.001) {
                span.style.transform = `rotate(${angle}rad)`;
            }

            textLayerDiv.appendChild(span);

            // 如果有宽度信息，记录下来稍后调整
            if (item.width > 0) {
                spansToAdjust.push({
                    span: span,
                    targetWidth: item.width * viewport.scale,
                    angle: angle
                });
            }
        }

        // 第二遍：测量实际宽度并应用 scaleX 变换来精确匹配
        for (const { span, targetWidth, angle } of spansToAdjust) {
            const naturalWidth = span.offsetWidth;
            if (naturalWidth > 0 && Math.abs(targetWidth - naturalWidth) > 0.5) {
                const scaleX = targetWidth / naturalWidth;
                // 需要保留旋转变换
                if (Math.abs(angle) > 0.001) {
                    span.style.transform = `rotate(${angle}rad) scaleX(${scaleX})`;
                } else {
                    span.style.transform = `scaleX(${scaleX})`;
                }
            }
        }

        console.log(`[Debug] 页面 ${pageNum} 文本层创建完成`);
    } catch (err) {
        console.error(`渲染页面 ${pageNum} 失败:`, err);
        pageContainer.innerHTML = '<div style="padding:20px;color:red;">页面加载失败</div>';
    }
}

// ==================== 工具栏功能 ====================

// 上一页
document.getElementById('prevPage').addEventListener('click', () => {
    const currentPage = parseInt(currentPageInput.value);
    if (currentPage > 1) {
        scrollToPage(currentPage - 1);
    }
});

// 下一页
document.getElementById('nextPage').addEventListener('click', () => {
    const currentPage = parseInt(currentPageInput.value);
    if (currentPage < pdfDoc.numPages) {
        scrollToPage(currentPage + 1);
    }
});

// 页码输入
currentPageInput.addEventListener('change', () => {
    let page = parseInt(currentPageInput.value);
    page = Math.max(1, Math.min(page, pdfDoc.numPages));
    scrollToPage(page);
});

// 缩小
document.getElementById('zoomOut').addEventListener('click', () => {
    if (currentScale > 0.25) {
        currentScale -= 0.25;
        updateZoomLevel();
        renderAllPages();
    }
});

// 放大
document.getElementById('zoomIn').addEventListener('click', () => {
    if (currentScale < 4.0) {
        currentScale += 0.25;
        updateZoomLevel();
        renderAllPages();
    }
});

// 适应宽度
document.getElementById('fitWidth').addEventListener('click', async () => {
    await calculateFitWidth();
    await renderAllPages();
});

// 下载 PDF
document.getElementById('downloadPdf').addEventListener('click', () => {
    const url = getPdfUrl();
    if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = decodeURIComponent(url.split('/').pop().split('?')[0]);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

// 滚动到指定页面
function scrollToPage(pageNum) {
    const pageContainer = renderedPages.get(pageNum);
    if (pageContainer) {
        pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        currentPageInput.value = pageNum;
    }
}

// 更新缩放级别显示
function updateZoomLevel() {
    zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%';
}

// 监听滚动更新当前页码
viewerContainer.addEventListener('scroll', () => {
    const containerRect = viewerContainer.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 3;

    for (const [pageNum, container] of renderedPages) {
        const rect = container.getBoundingClientRect();
        if (rect.top <= centerY && rect.bottom >= centerY) {
            currentPageInput.value = pageNum;
            break;
        }
    }
});

// ==================== 翻译功能 ====================

// 创建发音 SVG
function createSpeakerSVG() {
    return `<svg viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>`;
}

// 检测文本是否包含英文字母
function containsEnglish(text) {
    return /[a-zA-Z]/.test(text);
}

// 检测文本是否全部为英文（只包含英文字母、数字、常见标点和空格）
function isAllEnglish(text) {
    // 允许：英文字母、数字、常见英文标点、空格
    // 排除：中文、日文、韩文等非拉丁字符
    return /^[a-zA-Z0-9\s.,!?;:'"\-()\[\]{}@#$%^&*+=<>/\\|`~]+$/.test(text);
}

// HTML 转义函数，防止 XSS 攻击
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 使用 TTS 朗读（优先 Piper p5712 高质量语音）- 支持切换（再次点击停止）
function speakText(text) {
    // 如果正在朗读，则停止
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;

    const voices = window.speechSynthesis.getVoices();
    // 优先 p8699 语音（libritts 高质量英语语音），其次其他 Piper 语音，再次 Samantha，最后任意美式英语
    const usVoice = voices.find(v => v.name.includes('p5712') && v.lang.startsWith('en'))
        || voices.find(v => v.name.includes('Piper') && v.lang.startsWith('en'))
        || voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha'))
        || voices.find(v => v.lang === 'en-US');

    if (usVoice) {
        utterance.voice = usVoice;
        console.log('[TTS] 使用语音:', usVoice.name);
    }
    window.speechSynthesis.speak(utterance);
}

// 播放音频
function playAudio(audioUrl, fallbackWord) {
    if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch(() => {
            if (fallbackWord) speakText(fallbackWord);
        });
    } else if (fallbackWord) {
        speakText(fallbackWord);
    }
}

// 自动朗读单词
function autoSpeakWord(data, word) {
    let audioUrl = '';

    if (data.phonetics && data.phonetics.length > 0) {
        for (const p of data.phonetics) {
            // 优先选择美式发音（MW、Cambridge、老 API）
            if (p.audio && (p.audio.includes('merriam-webster.com') || p.audio.includes('us_pron') || p.audio.includes('-us') || p.audio.includes('/us/'))) {
                audioUrl = p.audio;
                break;
            }
            if (p.audio && !audioUrl) audioUrl = p.audio;
        }
    }

    if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch(() => speakText(word));
    } else {
        speakText(word);
    }
}

// 隐藏所有弹窗
function hideAllPopups() {
    translatorPopup.style.display = 'none';
    floatButtons.style.display = 'none';
}

// 计算弹窗位置
function calculatePopupPosition(x, y, width, height) {
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + padding;
    let top = y + padding;

    if (left + width > viewportWidth - padding) {
        left = x - width - padding;
    }
    if (top + height > viewportHeight - padding) {
        top = y - height - padding;
    }

    return {
        left: Math.max(padding, left),
        top: Math.max(padding, top)
    };
}

// 双击翻译单词
viewer.addEventListener('dblclick', async (e) => {
    const selection = window.getSelection();
    const word = selection.toString().trim();

    hideAllPopups();

    // 如果不是英文单词，直接返回
    if (!word || !/^[a-zA-Z]+$/.test(word)) {
        return;
    }

    // 显示加载状态（包含原单词）
    translatorPopup.style.display = 'block';
    translatorPopup.innerHTML = `
        <button class="translator-close-btn" title="关闭">×</button>
        <div class="translator-popup-content">
            <div class="translator-word-header">
                <div>
                    <span class="translator-word">${escapeHtml(word)}</span>
                </div>
                <button class="translator-speak-btn" title="朗读">
                    ${createSpeakerSVG()}
                </button>
            </div>
            <div class="translator-meanings">
                <div class="translator-loading">正在查询...</div>
            </div>
        </div>
    `;

    const pos = calculatePopupPosition(e.clientX, e.clientY, 350, 200);
    translatorPopup.style.left = pos.left + 'px';
    translatorPopup.style.top = pos.top + 'px';

    // 绑定加载状态的按钮事件
    translatorPopup.querySelector('.translator-close-btn').addEventListener('click', hideAllPopups);
    translatorPopup.querySelector('.translator-speak-btn').addEventListener('click', () => {
        speakText(word);
    });

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'fetchDictionary',
            word: word.toLowerCase()
        });

        if (response.success) {
            renderWordPopup(response.data, word);
            autoSpeakWord(response.data, word);
        } else {
            // 尝试翻译
            const translateResponse = await chrome.runtime.sendMessage({
                action: 'translate',
                text: word
            });

            if (translateResponse.success) {
                renderSimpleTranslation(word, translateResponse.data.translated);
                speakText(word);
            } else {
                renderError(word, response.error || '查询失败');
            }
        }
    } catch (error) {
        renderError(word, '网络错误，请重试');
    }
});

// 渲染单词弹窗
function renderWordPopup(data, originalWord) {
    let phonetic = data.phonetic || '';
    let audioUrl = '';

    if (data.phonetics && data.phonetics.length > 0) {
        for (const p of data.phonetics) {
            // 优先选择美式发音（MW、Cambridge、老 API）
            if (p.audio && (p.audio.includes('merriam-webster.com') || p.audio.includes('us_pron') || p.audio.includes('-us') || p.audio.includes('/us/'))) {
                audioUrl = p.audio;
                if (p.text) phonetic = p.text;
                break;
            }
            if (p.text && !phonetic) phonetic = p.text;
            if (p.audio && !audioUrl) audioUrl = p.audio;
        }
    }

    let meaningsHtml = '';
    if (data.meanings && data.meanings.length > 0) {
        for (const meaning of data.meanings.slice(0, 3)) {
            const pos = meaning.partOfSpeech;
            const definitions = meaning.definitions.slice(0, 2);

            let defsHtml = definitions.map(def => {
                let html = `<div class="translator-definition">${escapeHtml(def.definition)}</div>`;
                if (def.example) {
                    html += `<div class="translator-example">"${escapeHtml(def.example)}"</div>`;
                }
                return html;
            }).join('');

            meaningsHtml += `
                <div class="translator-meaning-item">
                    <span class="translator-pos">${escapeHtml(pos)}</span>
                    ${defsHtml}
                </div>
            `;
        }
    }

    translatorPopup.innerHTML = `
        <button class="translator-close-btn" title="关闭">×</button>
        <div class="translator-popup-content">
            <div class="translator-word-header">
                <div>
                    <span class="translator-word">${escapeHtml(originalWord)}</span>
                    <span class="translator-phonetic">${escapeHtml(phonetic)}</span>
                </div>
                <button class="translator-speak-btn" title="朗读">
                    ${createSpeakerSVG()}
                </button>
            </div>
            <div class="translator-meanings">
                ${meaningsHtml || '<div class="translator-definition">暂无详细释义</div>'}
            </div>
        </div>
    `;

    // 绑定事件
    translatorPopup.querySelector('.translator-close-btn').addEventListener('click', hideAllPopups);
    translatorPopup.querySelector('.translator-speak-btn').addEventListener('click', () => {
        if (audioUrl) {
            playAudio(audioUrl, originalWord);
        } else {
            speakText(originalWord);
        }
    });
}

// 渲染简单翻译
function renderSimpleTranslation(word, translation) {
    translatorPopup.innerHTML = `
        <button class="translator-close-btn" title="关闭">×</button>
        <div class="translator-popup-content">
            <div class="translator-word-header">
                <div>
                    <span class="translator-word">${escapeHtml(word)}</span>
                </div>
                <button class="translator-speak-btn" title="朗读">
                    ${createSpeakerSVG()}
                </button>
            </div>
            <div class="translator-meanings">
                <div class="translator-translation">${escapeHtml(translation)}</div>
            </div>
        </div>
    `;

    translatorPopup.querySelector('.translator-close-btn').addEventListener('click', hideAllPopups);
    translatorPopup.querySelector('.translator-speak-btn').addEventListener('click', () => speakText(word));
}

// 渲染错误（显示原单词和错误提示）
function renderError(word, message) {
    translatorPopup.innerHTML = `
        <button class="translator-close-btn" title="关闭">×</button>
        <div class="translator-popup-content">
            <div class="translator-word-header">
                <div>
                    <span class="translator-word">${escapeHtml(word)}</span>
                </div>
                <button class="translator-speak-btn" title="朗读">
                    ${createSpeakerSVG()}
                </button>
            </div>
            <div class="translator-meanings">
                <div class="translator-error">❌ ${escapeHtml(message)}</div>
            </div>
        </div>
    `;

    translatorPopup.querySelector('.translator-close-btn').addEventListener('click', hideAllPopups);
    translatorPopup.querySelector('.translator-speak-btn').addEventListener('click', () => speakText(word));
}

// ==================== 选中文本悬浮按钮 ====================

let hideFloatButtonsTimeout = null;

viewer.addEventListener('mouseup', (e) => {
    setTimeout(() => handleTextSelection(e), 50);
});

function handleTextSelection(e) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    // 如果点击在弹窗内，不处理
    if (e.target.closest('.translator-popup') ||
        e.target.closest('.translator-float-buttons') ||
        e.target.closest('.translator-sentence-popup')) {
        return;
    }

    // 清理悬浮按钮
    floatButtons.style.display = 'none';
    if (hideFloatButtonsTimeout) {
        clearTimeout(hideFloatButtonsTimeout);
        hideFloatButtonsTimeout = null;
    }

    if (!text) return;

    // 单个英文单词由双击处理
    if (text.split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text)) return;

    // 只有选中的文本全部是英文时才显示悬浮按钮
    if (!isAllEnglish(text)) return;

    // 显示悬浮按钮
    floatButtons.style.display = 'flex';

    // 按钮布局：关闭 - 发音 - [鼠标] - 翻译
    const btnWidth = 32;  // 单个按钮宽度
    const gap = 30;  // 按钮之间的间距

    // 设置 gap
    floatButtons.style.gap = gap + 'px';

    // 计算位置 - 鼠标应该在发音和翻译按钮之间
    // 布局：[发音][gap/2][鼠标][gap/2][翻译]
    // 关闭按钮现在是绝对定位，不占布局空间
    // 鼠标位置到容器左边的距离 = 发音按钮 + gap/2
    const mouseOffset = btnWidth + gap / 2;
    const containerWidth = btnWidth * 2 + gap;  // 2个按钮 + 1个gap

    let left = e.clientX - mouseOffset;
    let top = e.clientY - btnWidth / 2;  // 垂直居中于鼠标

    // 防止超出左边界
    if (left < 10) {
        left = 10;
    }

    // 防止超出右边界
    if (left + containerWidth > window.innerWidth - 10) {
        left = window.innerWidth - containerWidth - 10;
    }

    // 防止超出上下边界
    if (top < 60) top = 60;  // 避开工具栏
    if (top + btnWidth > window.innerHeight - 10) {
        top = window.innerHeight - btnWidth - 10;
    }

    floatButtons.style.left = left + 'px';
    floatButtons.style.top = top + 'px';

    const selectedText = text;
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // 翻译按钮
    const translateBtn = floatButtons.querySelector('.translate-btn');
    translateBtn.onmouseenter = async () => {
        await translateSelection(selectedText, mouseX, mouseY);
    };

    // 朗读按钮
    const speakBtn = floatButtons.querySelector('.speak-btn');
    speakBtn.onmouseenter = () => speakText(selectedText);

    // 关闭按钮
    const closeBtn = floatButtons.querySelector('.close-floating-btn');
    // 移除之前的监听器（如果有）
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    const closeAction = (e) => {
        if (e) e.stopPropagation();
        floatButtons.style.display = 'none';
    };

    newCloseBtn.addEventListener('click', closeAction);
    newCloseBtn.addEventListener('mouseenter', closeAction);

    // 延迟隐藏（朗读中保持显示）
    floatButtons.onmouseleave = () => {
        // 如果正在朗读，等朗读结束后再隐藏
        if (window.speechSynthesis.speaking) {
            const checkSpeaking = setInterval(() => {
                if (!window.speechSynthesis.speaking) {
                    clearInterval(checkSpeaking);
                    hideFloatButtonsTimeout = setTimeout(() => {
                        floatButtons.style.display = 'none';
                    }, 300);
                }
            }, 100);
        } else {
            hideFloatButtonsTimeout = setTimeout(() => {
                floatButtons.style.display = 'none';
            }, 500);
        }
    };

    floatButtons.onmouseenter = () => {
        if (hideFloatButtonsTimeout) {
            clearTimeout(hideFloatButtonsTimeout);
            hideFloatButtonsTimeout = null;
        }
    };
}

// 翻译选中文本
async function translateSelection(text, x, y) {
    floatButtons.style.display = 'none';

    // 创建句子翻译弹窗
    const sentencePopup = document.createElement('div');
    sentencePopup.className = 'translator-sentence-popup';
    sentencePopup.innerHTML = `
        <button class="translator-close-btn" title="关闭">×</button>
        <div class="translator-sentence-content">
            <div class="translator-loading">正在翻译...</div>
        </div>
    `;

    document.body.appendChild(sentencePopup);

    const pos = calculatePopupPosition(x, y, 400, 150);
    sentencePopup.style.left = pos.left + 'px';
    sentencePopup.style.top = pos.top + 'px';

    sentencePopup.querySelector('.translator-close-btn').addEventListener('click', () => {
        sentencePopup.remove();
    });

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'translate',
            text: text
        });

        if (response.success) {
            sentencePopup.querySelector('.translator-sentence-content').innerHTML =
                `<div class="translator-result">${escapeHtml(response.data.translated)}</div>`;
        } else {
            sentencePopup.querySelector('.translator-sentence-content').innerHTML =
                `<div class="translator-error">❌ ${escapeHtml(response.error)}</div>`;
        }
    } catch (error) {
        sentencePopup.querySelector('.translator-sentence-content').innerHTML =
            `<div class="translator-error">❌ 网络错误，请重试</div>`;
    }
}

// ==================== 点击其他地方关闭弹窗 ====================

document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.translator-float-buttons')) return;

    if (translatorPopup.style.display !== 'none' && !translatorPopup.contains(e.target)) {
        translatorPopup.style.display = 'none';
    }

    // 关闭句子翻译弹窗
    const sentencePopups = document.querySelectorAll('.translator-sentence-popup');
    sentencePopups.forEach(popup => {
        if (!popup.contains(e.target)) {
            popup.remove();
        }
    });
});

// ==================== 辅助函数 ====================

// 显示加载状态
function showLoading(show) {
    let overlay = document.querySelector('.loading-overlay');

    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">正在加载 PDF...</div>
            `;
            document.body.appendChild(overlay);
        }
    } else {
        if (overlay) overlay.remove();
    }
}

// 显示错误
function showError(message) {
    showLoading(false);
    viewer.innerHTML = `
        <div class="error-container">
            <div class="error-icon">📄</div>
            <div class="error-message">${escapeHtml(message)}</div>
            <button class="error-retry-btn" id="retryBtn">重试</button>
        </div>
    `;

    // 绑定重试按钮事件
    document.getElementById('retryBtn').addEventListener('click', () => {
        location.reload();
    });
}

// ==================== 预加载语音 ====================

if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

// ==================== 初始化 ====================

const pdfUrl = getPdfUrl();
if (pdfUrl) {
    loadPdf(pdfUrl);
} else {
    showError('未指定 PDF 文件地址');
}

console.log('快译 PDF 阅读器已加载');
