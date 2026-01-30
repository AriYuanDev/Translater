/**
 * 快译 - Chrome 翻译扩展内容脚本 (Refactored)
 */

(async function () {
    'use strict';

    // 防止重复注入
    if (window.__translatorExtensionLoaded) return;
    window.__translatorExtensionLoaded = true;

    // 动态导入工具函数
    let utils;
    try {
        const utilsUrl = chrome.runtime.getURL('utils.js');
        utils = await import(utilsUrl);
    } catch (e) {
        console.log('[Translater] 扩展上下文已失效，请刷新页面');
        return;
    }

    const {
        escapeHtml,
        isAllEnglish,
        createSpeakerSVG,
        calculatePopupPosition,
        sendMessageSafe,
        speakText,
        isContextValid,
        getURLSafe
    } = utils;

    // 预加载语音引擎
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.getVoices();
        speechSynthesis.addEventListener('voiceschanged', () => {
            console.log('[Translater] 语音引擎已就绪');
        }, { once: true });
    }

    // ==================== Shadow DOM 设置 ====================

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
            // 设置 Host 为固定全屏但不可交互，仅其内部子元素可交互
            Object.assign(shadowHost.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: '2147483647',
                border: 'none',
                padding: '0',
                margin: '0',
                visibility: 'visible',
                display: 'block'
            });
            document.documentElement.appendChild(shadowHost);
            shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

            const styleLink = document.createElement('link');
            styleLink.rel = 'stylesheet';
            styleLink.href = getURLSafe('styles.css');
            shadowRoot.appendChild(styleLink);
        }
        return shadowRoot;
    }

    // ==================== UI 构建工具 (Safe DOM API) ====================

    function createCloseButton(onClick) {
        const btn = document.createElement('button');
        btn.className = 'translator-close-btn';
        btn.title = '关闭';
        btn.textContent = '×';
        btn.addEventListener('click', onClick);
        return btn;
    }

    function createSpeakButton(onClick) {
        const btn = document.createElement('button');
        btn.className = 'translator-speak-btn';
        btn.title = '朗读';
        btn.innerHTML = createSpeakerSVG();
        if (onClick) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
        }
        return btn;
    }

    function removeAllPopups() {
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        if (currentFloatButtons) {
            currentFloatButtons.remove();
            currentFloatButtons = null;
        }
    }

    // ==================== 翻译弹窗渲染 ====================

    function showPopup(x, y, initialContent) {
        const root = ensureShadowRoot();
        removeAllPopups();

        currentPopup = document.createElement('div');
        currentPopup.className = 'translator-popup';
        currentPopup.style.pointerEvents = 'auto'; // 确保内容可点击
        currentPopup.appendChild(initialContent);

        root.appendChild(currentPopup);

        // 初始定位使用固定宽度预估，避免 getBoundingClientRect 还没渲染出来
        const pos = calculatePopupPosition(x, y, 350, 200);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

        return currentPopup;
    }

    function createLoadingPopup(word) {
        const container = document.createElement('div');
        container.className = 'translator-popup-content';

        const header = document.createElement('div');
        header.className = 'translator-word-header';

        const wordInfo = document.createElement('div');
        const wordSpan = document.createElement('span');
        wordSpan.className = 'translator-word';
        wordSpan.textContent = word;
        wordInfo.appendChild(wordSpan);

        header.appendChild(wordInfo);
        header.appendChild(createSpeakButton(() => speakText(word)));

        const meanings = document.createElement('div');
        meanings.className = 'translator-meanings';
        const loading = document.createElement('div');
        loading.className = 'translator-loading';
        loading.textContent = '正在查询...';
        meanings.appendChild(loading);

        container.appendChild(header);
        container.appendChild(meanings);

        const fragment = document.createDocumentFragment();
        fragment.appendChild(createCloseButton(removeAllPopups));
        fragment.appendChild(container);

        return fragment;
    }

    function updatePopupWithData(data, word) {
        if (!currentPopup || !data) {
            console.error('[Translater] updatePopupWithData 收到无效数据:', data);
            return;
        }

        const container = currentPopup.querySelector('.translator-popup-content');
        if (!container) return;

        container.innerHTML = ''; // 清空加载状态

        // Header
        const header = document.createElement('div');
        header.className = 'translator-word-header';

        const wordInfo = document.createElement('div');
        const wordSpan = document.createElement('span');
        wordSpan.className = 'translator-word';
        wordSpan.textContent = word;
        wordInfo.appendChild(wordSpan);

        if (data.phonetic) {
            const phoneticSpan = document.createElement('span');
            phoneticSpan.className = 'translator-phonetic';
            phoneticSpan.textContent = data.phonetic;
            wordInfo.appendChild(phoneticSpan);
        }

        header.appendChild(wordInfo);

        // Find best audio
        let audioUrl = '';
        if (data.phonetics) {
            const best = data.phonetics.find(p => p.audio && (p.audio.includes('us_pron') || p.audio.includes('-us')));
            audioUrl = best ? best.audio : (data.phonetics[0]?.audio || '');
        }

        const speakHandler = () => {
            if (audioUrl) {
                new Audio(audioUrl).play().catch(() => speakText(word));
            } else {
                speakText(word);
            }
        };

        header.appendChild(createSpeakButton(speakHandler));

        // Meanings
        const meaningsCont = document.createElement('div');
        meaningsCont.className = 'translator-meanings';

        if (data.meanings && data.meanings.length > 0) {
            data.meanings.slice(0, 3).forEach(meaning => {
                const item = document.createElement('div');
                item.className = 'translator-meaning-item';

                const pos = document.createElement('span');
                pos.className = 'translator-pos';
                pos.textContent = meaning.partOfSpeech;
                item.appendChild(pos);

                meaning.definitions.slice(0, 2).forEach(def => {
                    const d = document.createElement('div');
                    d.className = 'translator-definition';
                    d.textContent = def.definition;
                    item.appendChild(d);

                    if (def.example) {
                        const ex = document.createElement('div');
                        ex.className = 'translator-example';
                        ex.textContent = `"${def.example}"`;
                        item.appendChild(ex);
                    }
                });
                meaningsCont.appendChild(item);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'translator-definition';
            empty.textContent = '暂无详细释义';
            meaningsCont.appendChild(empty);
        }

        container.appendChild(header);
        container.appendChild(meaningsCont);

        // 仅在宽度大幅度变化导致溢出时重新对齐（可选），目前直接维持原位更平稳
    }

    function updatePopupWithError(word, message) {
        if (!currentPopup) return;
        const meanings = currentPopup.querySelector('.translator-meanings');
        if (meanings) {
            meanings.innerHTML = '';
            const err = document.createElement('div');
            err.className = 'translator-error';
            err.textContent = `❌ ${message}`;
            meanings.appendChild(err);
        }
    }

    // ==================== 事件监听 ====================

    document.addEventListener('dblclick', async (e) => {
        if (!isContextValid()) return;
        const selection = window.getSelection();
        const word = selection.toString().trim();

        if (!word || !isAllEnglish(word)) return;

        showPopup(e.clientX, e.clientY, createLoadingPopup(word));

        const response = await sendMessageSafe({
            action: 'fetchDictionary',
            word: word.toLowerCase()
        });

        if (response && response.success && response.data) {
            updatePopupWithData(response.data, word);
            // Auto speak
            const bestAudio = response.data.phonetics?.find(p => p.audio && (p.audio.includes('us_pron') || p.audio.includes('-us')))?.audio;
            if (bestAudio) new Audio(bestAudio).play().catch(() => speakText(word));
            else speakText(word);
        } else if (response && response.error && (response.error.includes('更新') || response.error.includes('失效'))) {
            updatePopupWithError(word, response.error);
        } else {
            const trRes = await sendMessageSafe({ action: 'translate', text: word });
            if (trRes && trRes.success && trRes.data) {
                const container = currentPopup.querySelector('.translator-meanings');
                if (container) {
                    container.innerHTML = '';
                    const res = document.createElement('div');
                    res.className = 'translator-translation';
                    res.textContent = trRes.data.translated || '翻译结果为空';
                    container.appendChild(res);
                }
            } else {
                updatePopupWithError(word, (trRes && trRes.error) || (response && response.error) || '查询失败');
            }
        }
    });

    // ==================== 悬浮按钮 (Refactored) ====================

    function removeFloatButtons() {
        if (hideFloatButtonsTimeout) {
            clearTimeout(hideFloatButtonsTimeout);
            hideFloatButtonsTimeout = null;
        }
        if (currentFloatButtons) {
            currentFloatButtons.remove();
            currentFloatButtons = null;
        }
    }

    document.addEventListener('mouseup', (e) => {
        if (!isContextValid()) return;
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (e.target.id === 'translator-extension-host') return;
            removeFloatButtons();

            if (!text || (text.split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text)) || !isAllEnglish(text)) return;

            const root = ensureShadowRoot();
            currentFloatButtons = document.createElement('div');
            currentFloatButtons.className = 'translator-float-buttons';

            const speakBtn = document.createElement('button');
            speakBtn.className = 'translator-float-btn speak-btn';
            speakBtn.innerHTML = createSpeakerSVG();
            speakBtn.setAttribute('data-tooltip', '朗读');
            speakBtn.onmouseenter = () => speakText(text);

            const transBtn = document.createElement('button');
            transBtn.className = 'translator-float-btn translate-btn';
            transBtn.textContent = '译';
            transBtn.setAttribute('data-tooltip', '翻译');
            transBtn.onmouseenter = () => translateSelection(text, e.clientX, e.clientY);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'translator-float-btn close-floating-btn';
            closeBtn.textContent = '×';
            closeBtn.setAttribute('data-tooltip', '关闭');
            closeBtn.onclick = removeFloatButtons;
            closeBtn.onmouseenter = removeFloatButtons;

            currentFloatButtons.appendChild(speakBtn);
            currentFloatButtons.appendChild(transBtn);
            currentFloatButtons.appendChild(closeBtn);
            currentFloatButtons.style.pointerEvents = 'auto';
            root.appendChild(currentFloatButtons);

            // Position
            const btnWidth = 32;
            const gap = 30;
            const containerWidth = btnWidth * 3 + gap + 6;
            let left = Math.max(10, Math.min(e.clientX - btnWidth - gap / 2, window.innerWidth - containerWidth - 10));
            let top = Math.max(10, Math.min(e.clientY - btnWidth / 2, window.innerHeight - btnWidth - 10));

            currentFloatButtons.style.left = left + 'px';
            currentFloatButtons.style.top = top + 'px';
            currentFloatButtons.style.gap = gap + 'px';

            currentFloatButtons.addEventListener('mouseleave', () => {
                hideFloatButtonsTimeout = setTimeout(removeFloatButtons, 500);
            });
            currentFloatButtons.addEventListener('mouseenter', () => {
                if (hideFloatButtonsTimeout) clearTimeout(hideFloatButtonsTimeout);
            });
        }, 20);
    });

    async function translateSelection(text, x, y) {
        removeFloatButtons();
        const root = ensureShadowRoot();

        currentPopup = document.createElement('div');
        currentPopup.className = 'translator-sentence-popup';
        currentPopup.style.pointerEvents = 'auto';

        const closeBtn = createCloseButton(removeAllPopups);
        const content = document.createElement('div');
        content.className = 'translator-sentence-content';
        const loading = document.createElement('div');
        loading.className = 'translator-loading';
        loading.textContent = '正在翻译...';
        content.appendChild(loading);

        currentPopup.appendChild(closeBtn);
        currentPopup.appendChild(content);
        root.appendChild(currentPopup);

        const pos = calculatePopupPosition(x, y, 350, 150);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

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

    // Dismissal
    document.addEventListener('mousedown', (e) => {
        if (!isContextValid()) return;
        // 使用 composedPath() 穿透 Shadow DOM 边界进行检测
        const path = e.composedPath();
        const isClickInside = path.some(el =>
            el === shadowHost ||
            (el.classList && (
                el.classList.contains('translator-popup') ||
                el.classList.contains('translator-float-buttons') ||
                el.classList.contains('translator-sentence-popup')
            ))
        );

        if (!isClickInside && currentPopup) {
            removeAllPopups();
        }
    });

    // 辅助设置漂浮按钮容器
    function setupFloatButtons(root, buttons) {
        buttons.style.pointerEvents = 'auto';
        root.appendChild(buttons);
    }

    console.log('快译扩展已加载 (Shadow DOM 版)');
})();
