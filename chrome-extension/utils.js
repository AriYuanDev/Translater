/**
 * 快译 - 共享工具函数
 */

// HTML 转义函数，防止 XSS 攻击
export function escapeHtml(text) {
    if (!text) return '';
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
}

// 检测文本是否全部为英文（且不包含中日韩字符）
export function isAllEnglish(text) {
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
    return !cjkRegex.test(text);
}

// 创建发音图标 SVG
export function createSpeakerSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; fill:currentColor;">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>`;
}

// 检查扩展上下文是否有效
export function isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

// 安全获取扩展资源 URL
export function getURLSafe(path) {
    if (!isContextValid()) return '';
    try {
        return chrome.runtime.getURL(path);
    } catch {
        return '';
    }
}

// 计算弹窗位置
export function calculatePopupPosition(x, y, popupWidth, popupHeight) {
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + padding;
    let top = y + padding;

    if (left + popupWidth > viewportWidth - padding) {
        left = x - popupWidth - padding;
    }

    if (top + popupHeight > viewportHeight - padding) {
        top = y - popupHeight - padding;
    }

    left = Math.max(padding, left);
    top = Math.max(padding, top);

    return { left, top };
}

// 安全发送消息到 background
export async function sendMessageSafe(message) {
    if (!isContextValid()) {
        return { success: false, error: '扩展上下文已失效，请刷新页面' };
    }

    try {
        const response = await chrome.runtime.sendMessage(message);
        // 如果返回 undefined，可能是 background 脚本尚未完全就绪，尝试重试一次
        if (response === undefined) {
            console.log('[Translater] 收到 undefined 响应，正在重试...');
            await new Promise(r => setTimeout(r, 200));
            const retryResponse = await chrome.runtime.sendMessage(message);
            return retryResponse || { success: false, error: '后台无响应' };
        }
        return response;
    } catch (error) {
        console.error('[Translater] 发送消息失败:', error);
        if (error.message?.includes('Extension context invalidated')) {
            return { success: false, error: '扩展已更新，请刷新页面' };
        }
        return { success: false, error: '网络通信错误' };
    }
}

// 确保语音列表加载完成
function waitForVoices() {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        const handler = () => {
            window.speechSynthesis.onvoiceschanged = null;
            resolve(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.onvoiceschanged = handler;
        // 某些浏览器需要主动调用一次 getVoices 触发事件
        window.speechSynthesis.getVoices();
    });
}

// 通用 TTS 朗读驱动
export async function speakText(text, options = {}) {
    if (!text) return;

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const { lang = 'en-US', rate = 0.9, pitch = 1 } = options;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    // 获取并选择最佳语音
    const voices = await waitForVoices();
    const usVoice = voices.find(v => v.name.includes('p5712') && v.lang.startsWith('en'))
        || voices.find(v => v.name.includes('Piper') && v.lang.startsWith('en'))
        || voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha'))
        || voices.find(v => v.lang.startsWith('en-US'))
        || voices.find(v => v.lang.startsWith('en'));

    if (usVoice) {
        utterance.voice = usVoice;
    }

    window.speechSynthesis.speak(utterance);
}
