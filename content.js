// 快译 - Chrome 翻译扩展内容脚本

(function () {
    'use strict';

    // 防止重复注入
    if (window.__translatorExtensionLoaded) return;
    window.__translatorExtensionLoaded = true;

    // 存储当前弹窗和按钮元素
    let currentPopup = null;
    let currentFloatButtons = null;
    let hideFloatButtonsTimeout = null;

    // 缓存美式英语语音
    let cachedUSVoice = null;
    let voicesLoaded = false;

    // ==================== 工具函数 ====================

    // 创建发音图标 SVG
    function createSpeakerSVG() {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>`;
    }

    // HTML 转义函数，防止 XSS 攻击（优化版：使用字符串替换而不是创建 DOM）
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 使用 TTS 朗读文本（Web Speech API）
    function speakText(text) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; // 美式英语
        utterance.rate = 0.9; // 稍慢一点的语速
        utterance.pitch = 1;

        // 使用缓存的美式英语语音
        if (cachedUSVoice) {
            utterance.voice = cachedUSVoice;
        }

        window.speechSynthesis.speak(utterance);
    }

    // 加载并缓存语音列表（优先使用 Piper p5712 高质量语音）
    function loadVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && !voicesLoaded) {
            // 优先查找 Piper p5712 语音（libritts 高质量英语语音）
            cachedUSVoice = voices.find(voice =>
                voice.name.includes('p5712') && voice.lang.startsWith('en')
            ) ||
                // 其次查找其他 Piper 英语语音
                voices.find(voice =>
                    voice.name.includes('Piper') && voice.lang.startsWith('en')
                ) ||
                // 再次查找系统美式英语语音
                voices.find(voice =>
                    voice.lang === 'en-US' && voice.name.includes('Samantha')
                ) ||
                voices.find(voice => voice.lang === 'en-US');

            if (cachedUSVoice) {
                console.log('[TTS] 使用语音:', cachedUSVoice.name);
            }
            voicesLoaded = true;
        }
    }

    // 播放音频URL（失败时回退到TTS）
    function playAudio(audioUrl, fallbackWord) {
        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch(() => {
                // 如果音频播放失败，使用 TTS
                console.log('音频播放失败，使用 TTS');
                if (fallbackWord) {
                    speakText(fallbackWord);
                }
            });
        } else if (fallbackWord) {
            speakText(fallbackWord);
        }
    }

    // 自动朗读单词（优先使用API返回的音频）
    function autoSpeakWord(data, word) {
        let audioUrl = '';

        // 尝试获取美式发音音频（优先使用 Cambridge 的 US 发音）
        if (data.phonetics && data.phonetics.length > 0) {
            for (const p of data.phonetics) {
                // 优先选择美式发音（Cambridge 用 us_pron，老 API 用 -us）
                if (p.audio && (p.audio.includes('us_pron') || p.audio.includes('-us'))) {
                    audioUrl = p.audio;
                    break;
                }
                if (p.audio && !audioUrl) {
                    audioUrl = p.audio;
                }
            }
        }

        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch(() => {
                // 如果音频播放失败，使用 TTS
                speakText(word);
            });
        } else {
            speakText(word);
        }
    }

    // 移除所有弹窗和按钮
    function removeAllPopups() {
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        if (currentFloatButtons) {
            currentFloatButtons.remove();
            currentFloatButtons = null;
        }
        if (hideFloatButtonsTimeout) {
            clearTimeout(hideFloatButtonsTimeout);
            hideFloatButtonsTimeout = null;
        }
    }

    // 计算弹窗位置
    function calculatePopupPosition(x, y, popupWidth, popupHeight) {
        const padding = 10;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = x + padding;
        let top = y + padding;

        // 防止超出右边界
        if (left + popupWidth > viewportWidth - padding) {
            left = x - popupWidth - padding;
        }

        // 防止超出下边界
        if (top + popupHeight > viewportHeight - padding) {
            top = y - popupHeight - padding;
        }

        // 确保不会超出左边界和上边界
        left = Math.max(padding, left);
        top = Math.max(padding, top);

        return { left, top };
    }

    // ==================== 双击翻译功能 ====================

    // 处理双击事件
    document.addEventListener('dblclick', async (e) => {
        const selection = window.getSelection();
        const word = selection.toString().trim();

        // 检查是否是英文单词
        if (!word || !/^[a-zA-Z]+$/.test(word)) {
            return;
        }

        // 移除之前的弹窗
        removeAllPopups();

        // 创建弹窗 - 加载时显示原单词
        currentPopup = document.createElement('div');
        currentPopup.className = 'translator-popup';
        currentPopup.innerHTML = `
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

        document.body.appendChild(currentPopup);

        // 绑定加载状态的按钮事件
        currentPopup.querySelector('.translator-close-btn').addEventListener('click', removeAllPopups);
        currentPopup.querySelector('.translator-speak-btn').addEventListener('click', () => {
            speakText(word);
        });

        // 计算位置
        const rect = currentPopup.getBoundingClientRect();
        const pos = calculatePopupPosition(e.clientX, e.clientY, rect.width, 200);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

        try {
            // 通过 background script 获取词典数据
            const response = await chrome.runtime.sendMessage({
                action: 'fetchDictionary',
                word: word.toLowerCase()
            });

            if (response.success) {
                renderWordPopup(response.data, word);
                // 自动朗读单词
                autoSpeakWord(response.data, word);
            } else {
                // 如果词典 API 失败，尝试翻译
                const translateResponse = await chrome.runtime.sendMessage({
                    action: 'translate',
                    text: word
                });

                if (translateResponse.success) {
                    renderSimpleTranslation(word, translateResponse.data.translated);
                    // 自动朗读单词
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
        if (!currentPopup) return;

        // 获取音标
        let phonetic = data.phonetic || '';
        let audioUrl = '';

        // 尝试获取美式音标和音频（兼容 MW、Cambridge 和老 API）
        if (data.phonetics && data.phonetics.length > 0) {
            for (const p of data.phonetics) {
                // 优先选择美式发音
                // MW 格式: merriam-webster.com/audio/prons/en/us/
                // Cambridge 格式: us_pron
                // 老 API 格式: -us
                if (p.audio && (p.audio.includes('merriam-webster.com') || p.audio.includes('us_pron') || p.audio.includes('-us') || p.audio.includes('/us/'))) {
                    audioUrl = p.audio;
                    if (p.text) phonetic = p.text;
                    break;
                }
                if (p.text && !phonetic) phonetic = p.text;
                if (p.audio && !audioUrl) audioUrl = p.audio;
            }
        }

        // 构建词义 HTML
        let meaningsHtml = '';
        if (data.meanings && data.meanings.length > 0) {
            for (const meaning of data.meanings.slice(0, 3)) { // 最多显示3个词性
                const pos = meaning.partOfSpeech;
                const definitions = meaning.definitions.slice(0, 2); // 每个词性最多2个定义

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

        currentPopup.innerHTML = `
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

        // 重新计算位置
        const rect = currentPopup.getBoundingClientRect();
        const currentLeft = parseInt(currentPopup.style.left);
        const currentTop = parseInt(currentPopup.style.top);
        const pos = calculatePopupPosition(currentLeft, currentTop, rect.width, rect.height);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

        // 绑定事件
        currentPopup.querySelector('.translator-close-btn').addEventListener('click', removeAllPopups);
        currentPopup.querySelector('.translator-speak-btn').addEventListener('click', () => {
            // 优先使用音频URL，失败时回退到TTS
            if (audioUrl) {
                playAudio(audioUrl, originalWord);
            } else {
                speakText(originalWord);
            }
        });
    }

    // 渲染简单翻译结果
    function renderSimpleTranslation(word, translation) {
        if (!currentPopup) return;

        currentPopup.innerHTML = `
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

        currentPopup.querySelector('.translator-close-btn').addEventListener('click', removeAllPopups);
        currentPopup.querySelector('.translator-speak-btn').addEventListener('click', () => {
            speakText(word);
        });
    }

    // 渲染错误信息（显示原单词和错误提示）
    function renderError(word, message) {
        if (!currentPopup) return;

        currentPopup.innerHTML = `
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

        currentPopup.querySelector('.translator-close-btn').addEventListener('click', removeAllPopups);
        currentPopup.querySelector('.translator-speak-btn').addEventListener('click', () => {
            speakText(word);
        });
    }

    // ==================== 选中文本悬浮按钮 ====================

    // 移除悬浮按钮
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

    // 监听鼠标抬起事件
    document.addEventListener('mouseup', (e) => {
        // 延迟执行，确保选中操作完成
        setTimeout(() => {
            handleTextSelection(e);
        }, 50);
    });

    // 处理文本选中
    function handleTextSelection(e) {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // 如果点击在弹窗或按钮内，不处理
        if (e.target.closest('.translator-popup') ||
            e.target.closest('.translator-float-buttons') ||
            e.target.closest('.translator-sentence-popup')) {
            return;
        }

        // 先清理之前的悬浮按钮
        removeFloatButtons();

        // 如果没有选中文本，直接返回
        if (!text) {
            return;
        }

        // 如果是单个英文单词，不显示悬浮按钮（由双击处理）
        if (text.split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text)) {
            return;
        }

        // 获取选区的位置
        let range;
        try {
            range = selection.getRangeAt(0);
        } catch (e) {
            return; // 没有有效选区
        }
        const rect = range.getBoundingClientRect();

        // 如果选区无效，返回
        if (rect.width === 0 && rect.height === 0) {
            return;
        }

        // 创建悬浮按钮
        currentFloatButtons = document.createElement('div');
        currentFloatButtons.className = 'translator-float-buttons';
        currentFloatButtons.innerHTML = `
      <button class="translator-float-btn translate-btn" data-tooltip="翻译">译</button>
      <button class="translator-float-btn speak-btn" data-tooltip="朗读">
        ${createSpeakerSVG()}
      </button>
    `;

        document.body.appendChild(currentFloatButtons);

        // 计算位置 - 悬浮按钮显示在鼠标位置旁边
        const buttonRect = currentFloatButtons.getBoundingClientRect();
        let left = e.clientX + 10;  // 鼠标右侧 10px
        let top = e.clientY - buttonRect.height / 2;  // 垂直居中于鼠标

        // 防止超出右边界
        if (left + buttonRect.width > window.innerWidth - 10) {
            left = e.clientX - buttonRect.width - 10;  // 改到鼠标左侧
        }

        // 防止超出左边界
        if (left < 10) {
            left = 10;
        }

        // 防止超出上下边界
        if (top < 10) {
            top = 10;
        }
        if (top + buttonRect.height > window.innerHeight - 10) {
            top = window.innerHeight - buttonRect.height - 10;
        }

        currentFloatButtons.style.left = left + 'px';
        currentFloatButtons.style.top = top + 'px';

        // 保存选中的文本，供按钮使用
        const selectedText = text;
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // 翻译按钮 - 鼠标悬停自动触发
        const translateBtn = currentFloatButtons.querySelector('.translate-btn');
        translateBtn.addEventListener('mouseenter', async () => {
            await translateSelection(selectedText, mouseX, mouseY);
        });

        // 朗读按钮 - 鼠标悬停自动触发
        const speakBtn = currentFloatButtons.querySelector('.speak-btn');
        speakBtn.addEventListener('mouseenter', () => {
            speakText(selectedText);
        });

        // 鼠标移出悬浮按钮容器后延迟隐藏
        currentFloatButtons.addEventListener('mouseleave', () => {
            hideFloatButtonsTimeout = setTimeout(() => {
                removeFloatButtons();
            }, 500);
        });

        currentFloatButtons.addEventListener('mouseenter', () => {
            if (hideFloatButtonsTimeout) {
                clearTimeout(hideFloatButtonsTimeout);
                hideFloatButtonsTimeout = null;
            }
        });
    }

    // 翻译选中文本
    async function translateSelection(text, x, y) {
        // 移除悬浮按钮
        removeFloatButtons();

        // 移除之前的弹窗
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }

        // 创建翻译弹窗
        currentPopup = document.createElement('div');
        currentPopup.className = 'translator-sentence-popup';
        currentPopup.innerHTML = `
      <button class="translator-close-btn" title="关闭">×</button>
      <div class="translator-sentence-content">
        <div class="translator-loading">正在翻译...</div>
      </div>
    `;

        document.body.appendChild(currentPopup);

        // 计算位置
        const rect = currentPopup.getBoundingClientRect();
        const pos = calculatePopupPosition(x, y, rect.width, 150);
        currentPopup.style.left = pos.left + 'px';
        currentPopup.style.top = pos.top + 'px';

        // 绑定关闭按钮
        currentPopup.querySelector('.translator-close-btn').addEventListener('click', removeAllPopups);

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'translate',
                text: text
            });

            if (response.success) {
                const contentEl = currentPopup?.querySelector('.translator-sentence-content');
                if (contentEl) {
                    contentEl.innerHTML = `
              <div class="translator-result">${escapeHtml(response.data.translated)}</div>
            `;

                    // 重新计算位置
                    const newRect = currentPopup.getBoundingClientRect();
                    const newPos = calculatePopupPosition(pos.left, pos.top, newRect.width, newRect.height);
                    currentPopup.style.left = newPos.left + 'px';
                    currentPopup.style.top = newPos.top + 'px';
                }
            } else {
                const contentEl = currentPopup?.querySelector('.translator-sentence-content');
                if (contentEl) {
                    contentEl.innerHTML = `<div class="translator-error">❌ ${escapeHtml(response.error)}</div>`;
                }
            }
        } catch (error) {
            const contentEl = currentPopup?.querySelector('.translator-sentence-content');
            if (contentEl) {
                contentEl.innerHTML = `<div class="translator-error">❌ 网络错误，请重试</div>`;
            }
        }
    }

    // ==================== 点击其他地方关闭弹窗 ====================

    document.addEventListener('mousedown', (e) => {
        // 如果点击在悬浮按钮上，不处理
        if (e.target.closest('.translator-float-buttons')) {
            return;
        }

        // 如果点击在弹窗外部，关闭弹窗
        if (currentPopup && !currentPopup.contains(e.target)) {
            if (!e.target.closest('.translator-popup') &&
                !e.target.closest('.translator-sentence-popup')) {
                currentPopup.remove();
                currentPopup = null;
            }
        }
    });

    // ==================== 确保语音列表加载 ====================

    // 预加载语音列表
    if (window.speechSynthesis) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    console.log('快译扩展已加载');
})();
