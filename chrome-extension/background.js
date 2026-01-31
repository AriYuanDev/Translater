// 快译 - Chrome 翻译扩展后台服务

// ==================== 词典缓存 ====================

// 简单的 LRU 缓存，最多存储 100 个单词，30 分钟过期
const dictionaryCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

// 预加载缓存
chrome.storage.local.get(['dictionaryCache'], (result) => {
  if (result.dictionaryCache) {
    result.dictionaryCache.forEach(([word, entry]) => {
      if (Date.now() - entry.timestamp < CACHE_TTL) {
        dictionaryCache.set(word, entry);
      }
    });
    console.log(`[Background] 已加载 ${dictionaryCache.size} 条持久化缓存`);
  }
});

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
    saveDictionaryCache();
  }
  return null;
}

function setCachedDictionary(word, data) {
  if (dictionaryCache.size >= CACHE_MAX_SIZE) {
    const firstKey = dictionaryCache.keys().next().value;
    dictionaryCache.delete(firstKey);
  }
  dictionaryCache.set(word, { data, timestamp: Date.now() });
  saveDictionaryCache();
}

function saveDictionaryCache() {
  chrome.storage.local.set({ dictionaryCache: Array.from(dictionaryCache.entries()) });
}
// 正在进行中的请求追踪（防止并发重复请求）
const pendingDictionaryRequests = new Map();
const pendingTranslationRequests = new Map();

// API Key 内存缓存
let cachedMWApiKey = null;
let cachedDeepLApiKey = null;

// 初始化时预取 API Keys
async function prefetchApiKeys() {
  const result = await chrome.storage.sync.get(['mwApiKey', 'deepLApiKey']);
  cachedMWApiKey = result.mwApiKey || '';
  cachedDeepLApiKey = result.deepLApiKey || '';
  console.log('[Background] API Keys 已预取');
}
prefetchApiKeys();

// 监听 storage 变化同步缓存
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.mwApiKey) cachedMWApiKey = changes.mwApiKey.newValue;
    if (changes.deepLApiKey) cachedDeepLApiKey = changes.deepLApiKey.newValue;
  }
});

// ==================== PDF 重定向 ====================

// 检查 URL 是否是 PDF
function isPdfUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    // 基础检查：以 .pdf 结尾
    if (pathname.endsWith('.pdf')) return true;
    // 进阶检查：URL 路径中包含 pdf 且位于末端路径段（如 /docs/file.pdf?query=1）
    const pathSegments = pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];
    return lastSegment.includes('.pdf');
  } catch {
    return url.toLowerCase().includes('.pdf');
  }
}

// 监听页面导航，检测 PDF 并重定向
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (details.url.includes('pdfviewer.html')) return;

  if (isPdfUrl(details.url)) {
    const viewerUrl = chrome.runtime.getURL('pdfviewer.html') + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: viewerUrl });
  }
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handlers = {
    fetchDictionary: () => fetchDictionary(request.word),
    translate: () => translateText(request.text, request.targetLang || 'zh-CN'),
    setDeepLApiKey: () => setDeepLApiKey(request.apiKey),
    getDeepLApiKey: () => getDeepLApiKey().then(apiKey => ({ apiKey: apiKey ? '已配置' : '' })),
    getTranslationEngine: () => getDeepLApiKey().then(apiKey => ({ engine: apiKey ? 'DeepL' : 'Google' })),
    setMWApiKey: () => setMWApiKey(request.apiKey),
    getMWApiKey: () => getMWApiKey().then(apiKey => ({ apiKey: apiKey ? '已配置' : '' }))
  };

  if (handlers[request.action]) {
    (async () => {
      try {
        const data = await handlers[request.action]();
        sendResponse({ success: true, data: data || null });
      } catch (error) {
        console.error(`[Background] Action ${request.action} failed:`, error);
        sendResponse({ success: false, error: error.message || '未知错误' });
      }
    })();
    return true;
  }
});

// ==================== Merriam-Webster API 配置 ====================

async function getMWApiKey() {
  if (cachedMWApiKey !== null) return cachedMWApiKey;
  const result = await chrome.storage.sync.get(['mwApiKey']);
  cachedMWApiKey = result.mwApiKey || '';
  return cachedMWApiKey;
}

async function setMWApiKey(apiKey) {
  await chrome.storage.sync.set({ mwApiKey: apiKey });
  cachedMWApiKey = apiKey;
  return true;
}

// 构造 Merriam-Webster 音频 URL
function buildMWAudioUrl(audioFileName) {
  if (!audioFileName) return '';

  // 确定子目录
  let subdirectory;
  if (audioFileName.startsWith('bix')) {
    subdirectory = 'bix';
  } else if (audioFileName.startsWith('gg')) {
    subdirectory = 'gg';
  } else if (/^[0-9_]/.test(audioFileName)) {
    subdirectory = 'number';
  } else {
    subdirectory = audioFileName.charAt(0);
  }

  return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdirectory}/${audioFileName}.mp3`;
}

// 预编译的正则表达式（避免每次调用都重新编译）
const MW_REGEX_REMOVE = /\{(?:bc|it|\/it|b|\/b)\}/g;
const MW_REGEX_QUOTES = /\{(?:ldquo|rdquo)\}/g;
const MW_REGEX_SX = /\{sx\|[^}]*\}/g;
const MW_REGEX_DX = /\{dx\}[\s\S]*?\{\/dx\}/g;
const MW_REGEX_DX_DEF = /\{dx_def\}[\s\S]*?\{\/dx_def\}/g;
const MW_REGEX_A_LINK = /\{a_link\|([^}]*)\}/g;
const MW_REGEX_D_LINK = /\{d_link\|([^|]*)\|[^}]*\}/g;
const MW_REGEX_ALL_TAGS = /\{[^}]*\}/g;
const MW_REGEX_WHITESPACE = /\s+/g;

// 解析 Merriam-Webster API 返回的定义文本（去除标记）- 使用预编译正则
function parseMWDefinitionText(text) {
  if (!text) return '';
  return text
    .replace(MW_REGEX_REMOVE, '')
    .replace(MW_REGEX_QUOTES, '"')
    .replace(MW_REGEX_SX, '')
    .replace(MW_REGEX_DX, '')
    .replace(MW_REGEX_DX_DEF, '')
    .replace(MW_REGEX_A_LINK, '$1')
    .replace(MW_REGEX_D_LINK, '$1')
    .replace(MW_REGEX_ALL_TAGS, '')
    .replace(MW_REGEX_WHITESPACE, ' ')
    .trim();
}

// 解析 Merriam-Webster Learners Dictionary API 响应
function parseMWLearnersResponse(data, word) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  // 检查是否返回的是字符串数组（建议词）而不是词条
  if (typeof data[0] === 'string') {
    console.log('[MW API] 返回建议词而非词条:', data.slice(0, 5));
    return null;
  }

  const entry = data[0];

  // 提取音标和音频
  let phonetic = '';
  let audioUrl = '';

  if (entry.hwi && entry.hwi.prs && entry.hwi.prs.length > 0) {
    const pron = entry.hwi.prs[0];
    // Learners Dictionary 使用 ipa 字段
    if (pron.ipa) {
      phonetic = `/${pron.ipa}/`;
    }
    // 音频文件
    if (pron.sound && pron.sound.audio) {
      audioUrl = buildMWAudioUrl(pron.sound.audio);
    }
  }

  // 提取词性
  const partOfSpeech = entry.fl || 'word';

  // 提取释义
  const meanings = [];
  const definitions = [];

  if (entry.shortdef && entry.shortdef.length > 0) {
    // 使用 shortdef（简短定义）- 更适合快速查看
    for (const def of entry.shortdef.slice(0, 3)) {
      definitions.push({ definition: def });
    }
  } else if (entry.def && entry.def.length > 0) {
    // 使用完整定义
    for (const defBlock of entry.def.slice(0, 1)) {
      if (defBlock.sseq) {
        for (const senseSeq of defBlock.sseq.slice(0, 3)) {
          for (const sense of senseSeq) {
            if (sense[0] === 'sense' && sense[1] && sense[1].dt) {
              for (const dt of sense[1].dt) {
                if (dt[0] === 'text') {
                  const defText = parseMWDefinitionText(dt[1]);
                  if (defText) {
                    definitions.push({ definition: defText });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (definitions.length > 0) {
    meanings.push({
      partOfSpeech: partOfSpeech,
      definitions: definitions.slice(0, 3)
    });
  }

  // 检查其他词条是否有不同词性
  for (let i = 1; i < Math.min(data.length, 3); i++) {
    const otherEntry = data[i];
    if (typeof otherEntry === 'string') continue;

    // 检查是否是同一个词的不同词性
    const otherId = otherEntry.meta?.id?.replace(/:\d+$/, '') || '';
    if (otherId.toLowerCase() !== word.toLowerCase()) continue;

    const otherPOS = otherEntry.fl;
    if (otherPOS && otherPOS !== partOfSpeech) {
      const otherDefs = [];
      if (otherEntry.shortdef && otherEntry.shortdef.length > 0) {
        for (const def of otherEntry.shortdef.slice(0, 2)) {
          otherDefs.push({ definition: def });
        }
      }
      if (otherDefs.length > 0) {
        meanings.push({
          partOfSpeech: otherPOS,
          definitions: otherDefs
        });
      }
    }
  }

  if (meanings.length === 0) {
    return null;
  }

  return {
    word: word || '',
    phonetic: phonetic || '',
    phonetics: (phonetic || audioUrl) ? [{ text: phonetic, audio: audioUrl }] : [],
    meanings: meanings || []
  };
}

// 获取词典数据 - 使用 Merriam-Webster Learners Dictionary API（带缓存和并发保护）
async function fetchDictionary(word) {
  if (!word || typeof word !== 'string' || !word.trim()) {
    return null;
  }
  const normalizedWord = word.trim().toLowerCase();

  // 检查缓存
  const cached = getCachedDictionary(normalizedWord);
  if (cached) {
    console.log(`[缓存命中] ${normalizedWord}`);
    return cached;
  }

  // 检查是否有正在进行的相同请求（并发保护）
  if (pendingDictionaryRequests.has(normalizedWord)) {
    console.log(`[复用请求] ${normalizedWord}`);
    return pendingDictionaryRequests.get(normalizedWord);
  }

  // 创建新请求并追踪
  const requestPromise = (async () => {
    try {
      // 获取 API Key
      const apiKey = await getMWApiKey();
      if (!apiKey) {
        throw new Error('请先配置 Merriam-Webster API Key');
      }

      // 调用 Merriam-Webster Learners Dictionary API
      const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(normalizedWord)}?key=${apiKey}`;

      console.log(`[MW API] 查询: ${normalizedWord}`);

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('API Key 无效或已过期');
        }
        throw new Error('词典服务暂时不可用');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error(`[MW API] 返回了非 JSON 数据: ${text}`);
        throw new Error('词典服务返回格式错误');
      }

      const data = await response.json();

      // 解析 API 响应
      const result = parseMWLearnersResponse(data, word);

      if (!result || !result.meanings || result.meanings.length === 0) {
        console.log(`[Background] ${normalizedWord} 未找到详细释义，将尝试翻译流程`);
        return null; // 返回 null 而不是抛出错误，触发 content.js 的翻译逻辑
      }

      // 存入缓存
      setCachedDictionary(normalizedWord, result);

      return result;
    } finally {
      // 无论成功失败，都从追踪表中移除
      pendingDictionaryRequests.delete(normalizedWord);
    }
  })();

  // 追踪此请求
  pendingDictionaryRequests.set(normalizedWord, requestPromise);

  return requestPromise;
}

// ==================== DeepL API 配置 ====================

// 获取存储的 DeepL API 密钥
async function getDeepLApiKey() {
  if (cachedDeepLApiKey !== null) return cachedDeepLApiKey;
  const result = await chrome.storage.sync.get(['deepLApiKey']);
  cachedDeepLApiKey = result.deepLApiKey || '';
  return cachedDeepLApiKey;
}

// 保存 DeepL API 密钥
async function setDeepLApiKey(apiKey) {
  await chrome.storage.sync.set({ deepLApiKey: apiKey });
  return true;
}

// 语言代码转换（Chrome 语言代码 -> DeepL 语言代码）
function convertToDeepLLang(lang) {
  const langMap = {
    'zh-CN': 'ZH',
    'zh-TW': 'ZH',
    'zh': 'ZH',
    'en': 'EN',
    'en-US': 'EN-US',
    'en-GB': 'EN-GB',
    'ja': 'JA',
    'ko': 'KO',
    'de': 'DE',
    'fr': 'FR',
    'es': 'ES',
    'it': 'IT',
    'pt': 'PT-PT',
    'pt-BR': 'PT-BR',
    'ru': 'RU',
    'pl': 'PL',
    'nl': 'NL'
  };
  return langMap[lang] || lang.toUpperCase().split('-')[0];
}

// 使用 DeepL 翻译文本
async function translateWithDeepL(text, targetLang, apiKey) {
  const deepLLang = convertToDeepLLang(targetLang);

  // 自动检测 Pro 或 Free 版本 API
  // Free 版本密钥通常以 :fx 结尾
  const isPro = !apiKey.endsWith(':fx');
  const baseUrl = isPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      text: text,
      target_lang: deepLLang
    })
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    if (isJson) {
      const errorData = await response.json().catch(() => ({}));
      errorMsg = errorData.message || errorMsg;
    } else {
      const errorText = await response.text().catch(() => '');
      console.error('DeepL 非 JSON 错误响应:', errorText);
    }
    throw new Error(`DeepL 翻译失败: ${errorMsg}`);
  }

  if (!isJson) {
    throw new Error('DeepL 词典服务返回格式错误');
  }

  const data = await response.json();

  if (data.translations && data.translations.length > 0) {
    return {
      original: text,
      translated: data.translations[0].text,
      sourceLang: data.translations[0].detected_source_language || 'auto',
      engine: 'DeepL'
    };
  }

  throw new Error('DeepL 返回数据格式错误');
}

// 翻译文本（仅使用 DeepL）
async function translateText(text, targetLang) {
  if (!text || !text.trim()) return null;
  const apiKey = await getDeepLApiKey();

  if (!apiKey) {
    throw new Error('请先配置 DeepL API Key');
  }

  const cacheKey = `${targetLang}:${text.trim()}`;
  if (pendingTranslationRequests.has(cacheKey)) {
    return pendingTranslationRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      console.log('[翻译] 使用 DeepL 引擎');
      return await translateWithDeepL(text, targetLang, apiKey);
    } finally {
      pendingTranslationRequests.delete(cacheKey);
    }
  })();

  pendingTranslationRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('快译扩展已安装');
  } else if (details.reason === 'update') {
    console.log('快译扩展已更新到版本', chrome.runtime.getManifest().version);
  }
});
