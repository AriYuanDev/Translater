// 快译 - Chrome 翻译扩展后台服务

// ==================== 词典缓存 ====================

// 简单的 LRU 缓存，最多存储 100 个单词，30 分钟过期
const dictionaryCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

function getCachedDictionary(word) {
  const cached = dictionaryCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // 移到末尾以实现 LRU
    dictionaryCache.delete(word);
    dictionaryCache.set(word, cached);
    return cached.data;
  }
  if (cached) {
    dictionaryCache.delete(word); // 删除过期缓存
  }
  return null;
}

function setCachedDictionary(word, data) {
  // 如果缓存满了，删除最旧的
  if (dictionaryCache.size >= CACHE_MAX_SIZE) {
    const firstKey = dictionaryCache.keys().next().value;
    dictionaryCache.delete(firstKey);
  }
  dictionaryCache.set(word, { data, timestamp: Date.now() });
}

// ==================== PDF 重定向 ====================

// 检查 URL 是否是 PDF
function isPdfUrl(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  // 检查 URL 路径是否以 .pdf 结尾
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return pathname.endsWith('.pdf');
  } catch {
    return urlLower.includes('.pdf');
  }
}

// 监听页面导航，检测 PDF 并重定向
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // 只处理主框架
  if (details.frameId !== 0) return;

  // 不处理已经是我们的 PDF 查看器的 URL
  if (details.url.includes('pdfviewer.html')) return;

  if (isPdfUrl(details.url)) {
    // 重定向到自定义 PDF 查看器
    const viewerUrl = chrome.runtime.getURL('pdfviewer.html') + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: viewerUrl });
  }
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchDictionary') {
    fetchDictionary(request.word)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放
  }

  if (request.action === 'translate') {
    translateText(request.text, request.targetLang || 'zh-CN')
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 获取词典数据 - 从 Cambridge Dictionary 获取（带缓存）
async function fetchDictionary(word) {
  const normalizedWord = word.toLowerCase();

  // 检查缓存
  const cached = getCachedDictionary(normalizedWord);
  if (cached) {
    console.log(`[缓存命中] ${normalizedWord}`);
    return cached;
  }

  const url = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(normalizedWord)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('未找到该单词');
  }

  const html = await response.text();

  // 解析 HTML 获取音标和释义
  const result = parseCambridgeDictionary(html, word);

  if (!result) {
    throw new Error('未找到该单词');
  }

  // 存入缓存
  setCachedDictionary(normalizedWord, result);

  return result;
}

// 解析 Cambridge Dictionary HTML
function parseCambridgeDictionary(html, word) {
  try {
    const normalizedWord = word.toLowerCase();

    // 验证页面确实包含我们查询的单词
    // 检查页面标题或词条标题是否匹配
    const headwordMatch = html.match(/<span class="hw dhw">([^<]+)<\/span>/);
    const pageHeadword = headwordMatch ? headwordMatch[1].toLowerCase().trim() : '';

    // 如果页面词条与查询词不匹配，返回 null（可能是被重定向到其他页面）
    if (!pageHeadword || !pageHeadword.includes(normalizedWord.replace(/s$/, '')) && !normalizedWord.includes(pageHeadword)) {
      console.log(`[词条不匹配] 查询: ${normalizedWord}, 页面: ${pageHeadword}`);
      return null;
    }

    // 辅助函数：从 IPA span 中提取音标（处理嵌套的 span 标签）
    function extractPhonetic(ipaHtml) {
      if (!ipaHtml) return '';
      // 移除所有 HTML 标签，只保留文本
      const text = ipaHtml.replace(/<[^>]+>/g, '').trim();
      return text ? `/${text}/` : '';
    }

    // 提取英式音标 (UK) - 第一个匹配项（支持嵌套 span）
    const ukPhoneticMatch = html.match(/<span class="ipa dipa lpr-2 lpl-1">([\s\S]*?)<\/span>(?:<\/span>)?/);
    const ukPhonetic = ukPhoneticMatch ? extractPhonetic(ukPhoneticMatch[1]) : '';

    // 提取美式音标 (US) - 查找 us dpron-i 区域
    let usPhonetic = '';
    const usRegion = html.match(/<span class="us dpron-i[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/);
    if (usRegion) {
      const usPhoneticMatch = usRegion[1].match(/<span class="ipa dipa lpr-2 lpl-1">([\s\S]*?)<\/span>(?:<\/span>)?/);
      usPhonetic = usPhoneticMatch ? extractPhonetic(usPhoneticMatch[1]) : '';
    }

    // 如果没有找到美式音标，尝试从页面中找第二个 ipa 标签（通常是美式）
    if (!usPhonetic) {
      const allPhonetics = [...html.matchAll(/<span class="ipa dipa lpr-2 lpl-1">([\s\S]*?)<\/span>(?:<\/span>)?/g)];
      if (allPhonetics.length >= 2) {
        usPhonetic = extractPhonetic(allPhonetics[1][1]);
      }
    }

    // 提取美式发音音频 URL
    const usAudioMatch = html.match(/<source[^>]+src="([^"]*us_pron[^"]*\.mp3)"/);
    const usAudioUrl = usAudioMatch ? `https://dictionary.cambridge.org${usAudioMatch[1]}` : '';

    // 提取英式发音音频 URL
    const ukAudioMatch = html.match(/<source[^>]+src="([^"]*uk_pron[^"]*\.mp3)"/);
    const ukAudioUrl = ukAudioMatch ? `https://dictionary.cambridge.org${ukAudioMatch[1]}` : '';

    // 提取释义
    const meanings = [];

    // 使用更简单直接的方式：先找所有词性，再找对应的定义
    // 找到所有 pos-header 区块（每个词性一个区块）
    const posHeaderMatches = [...html.matchAll(/<span class="pos dpos"[^>]*>([^<]+)<\/span>/g)];
    const defMatches = [...html.matchAll(/<div class="def ddef_d db"[^>]*>([\s\S]*?)<\/div>/g)];

    // 提取所有定义文本（去除HTML标签）
    const allDefinitions = defMatches.map(match => {
      // 移除所有 HTML 标签，保留文本
      let text = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      // 转义 HTML 特殊字符防止 XSS
      text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return text;
    }).filter(def => def.length > 0);

    // 获取唯一的词性列表
    const uniquePOS = [...new Set(posHeaderMatches.map(m => m[1]))];

    // 简化处理：将定义分配给词性
    if (uniquePOS.length > 0 && allDefinitions.length > 0) {
      // 对于每个词性，分配一些定义
      const defsPerPOS = Math.max(1, Math.floor(allDefinitions.length / uniquePOS.length));
      let defIndex = 0;

      for (const pos of uniquePOS.slice(0, 3)) { // 最多3个词性
        const definitions = [];
        for (let i = 0; i < Math.min(2, defsPerPOS) && defIndex < allDefinitions.length; i++) {
          definitions.push({ definition: allDefinitions[defIndex] });
          defIndex++;
        }
        if (definitions.length > 0) {
          meanings.push({
            partOfSpeech: pos,
            definitions
          });
        }
      }
    }

    // 如果上面的方法没有找到，使用备用方法
    if (meanings.length === 0 && allDefinitions.length > 0) {
      const pos = uniquePOS[0] || 'word';
      meanings.push({
        partOfSpeech: pos,
        definitions: allDefinitions.slice(0, 2).map(def => ({ definition: def }))
      });
    }

    // 构建返回数据，格式与原 API 兼容（优先使用美式音标）
    return {
      word: word,
      phonetic: usPhonetic || ukPhonetic, // 优先使用美式音标
      phonetics: [
        { text: usPhonetic, audio: usAudioUrl }, // US（优先）
        { text: ukPhonetic, audio: ukAudioUrl }  // UK
      ].filter(p => p.text || p.audio),
      meanings: meanings
    };
  } catch (error) {
    console.error('解析 Cambridge Dictionary 失败:', error);
    return null;
  }
}

// 翻译文本
async function translateText(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('翻译服务暂时不可用');
  }

  const data = await response.json();

  // 解析 Google 翻译返回的数据格式
  let translatedText = '';
  if (data && data[0]) {
    for (const item of data[0]) {
      if (item[0]) {
        translatedText += item[0];
      }
    }
  }

  return {
    original: text,
    translated: translatedText,
    sourceLang: data[2] || 'auto'
  };
}

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('快译扩展已安装');
  } else if (details.reason === 'update') {
    console.log('快译扩展已更新到版本', chrome.runtime.getManifest().version);
  }
});
