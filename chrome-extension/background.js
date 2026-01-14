// 快译 - Chrome 翻译扩展后台服务

// ==================== 词典缓存 ====================

// 简单的 LRU 缓存，最多存储 100 个单词，30 分钟过期
const dictionaryCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

// 正在进行中的请求追踪（防止并发重复请求）
const pendingDictionaryRequests = new Map();

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

  // DeepL API 密钥管理
  if (request.action === 'setDeepLApiKey') {
    setDeepLApiKey(request.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getDeepLApiKey') {
    getDeepLApiKey()
      .then(apiKey => sendResponse({ success: true, apiKey: apiKey ? '已配置' : '' }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getTranslationEngine') {
    getDeepLApiKey()
      .then(apiKey => sendResponse({ success: true, engine: apiKey ? 'DeepL' : 'Google' }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Merriam-Webster API 密钥管理
  if (request.action === 'setMWApiKey') {
    setMWApiKey(request.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getMWApiKey') {
    getMWApiKey()
      .then(apiKey => sendResponse({ success: true, apiKey: apiKey ? '已配置' : '' }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ==================== Merriam-Webster API 配置 ====================

// API Key 内存缓存（避免每次查询都读取 storage）
let cachedMWApiKey = null;
let mwApiKeyCacheTime = 0;
const MW_KEY_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

// 获取存储的 Merriam-Webster API 密钥（带内存缓存）
async function getMWApiKey() {
  // 检查内存缓存是否有效
  if (cachedMWApiKey !== null && Date.now() - mwApiKeyCacheTime < MW_KEY_CACHE_TTL) {
    return cachedMWApiKey;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(['mwApiKey'], (result) => {
      cachedMWApiKey = result.mwApiKey || '';
      mwApiKeyCacheTime = Date.now();
      resolve(cachedMWApiKey);
    });
  });
}

// 保存 Merriam-Webster API 密钥
async function setMWApiKey(apiKey) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ mwApiKey: apiKey }, () => {
      // 更新内存缓存
      cachedMWApiKey = apiKey;
      mwApiKeyCacheTime = Date.now();
      resolve(true);
    });
  });
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
    word: word,
    phonetic: phonetic,
    phonetics: phonetic || audioUrl ? [{ text: phonetic, audio: audioUrl }] : [],
    meanings: meanings
  };
}

// 获取词典数据 - 使用 Merriam-Webster Learners Dictionary API（带缓存和并发保护）
async function fetchDictionary(word) {
  const normalizedWord = word.toLowerCase();

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

      const data = await response.json();

      // 解析 API 响应
      const result = parseMWLearnersResponse(data, word);

      if (!result) {
        throw new Error('未找到该单词');
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
  return new Promise((resolve) => {
    chrome.storage.sync.get(['deepLApiKey'], (result) => {
      resolve(result.deepLApiKey || '');
    });
  });
}

// 保存 DeepL API 密钥
async function setDeepLApiKey(apiKey) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ deepLApiKey: apiKey }, () => {
      resolve(true);
    });
  });
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
  const url = 'https://api-free.deepl.com/v2/translate';

  const response = await fetch(url, {
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

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('DeepL API 错误:', response.status, errorData);
    throw new Error(`DeepL 翻译失败: ${response.status}`);
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
  const apiKey = await getDeepLApiKey();

  if (!apiKey) {
    throw new Error('请先配置 DeepL API Key');
  }

  console.log('[翻译] 使用 DeepL 引擎');
  return await translateWithDeepL(text, targetLang, apiKey);
}

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('快译扩展已安装');
  } else if (details.reason === 'update') {
    console.log('快译扩展已更新到版本', chrome.runtime.getManifest().version);
  }
});
