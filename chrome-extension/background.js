// Translater - Chrome Translation Extension Background Worker

// ==================== Dictionary Cache ====================

// Simple LRU cache, stores up to 100 words, expires in 30 minutes
const dictionaryCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Preload cache from storage
chrome.storage.local.get(['dictionaryCache'], (result) => {
  if (result.dictionaryCache) {
    result.dictionaryCache.forEach(([word, entry]) => {
      if (Date.now() - entry.timestamp < CACHE_TTL) {
        dictionaryCache.set(word, entry);
      }
    });
    console.log(`[Background] Loaded ${dictionaryCache.size} persistent cache entries`);
  }
});

/**
 * Retrieves a dictionary entry from the local LRU cache if it hasn't expired.
 * @param {string} word - The word to look up in cache.
 * @returns {Object|null} The cached data or null if not found or expired.
 */
function getCachedDictionary(word) {
  const cached = dictionaryCache.get(word);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Move to end for LRU implementation
    dictionaryCache.delete(word);
    dictionaryCache.set(word, cached);
    return cached.data;
  }
  if (cached) {
    dictionaryCache.delete(word); // Remove expired entry
    saveDictionaryCache();
  }
  return null;
}

/**
 * Stores a dictionary entry in the local LRU cache and persists it.
 * @param {string} word - The word to cache.
 * @param {Object} data - The definition data to store.
 */
function setCachedDictionary(word, data) {
  if (dictionaryCache.size >= CACHE_MAX_SIZE) {
    const firstKey = dictionaryCache.keys().next().value;
    dictionaryCache.delete(firstKey);
  }
  dictionaryCache.set(word, { data, timestamp: Date.now() });
  saveDictionaryCache();
}

let savePending = false;

/**
 * Persists the dictionary cache to storage with a 1-second debounce to avoid excessive I/O.
 */
function saveDictionaryCache() {
  if (savePending) return;
  savePending = true;

  setTimeout(() => {
    savePending = false;
    chrome.storage.local.set({ dictionaryCache: Array.from(dictionaryCache.entries()) });
  }, 1000);
}
// Tracking active requests (prevent concurrent duplicate requests)
const pendingDictionaryRequests = new Map();
const pendingTranslationRequests = new Map();

// API Key memory cache
let cachedMWApiKey = null;
let cachedDeepLApiKey = null;

// Prefetch API Keys on initialization
async function prefetchApiKeys() {
  const result = await chrome.storage.sync.get(['mwApiKey', 'deepLApiKey']);
  cachedMWApiKey = result.mwApiKey || '';
  cachedDeepLApiKey = result.deepLApiKey || '';
  console.log('[Background] API Keys prefetched');
}
prefetchApiKeys();

// Sync cache on storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.mwApiKey) cachedMWApiKey = changes.mwApiKey.newValue;
    if (changes.deepLApiKey) cachedDeepLApiKey = changes.deepLApiKey.newValue;
  }
});

// ==================== PDF Redirection ====================

// Check if URL is a PDF
function isPdfUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    // Basic check: ends with .pdf
    if (pathname.endsWith('.pdf')) return true;
    // Advanced check: URL path contains .pdf in the last segment
    const pathSegments = pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];
    return lastSegment.includes('.pdf');
  } catch {
    return url.toLowerCase().includes('.pdf');
  }
}

// Check if URL is a Markdown file
function isMdUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return pathname.endsWith('.md') || pathname.endsWith('.markdown');
  } catch {
    const lower = url.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
  }
}

// Monitor navigation to detect and redirect PDFs and Markdown files
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (details.url.includes('pdfviewer.html') || details.url.includes('mdviewer.html')) return;
  if (details.url.includes('no_redirect')) return; // Allow bypass from "Open Original"

  if (isPdfUrl(details.url)) {
    const viewerUrl = chrome.runtime.getURL('pdfviewer.html') + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: viewerUrl });
  } else if (isMdUrl(details.url)) {
    const viewerUrl = chrome.runtime.getURL('mdviewer.html') + '?url=' + encodeURIComponent(details.url);
    chrome.tabs.update(details.tabId, { url: viewerUrl });
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handlers = {
    fetchDictionary: () => fetchDictionary(request.word),
    translate: () => translateText(request.text, request.targetLang || 'zh-CN'),
    setDeepLApiKey: () => setDeepLApiKey(request.apiKey),
    getDeepLApiKey: () => getDeepLApiKey().then(apiKey => ({ apiKey: apiKey ? 'Configured' : '' })),
    getTranslationEngine: () => getDeepLApiKey().then(apiKey => ({ engine: apiKey ? 'DeepL' : 'Google' })),
    setMWApiKey: () => setMWApiKey(request.apiKey),
    getMWApiKey: () => getMWApiKey().then(apiKey => ({ apiKey: apiKey ? 'Configured' : '' }))
  };

  if (handlers[request.action]) {
    (async () => {
      try {
        const data = await handlers[request.action]();
        sendResponse({ success: true, data: data || null });
      } catch (error) {
        console.error(`[Background] Action ${request.action} failed:`, error);
        sendResponse({ success: false, error: error.message || 'Unknown error' });
      }
    })();
    return true;
  }
});

// ==================== Merriam-Webster API Configuration ====================

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

// Construct Merriam-Webster audio URL
function buildMWAudioUrl(audioFileName) {
  if (!audioFileName) return '';

  // Determine subdirectory
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

// Precompiled regexes for parsing MW definition text (performance optimization)
/** Removes bold/italic markers: {bc}, {it}, {/it}, {b}, {/b} */
const MW_REGEX_REMOVE = /\{(?:bc|it|\/it|b|\/b)\}/g;
/** Converts left/right quote markers to standard quotes */
const MW_REGEX_QUOTES = /\{(?:ldquo|rdquo)\}/g;
/** Removes cross-reference links: {sx|...} */
const MW_REGEX_SX = /\{sx\|[^}]*\}/g;
/** Removes directional cross-references: {dx}...{/dx} */
const MW_REGEX_DX = /\{dx\}[\s\S]*?\{\/dx\}/g;
/** Removes definition cross-references: {dx_def}...{/dx_def} */
const MW_REGEX_DX_DEF = /\{dx_def\}[\s\S]*?\{\/dx_def\}/g;
/** Extracts text from anchor links: {a_link|text} -> text */
const MW_REGEX_A_LINK = /\{a_link\|([^}]*)\}/g;
/** Extracts text from definition links: {d_link|text|id} -> text */
const MW_REGEX_D_LINK = /\{d_link\|([^|]*)\|[^}]*\}/g;
/** Removes any remaining curly brace tags */
const MW_REGEX_ALL_TAGS = /\{[^}]*\}/g;
/** Normalizes multiple whitespace to single space */
const MW_REGEX_WHITESPACE = /\s+/g;

// Parse Merriam-Webster definition text (remove tags) - uses precompiled regexes
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

// Parse Merriam-Webster Learners Dictionary API response
/**
 * Parses the raw API response from Merriam-Webster.
 * @param {Array|Object} data - The raw API response.
 * @param {string} word - The original word searched.
 * @returns {Object|null} Formatted dictionary data or null if not found.
 */
function parseMWLearnersResponse(data, word) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  // Check if it returns a suggestions list instead of map entries
  if (typeof data[0] === 'string') {
    console.log('[MW API] Returned suggestions instead of entry:', data.slice(0, 5));
    return null;
  }

  const entry = data[0];

  // Extract original headword - remove digits after ID (e.g., support:1 -> support)
  const apiWord = entry.meta?.id?.replace(/:\d+$/, '') || word;

  // Extract phonetic and audio
  let phonetic = '';
  let audioUrl = '';

  if (entry.hwi && entry.hwi.prs && entry.hwi.prs.length > 0) {
    const pron = entry.hwi.prs[0];
    // Learners Dictionary uses ipa field
    if (pron.ipa) {
      phonetic = `/${pron.ipa}/`;
    }
    // Audio file
    if (pron.sound && pron.sound.audio) {
      audioUrl = buildMWAudioUrl(pron.sound.audio);
    }
  }

  // Extract part of speech
  const partOfSpeech = entry.fl || 'word';

  // Extract definitions
  const meanings = [];
  const definitions = [];

  if (entry.shortdef && entry.shortdef.length > 0) {
    // Use shortdef (brief definitions) - better for quick view
    for (const def of entry.shortdef.slice(0, 3)) {
      definitions.push({ definition: def });
    }
  } else if (entry.def && entry.def.length > 0) {
    // Use full definitions
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

  // Check other entries for different parts of speech
  for (let i = 1; i < Math.min(data.length, 3); i++) {
    const otherEntry = data[i];
    if (typeof otherEntry === 'string') continue;

    // Check if it's the same word with different POS
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
    word: apiWord || word,
    searchedWord: word,
    phonetic: phonetic || '',
    phonetics: (phonetic || audioUrl) ? [{ text: phonetic, audio: audioUrl }] : [],
    meanings: meanings || []
  };
}

// Fetch dictionary data - Using Merriam-Webster Learners API (with cache and concurrency protection)
async function fetchDictionary(word) {
  if (!word || typeof word !== 'string' || !word.trim()) {
    return null;
  }
  const normalizedWord = word.trim().toLowerCase();

  // Check cache
  const cached = getCachedDictionary(normalizedWord);
  if (cached) {
    console.log(`[Cache Hit] ${normalizedWord}`);
    return cached;
  }

  // Check for active identical request (concurrency protection)
  if (pendingDictionaryRequests.has(normalizedWord)) {
    console.log(`[Reusing Request] ${normalizedWord}`);
    return pendingDictionaryRequests.get(normalizedWord);
  }

  // Create and track new request
  const requestPromise = (async () => {
    try {
      // Get API Key
      const apiKey = await getMWApiKey();
      if (!apiKey) {
        throw new Error('Please configure Merriam-Webster API Key');
      }

      // Call Merriam-Webster Learners Dictionary API
      const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(normalizedWord)}?key=${apiKey}`;

      console.log(`[MW API] Query: ${normalizedWord}`);

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('API Key invalid or expired');
        }
        throw new Error('Dictionary service temporarily unavailable');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error(`[MW API] Returned non-JSON data: ${text}`);
        throw new Error('Dictionary service returned invalid format');
      }

      const data = await response.json();

      // Parse API response
      const result = parseMWLearnersResponse(data, word);

      if (!result || !result.meanings || result.meanings.length === 0) {
        console.log(`[Background] ${normalizedWord} no definition found, falling back to translation`);
        return null; // Return null instead of error to trigger fallback translation logic in content script
      }

      // Put in cache
      setCachedDictionary(normalizedWord, result);

      return result;
    } finally {
      // Remove from tracking map regardless of success/error
      pendingDictionaryRequests.delete(normalizedWord);
    }
  })();

  // Track this request
  pendingDictionaryRequests.set(normalizedWord, requestPromise);

  return requestPromise;
}

// ==================== DeepL API Configuration ====================

// Get stored DeepL API key
async function getDeepLApiKey() {
  if (cachedDeepLApiKey !== null) return cachedDeepLApiKey;
  const result = await chrome.storage.sync.get(['deepLApiKey']);
  cachedDeepLApiKey = result.deepLApiKey || '';
  return cachedDeepLApiKey;
}

// Save DeepL API key
/**
 * Saves the DeepL API key to persistent storage and updates local cache.
 * @param {string} apiKey 
 * @returns {Promise<boolean>}
 */
async function setDeepLApiKey(apiKey) {
  await chrome.storage.sync.set({ deepLApiKey: apiKey });
  cachedDeepLApiKey = apiKey;
  return true;
}

// Language code conversion (Chrome -> DeepL)
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

// Translate text using DeepL
/**
 * Core translation logic using DeepL API.
 * @param {string} text - Text to translate.
 * @param {string} targetLang - Target language code.
 * @param {string} apiKey - DeepL API key.
 * @returns {Promise<Object>} Translation result.
 */
async function translateWithDeepL(text, targetLang, apiKey) {
  const deepLLang = convertToDeepLLang(targetLang);

  // Auto-detect Pro or Free version API
  // Free version keys usually end with :fx
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

  // Handle non-JSON error response
  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    if (isJson) {
      const errorData = await response.json().catch(() => ({}));
      errorMsg = errorData.message || errorMsg;
    } else {
      const errorText = await response.text().catch(() => '');
      console.error('DeepL non-JSON error response:', errorText);
    }
    throw new Error(`DeepL Translation Failed: ${errorMsg}`);
  }

  if (!isJson) {
    throw new Error('DeepL service returned invalid format');
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

  throw new Error('DeepL returned invalid data format');
}

// Translate text (DeepL only)
/**
 * Fetches translation for the given text with concurrency protection and caching.
 * @param {string} text - Text to translate.
 * @param {string} targetLang - Target language code.
 * @returns {Promise<Object>}
 */
async function translateText(text, targetLang) {
  if (!text || !text.trim()) return null;
  const apiKey = await getDeepLApiKey();

  if (!apiKey) {
    throw new Error('Please configure DeepL API Key');
  }

  const cacheKey = `${targetLang}:${text.trim()}`;
  if (pendingTranslationRequests.has(cacheKey)) {
    return pendingTranslationRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      console.log('[Translation] Using DeepL engine');
      return await translateWithDeepL(text, targetLang, apiKey);
    } finally {
      pendingTranslationRequests.delete(cacheKey);
    }
  })();

  pendingTranslationRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

// Extension installation or update handling
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Translater extension installed');
  } else if (details.reason === 'update') {
    console.log('Translater extension updated to version', chrome.runtime.getManifest().version);
  }
});
