import {
  createViewerPageUrl,
  hasViewerBypass,
  isMdUrl,
  isPdfUrl
} from './viewer-routing.js';

// Translater - Chrome Translation Extension Background Worker

// ==================== Dictionary Cache ====================

// Simple LRU cache, stores up to 100 words, expires in 30 minutes
const dictionaryCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const DICTIONARY_CACHE_SCHEMA_VERSION = 7;

function isFreshDictionaryCacheEntry(entry) {
  return Boolean(
    entry &&
    entry.schemaVersion === DICTIONARY_CACHE_SCHEMA_VERSION &&
    Date.now() - entry.timestamp < CACHE_TTL
  );
}

// Preload cache from storage
chrome.storage.local.get(['dictionaryCache'], (result) => {
  if (result.dictionaryCache) {
    result.dictionaryCache.forEach(([word, entry]) => {
      if (isFreshDictionaryCacheEntry(entry)) {
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
  if (isFreshDictionaryCacheEntry(cached)) {
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
  dictionaryCache.set(word, {
    data,
    timestamp: Date.now(),
    schemaVersion: DICTIONARY_CACHE_SCHEMA_VERSION
  });
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
    if (globalThis.chrome?.storage?.local?.set) {
      globalThis.chrome.storage.local.set({ dictionaryCache: Array.from(dictionaryCache.entries()) });
    }
  }, 1000);
}
// Tracking active requests (prevent concurrent duplicate requests)
const pendingDictionaryRequests = new Map();
const pendingTranslationRequests = new Map();
const REQUEST_TIMEOUT_MS = 15000;
const MAX_TRANSLATION_TEXT_CHARS = 500;
const TRANSLATION_CACHE_MAX_SIZE = 2000;
const TRANSLATION_CACHE_TTL = 90 * 24 * 60 * 60 * 1000; // 90 days
const QUOTA_BREAKER_TTL = 24 * 60 * 60 * 1000; // 24 hours
const TRANSLATION_CACHE_STORAGE_KEY = 'translationCache';
const DEEPL_QUOTA_STATE_STORAGE_KEY = 'deepLQuotaState';
const TRANSLATE_TRIGGER_MODE_KEY = 'translateTriggerMode';
const DEFAULT_TRANSLATE_TRIGGER_MODE = 'click';

const translationCache = new Map();
let translationCacheSavePending = false;
let deepLQuotaState = null;

const translationStateReady = new Promise(resolve => {
  chrome.storage.local.get([TRANSLATION_CACHE_STORAGE_KEY, DEEPL_QUOTA_STATE_STORAGE_KEY], (result) => {
    const storedCache = result[TRANSLATION_CACHE_STORAGE_KEY];
    if (Array.isArray(storedCache)) {
      storedCache.forEach(([key, entry]) => {
        if (isFreshTranslationCacheEntry(entry)) {
          translationCache.set(key, entry);
        }
      });
    }
    deepLQuotaState = normalizeQuotaState(result[DEEPL_QUOTA_STATE_STORAGE_KEY]);
    pruneTranslationCache();
    resolve();
  });
});

class TranslationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
  }
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeTranslationText(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

function createTranslationCacheKey(targetLang, text) {
  const normalized = `${targetLang}:${normalizeTranslationText(text)}`;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${targetLang}:${normalized.length}:${(hash >>> 0).toString(36)}`;
}

function isFreshTranslationCacheEntry(entry, now = Date.now()) {
  return !!entry && Number.isFinite(entry.createdAt) && now - entry.createdAt < TRANSLATION_CACHE_TTL;
}

function formatTranslationCacheEntry(entry, cached = false) {
  return {
    original: entry.original,
    translated: entry.translated,
    sourceLang: entry.sourceLang || 'auto',
    engine: entry.engine || 'DeepL',
    cached
  };
}

function getCachedTranslation(cacheKey) {
  const entry = translationCache.get(cacheKey);
  if (!entry) return null;
  if (!isFreshTranslationCacheEntry(entry)) {
    translationCache.delete(cacheKey);
    saveTranslationCache();
    return null;
  }
  entry.lastAccessedAt = Date.now();
  translationCache.delete(cacheKey);
  translationCache.set(cacheKey, entry);
  saveTranslationCache();
  return formatTranslationCacheEntry(entry, true);
}

function setCachedTranslation(cacheKey, result) {
  const now = Date.now();
  translationCache.set(cacheKey, {
    original: result.original,
    translated: result.translated,
    targetLang: result.targetLang,
    sourceLang: result.sourceLang,
    engine: result.engine,
    createdAt: now,
    lastAccessedAt: now
  });
  pruneTranslationCache();
  saveTranslationCache();
}

function pruneTranslationCache(now = Date.now()) {
  for (const [key, entry] of translationCache.entries()) {
    if (!isFreshTranslationCacheEntry(entry, now)) {
      translationCache.delete(key);
    }
  }

  if (translationCache.size <= TRANSLATION_CACHE_MAX_SIZE) return;

  const entries = Array.from(translationCache.entries())
    .sort((a, b) => (a[1].lastAccessedAt || a[1].createdAt || 0) - (b[1].lastAccessedAt || b[1].createdAt || 0));
  const entriesToDelete = entries.slice(0, translationCache.size - TRANSLATION_CACHE_MAX_SIZE);
  entriesToDelete.forEach(([key]) => translationCache.delete(key));
}

function saveTranslationCache() {
  if (translationCacheSavePending) return;
  translationCacheSavePending = true;
  const storageArea = chrome.storage.local;

  setTimeout(() => {
    translationCacheSavePending = false;
    storageArea.set({ [TRANSLATION_CACHE_STORAGE_KEY]: Array.from(translationCache.entries()) });
  }, 500);
}

function normalizeQuotaState(state) {
  if (!state || state.status !== 'quota-exceeded' || !Number.isFinite(state.timestamp)) return null;
  if (Date.now() - state.timestamp >= QUOTA_BREAKER_TTL) return null;
  return state;
}

function isDeepLQuotaBlocked() {
  deepLQuotaState = normalizeQuotaState(deepLQuotaState);
  return !!deepLQuotaState;
}

async function setDeepLQuotaExceeded() {
  deepLQuotaState = {
    status: 'quota-exceeded',
    timestamp: Date.now()
  };
  await chrome.storage.local.set({ [DEEPL_QUOTA_STATE_STORAGE_KEY]: deepLQuotaState });
}

async function clearDeepLQuotaState() {
  deepLQuotaState = null;
  await chrome.storage.local.remove(DEEPL_QUOTA_STATE_STORAGE_KEY);
}

function normalizeTranslateTriggerMode(mode) {
  return mode === 'hover' ? 'hover' : DEFAULT_TRANSLATE_TRIGGER_MODE;
}

// API Key memory cache
let cachedMWApiKey = null;
let cachedDeepLApiKey = null;
let cachedTranslateTriggerMode = null;

// Prefetch API Keys on initialization
async function prefetchApiKeys() {
  const result = await chrome.storage.sync.get(['mwApiKey', 'deepLApiKey', TRANSLATE_TRIGGER_MODE_KEY]);
  cachedMWApiKey = result.mwApiKey || '';
  cachedDeepLApiKey = result.deepLApiKey || '';
  cachedTranslateTriggerMode = normalizeTranslateTriggerMode(result[TRANSLATE_TRIGGER_MODE_KEY]);
  console.log('[Background] API Keys prefetched');
}
prefetchApiKeys();

// Sync cache on storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.mwApiKey) cachedMWApiKey = changes.mwApiKey.newValue;
    if (changes.deepLApiKey) {
      cachedDeepLApiKey = changes.deepLApiKey.newValue;
      clearDeepLQuotaState().catch(error => console.error('[Background] Failed to clear DeepL quota state:', error));
    }
    if (changes[TRANSLATE_TRIGGER_MODE_KEY]) {
      cachedTranslateTriggerMode = normalizeTranslateTriggerMode(changes[TRANSLATE_TRIGGER_MODE_KEY].newValue);
    }
  }
});

// ==================== PDF Redirection ====================

// Monitor navigation to detect and redirect PDFs and Markdown files
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (details.url.includes('pdfviewer.html') || details.url.includes('mdviewer.html')) return;
  if (hasViewerBypass(details.url)) return;

  if (isPdfUrl(details.url)) {
    chrome.tabs.update(details.tabId, {
      url: createViewerPageUrl('pdfviewer.html', details.url, value => chrome.runtime.getURL(value))
    });
  } else if (isMdUrl(details.url)) {
    chrome.tabs.update(details.tabId, {
      url: createViewerPageUrl('mdviewer.html', details.url, value => chrome.runtime.getURL(value))
    });
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
    getDeepLUsage: () => getDeepLUsage(),
    clearTranslationCache: () => clearTranslationCache(),
    getTranslationCacheStats: () => getTranslationCacheStats(),
    getTranslationTriggerMode: () => getTranslationTriggerMode().then(mode => ({ mode })),
    setTranslationTriggerMode: () => setTranslationTriggerMode(request.mode),
    speakText: () => speakTextWithChromeTts(request.text, request.options || {}),
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
        sendResponse({
          success: false,
          error: error.message || 'Unknown error',
          errorCode: error.code || undefined
        });
      }
    })();
    return true;
  }
});

// ==================== Chrome TTS ====================

function createBackgroundError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getChromeTtsVoices() {
  if (!chrome.tts || typeof chrome.tts.getVoices !== 'function') {
    return Promise.resolve([]);
  }

  return new Promise(resolve => {
    chrome.tts.getVoices(voices => {
      resolve(Array.isArray(voices) ? voices : []);
    });
  });
}

function looksLikeExtensionId(value) {
  return /^[a-p]{32}$/.test(String(value || ''));
}

function normalizeLanguage(value) {
  return String(value || '').toLowerCase();
}

function scoreChromeTtsVoice(voice, targetLang) {
  const voiceLang = normalizeLanguage(voice.lang);
  const target = normalizeLanguage(targetLang || 'en-US');
  const targetBase = target.split('-')[0];
  const voiceName = String(voice.voiceName || '');
  const lowerName = voiceName.toLowerCase();
  let score = 0;

  if (!voiceName || looksLikeExtensionId(voiceName)) score -= 1000;
  if (looksLikeExtensionId(voice.extensionId)) score -= 120;
  if (!voice.extensionId) score += 120;
  if (voice.remote === false) score += 30;

  if (voiceLang === target) score += 90;
  else if (voiceLang.startsWith(`${targetBase}-`)) score += 60;
  else if (voiceLang.startsWith('en')) score += 25;
  else score -= 200;

  if (lowerName.includes('samantha')) score += 45;
  if (lowerName.includes('alex')) score += 40;
  if (lowerName.includes('google us english')) score += 35;
  if (lowerName.includes('english') || lowerName.includes('en-us')) score += 15;
  if (lowerName.includes('compact')) score -= 10;

  return score;
}

function chooseChromeTtsVoice(voices, targetLang) {
  const candidates = voices
    .filter(voice => voice && typeof voice.voiceName === 'string')
    .map(voice => ({
      voice,
      score: scoreChromeTtsVoice(voice, targetLang)
    }))
    .filter(candidate => candidate.score > -100)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.voice || null;
}

async function speakTextWithChromeTts(text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { spoken: false };

  if (!chrome.tts || typeof chrome.tts.speak !== 'function') {
    throw createBackgroundError('Chrome TTS is unavailable.', 'TTS_UNAVAILABLE');
  }

  const {
    lang = 'en-US',
    rate = 1.0,
    pitch = 1.0,
    volume = 0.8
  } = options;

  const voices = await getChromeTtsVoices();
  const preferredVoice = chooseChromeTtsVoice(voices, lang);
  if (voices.length > 0 && !preferredVoice) {
    throw createBackgroundError('No usable English Chrome TTS voice found.', 'TTS_UNAVAILABLE');
  }

  const ttsOptions = {
    lang,
    rate,
    pitch,
    volume,
    enqueue: false
  };

  if (preferredVoice) {
    ttsOptions.voiceName = preferredVoice.voiceName;
  }

  return new Promise((resolve, reject) => {
    if (typeof chrome.tts.stop === 'function') {
      chrome.tts.stop();
    }

    chrome.tts.speak(trimmed, ttsOptions, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(createBackgroundError(lastError.message || 'Chrome TTS failed.', 'TTS_FAILED'));
        return;
      }
      resolve({
        spoken: true,
        provider: 'chrome.tts',
        voiceName: preferredVoice?.voiceName || ''
      });
    });
  });
}

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

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getMWEntryId(entry, fallback = '') {
  return String(entry?.meta?.id || fallback).replace(/:\d+$/, '');
}

function normalizeMWWord(value) {
  return String(value || '').replace(/\*/g, '').toLowerCase();
}

function getMWHeadword(entry, fallback = '') {
  return normalizeMWWord(entry?.hwi?.hw || getMWEntryId(entry, fallback));
}

function addUniqueWordCandidate(candidates, candidate, sourceWord) {
  const normalizedCandidate = normalizeMWWord(candidate);
  if (!normalizedCandidate || normalizedCandidate === sourceWord) return;
  if (!candidates.includes(normalizedCandidate)) {
    candidates.push(normalizedCandidate);
  }
}

function addUndoubledCandidate(candidates, stem, sourceWord) {
  if (stem.length < 2) return;

  const last = stem.at(-1);
  const previous = stem.at(-2);
  if (last && last === previous && /[bcdfghjklmnpqrstvwxyz]/.test(last)) {
    addUniqueWordCandidate(candidates, stem.slice(0, -1), sourceWord);
  }
}

function getLikelyBaseWordCandidates(word) {
  const sourceWord = normalizeMWWord(word);
  const candidates = [];

  if (sourceWord.endsWith('ied') && sourceWord.length > 3) {
    addUniqueWordCandidate(candidates, `${sourceWord.slice(0, -3)}y`, sourceWord);
  }

  if (sourceWord.endsWith('ies') && sourceWord.length > 3) {
    addUniqueWordCandidate(candidates, `${sourceWord.slice(0, -3)}y`, sourceWord);
  }

  if (sourceWord.endsWith('ing') && sourceWord.length > 4) {
    const stem = sourceWord.slice(0, -3);
    addUniqueWordCandidate(candidates, stem, sourceWord);
    addUndoubledCandidate(candidates, stem, sourceWord);
    addUniqueWordCandidate(candidates, `${stem}e`, sourceWord);
  }

  if (!sourceWord.endsWith('ied') && sourceWord.endsWith('ed') && sourceWord.length > 3) {
    const stem = sourceWord.slice(0, -2);
    addUniqueWordCandidate(candidates, stem, sourceWord);
    addUndoubledCandidate(candidates, stem, sourceWord);
    addUniqueWordCandidate(candidates, sourceWord.slice(0, -1), sourceWord);
  }

  if (!sourceWord.endsWith('ies') && sourceWord.endsWith('es') && sourceWord.length > 3) {
    addUniqueWordCandidate(candidates, sourceWord.slice(0, -2), sourceWord);
    addUniqueWordCandidate(candidates, sourceWord.slice(0, -1), sourceWord);
  } else if (sourceWord.endsWith('s') && sourceWord.length > 2) {
    addUniqueWordCandidate(candidates, sourceWord.slice(0, -1), sourceWord);
  }

  return candidates.slice(0, 4);
}

function formatMWPronunciationText(pronunciation) {
  const text = pronunciation?.ipa || pronunciation?.mw || '';
  return text ? `/${text}/` : '';
}

function getPhoneticBody(text) {
  return String(text || '').trim().replace(/^\/+|\/+$/g, '');
}

function getLastIpaToken(phoneticBody) {
  const body = getPhoneticBody(phoneticBody)
    .replace(/[ˈˌ.()\-\s]/g, '')
    .replace(/ː/g, '');

  for (const token of ['tʃ', 'dʒ', 'θ', 'ð', 'ʃ', 'ʒ', 'ŋ']) {
    if (body.endsWith(token)) return token;
  }

  return body.at(-1) || '';
}

function getRegularEdIpaSuffix(basePhoneticText) {
  const lastToken = getLastIpaToken(basePhoneticText);
  if (!lastToken) return '';
  if (['t', 'd'].includes(lastToken)) return 'ɪd';
  if (['p', 'k', 'f', 'θ', 's', 'ʃ', 'tʃ'].includes(lastToken)) return 't';
  return 'd';
}

function getRegularSIpaSuffix(basePhoneticText) {
  const lastToken = getLastIpaToken(basePhoneticText);
  if (!lastToken) return '';
  if (['s', 'z', 'ʃ', 'ʒ', 'tʃ', 'dʒ'].includes(lastToken)) return 'ɪz';
  if (['p', 't', 'k', 'f', 'θ'].includes(lastToken)) return 's';
  return 'z';
}

function getInflectedPhoneticText(basePhoneticText, selectedWord, sourceWord) {
  const body = getPhoneticBody(basePhoneticText);
  const selected = normalizeMWWord(selectedWord);
  const source = normalizeMWWord(sourceWord);
  if (!body || !selected || !source || selected === source) return '';

  if (selected.endsWith('ed') && getLikelyBaseWordCandidates(selected).includes(source)) {
    const suffix = getRegularEdIpaSuffix(body);
    return suffix ? `/${body}${suffix}/` : '';
  }

  if ((selected.endsWith('s') || selected.endsWith('es')) &&
    getLikelyBaseWordCandidates(selected).includes(source)) {
    const suffix = getRegularSIpaSuffix(body);
    return suffix ? `/${body}${suffix}/` : '';
  }

  return '';
}

function deriveRegularInflectionPronunciation(pronunciation, selectedWord) {
  if (!pronunciation?.text) return pronunciation;

  const selected = normalizeMWWord(selectedWord);
  const sourceWord = normalizeMWWord(pronunciation.sourceWord);
  const inflectedText = getInflectedPhoneticText(pronunciation.text, selected, sourceWord);
  if (!inflectedText) return pronunciation;

  return {
    ...pronunciation,
    text: inflectedText,
    source: 'derived-inflection',
    sourceWord: selected,
    audioSourceWord: pronunciation.audioSourceWord || sourceWord
  };
}

function normalizeMWPronunciation(pronunciation, sourceWord = '', source = 'headword') {
  if (!pronunciation || typeof pronunciation !== 'object') return null;

  const text = formatMWPronunciationText(pronunciation);
  const audio = pronunciation.sound?.audio ? buildMWAudioUrl(pronunciation.sound.audio) : '';

  if (!text && !audio) return null;
  return {
    text,
    audio,
    source,
    sourceWord: normalizeMWWord(sourceWord)
  };
}

function collectMWPronunciations(container, sourceWord = '', source = 'headword') {
  if (!container || typeof container !== 'object') return [];

  const pronunciations = [];
  pronunciations.push(...asArray(container.prs));

  for (const altPronunciations of asArray(container.altprs)) {
    pronunciations.push(...asArray(altPronunciations?.pr));
    pronunciations.push(...asArray(altPronunciations?.prs));
  }

  return pronunciations
    .map(pronunciation => normalizeMWPronunciation(pronunciation, sourceWord, source))
    .filter(Boolean);
}

function findFirstMWPronunciation(containers, sourceWord, source) {
  for (const container of containers) {
    const pronunciation = collectMWPronunciations(container, sourceWord, source)[0];
    if (pronunciation) return pronunciation;
  }
  return null;
}

function uniqueMWEntries(entries, primaryEntry) {
  const seen = new Set();
  return [primaryEntry, ...entries]
    .filter(entry => entry && typeof entry !== 'string')
    .filter(entry => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function getRelevantMWEntries(entries, primaryEntry, resolvedWord) {
  const resolved = normalizeMWWord(resolvedWord || getMWEntryId(primaryEntry));
  return uniqueMWEntries(entries, primaryEntry)
    .filter(entry => {
      if (entry === primaryEntry) return true;
      return getMWEntryId(entry).toLowerCase() === resolved ||
        getMWHeadword(entry) === resolved ||
        asArray(entry?.meta?.stems).some(stem => normalizeMWWord(stem) === resolved);
    });
}

function findFirstMWPronunciationFromSources(sources) {
  for (const source of sources) {
    const pronunciation = collectMWPronunciations(
      source.container,
      source.sourceWord,
      source.source
    )[0];
    if (pronunciation) return pronunciation;
  }
  return null;
}

function getExactHeadwordSources(entries, searchedWord) {
  const searched = normalizeMWWord(searchedWord);
  return entries
    .filter(entry => (
      getMWEntryId(entry).toLowerCase() === searched ||
      getMWHeadword(entry) === searched
    ))
    .map(entry => ({
      container: entry.hwi,
      source: 'headword',
      sourceWord: searched
    }));
}

function getMatchingInflectionSources(entries, searchedWord) {
  const searched = normalizeMWWord(searchedWord);
  return entries.flatMap(entry => (
    asArray(entry?.ins)
      .filter(inflection => normalizeMWWord(inflection?.if) === searched)
      .map(inflection => ({
        container: inflection,
        source: 'inflection',
        sourceWord: searched
      }))
  ));
}

function getMatchingAlternateHeadwordSources(entries, searchedWord) {
  const searched = normalizeMWWord(searchedWord);
  return entries.flatMap(entry => (
    asArray(entry?.ahws)
      .filter(alternateHeadword => normalizeMWWord(alternateHeadword?.hw) === searched)
      .map(alternateHeadword => ({
        container: alternateHeadword,
        source: 'alternate-headword',
        sourceWord: searched
      }))
  ));
}

function getMatchingVariantSources(entries, searchedWord) {
  const searched = normalizeMWWord(searchedWord);
  return entries.flatMap(entry => (
    asArray(entry?.vrs)
      .filter(variant => normalizeMWWord(variant?.va) === searched)
      .map(variant => ({
        container: variant,
        source: 'variant',
        sourceWord: searched
      }))
  ));
}

function getResolvedHeadwordSources(entries, resolvedWord) {
  const resolved = normalizeMWWord(resolvedWord);
  return entries
    .filter(entry => (
      getMWEntryId(entry).toLowerCase() === resolved ||
      getMWHeadword(entry) === resolved
    ))
    .map(entry => ({
      container: entry.hwi,
      source: 'headword',
      sourceWord: resolved
    }));
}

function getAnyRelevantPronunciationSources(entries, resolvedWord) {
  const resolved = normalizeMWWord(resolvedWord);
  return entries.flatMap(entry => ([
    {
      container: entry.hwi,
      source: 'headword',
      sourceWord: getMWHeadword(entry, resolved)
    },
    ...asArray(entry?.ahws).map(alternateHeadword => ({
      container: alternateHeadword,
      source: 'alternate-headword',
      sourceWord: normalizeMWWord(alternateHeadword?.hw)
    })),
    ...asArray(entry?.vrs).map(variant => ({
      container: variant,
      source: 'variant',
      sourceWord: normalizeMWWord(variant?.va)
    })),
    ...asArray(entry?.ins).map(inflection => ({
      container: inflection,
      source: 'inflection',
      sourceWord: normalizeMWWord(inflection?.if)
    }))
  ]));
}

function findBestMWPronunciation(entries, primaryEntry, searchedWord, resolvedWord) {
  const searched = normalizeMWWord(searchedWord);
  const resolved = normalizeMWWord(resolvedWord || getMWEntryId(primaryEntry, searchedWord));
  const relevantEntries = getRelevantMWEntries(entries, primaryEntry, resolved);

  const exactHeadwordSources = getExactHeadwordSources(relevantEntries, searched);
  const selectedFormSources = [
    ...getMatchingInflectionSources(relevantEntries, searched),
    ...getMatchingAlternateHeadwordSources(relevantEntries, searched),
    ...getMatchingVariantSources(relevantEntries, searched)
  ];
  const resolvedHeadwordSources = getResolvedHeadwordSources(relevantEntries, resolved);
  const broadFallbackSources = getAnyRelevantPronunciationSources(relevantEntries, resolved);

  const prioritySources = searched === resolved
    ? [
      ...exactHeadwordSources,
      ...selectedFormSources,
      ...resolvedHeadwordSources,
      ...broadFallbackSources
    ]
    : [
      ...selectedFormSources,
      ...exactHeadwordSources,
      ...resolvedHeadwordSources,
      ...broadFallbackSources
    ];

  return findFirstMWPronunciationFromSources(prioritySources);
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

  const pronunciation = findBestMWPronunciation(data, entry, word, apiWord);
  const phonetic = pronunciation?.text || '';
  const audioUrl = pronunciation?.audio || '';

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
    phonetics: pronunciation ? [pronunciation] : [],
    meanings: meanings || []
  };
}

function hasDictionaryPronunciation(result) {
  return Boolean(
    result?.phonetic ||
    result?.phonetics?.some(phonetic => phonetic?.text || phonetic?.audio)
  );
}

function mergeDictionaryPronunciation(target, source) {
  if (!target || !source) return target;

  if (!target.phonetic && source.phonetic) {
    target.phonetic = source.phonetic;
  }

  if ((!target.phonetics || target.phonetics.length === 0) && Array.isArray(source.phonetics)) {
    target.phonetics = source.phonetics;
  }

  return target;
}

async function fillResolvedHeadwordPronunciation(result, normalizedWord) {
  if (hasDictionaryPronunciation(result)) return result;

  const resolvedWord = String(result?.word || '').trim().toLowerCase();
  if (!resolvedWord || resolvedWord === normalizedWord) return result;

  try {
    const resolvedResult = await fetchDictionary(resolvedWord);
    if (hasDictionaryPronunciation(resolvedResult)) {
      mergeDictionaryPronunciation(result, resolvedResult);
    }
  } catch (error) {
    console.warn(`[MW API] Could not load pronunciation for resolved headword "${resolvedWord}":`, error);
  }

  return result;
}

async function fetchMWLearnersData(normalizedWord) {
  const apiKey = await getMWApiKey();
  if (!apiKey) {
    throw new Error('Please configure Merriam-Webster API Key');
  }

  const url = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(normalizedWord)}?key=${apiKey}`;

  console.log(`[MW API] Query: ${normalizedWord}`);

  const response = await fetchWithTimeout(url);

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

  return response.json();
}

async function fetchPronunciationFromLookupWord(lookupWord, pronunciationWord) {
  const data = await fetchMWLearnersData(lookupWord);
  const result = parseMWLearnersResponse(data, pronunciationWord);
  if (hasDictionaryPronunciation(result)) {
    result.phonetics = result.phonetics
      .map(pronunciation => deriveRegularInflectionPronunciation(pronunciation, pronunciationWord));
    result.phonetic = result.phonetics.find(pronunciation => pronunciation?.text)?.text || result.phonetic;
  }
  return hasDictionaryPronunciation(result) ? result : null;
}

async function fillLikelyBaseWordPronunciation(result, normalizedWord) {
  if (hasDictionaryPronunciation(result)) return result;

  for (const candidate of getLikelyBaseWordCandidates(normalizedWord)) {
    try {
      const candidateResult = await fetchPronunciationFromLookupWord(candidate, normalizedWord);
      if (hasDictionaryPronunciation(candidateResult)) {
        mergeDictionaryPronunciation(result, candidateResult);
        return result;
      }
    } catch (error) {
      console.warn(`[MW API] Could not load pronunciation candidate "${candidate}" for "${normalizedWord}":`, error);
    }
  }

  return result;
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
      const data = await fetchMWLearnersData(normalizedWord);

      // Parse API response
      const result = parseMWLearnersResponse(data, word);

      if (!result || !result.meanings || result.meanings.length === 0) {
        console.log(`[Background] ${normalizedWord} no definition found, falling back to translation`);
        return null; // Return null instead of error to trigger fallback translation logic in content script
      }

      await fillResolvedHeadwordPronunciation(result, normalizedWord);
      await fillLikelyBaseWordPronunciation(result, normalizedWord);

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
  await clearDeepLQuotaState();
  return true;
}

async function getTranslationTriggerMode() {
  if (cachedTranslateTriggerMode) return cachedTranslateTriggerMode;
  const result = await chrome.storage.sync.get([TRANSLATE_TRIGGER_MODE_KEY]);
  cachedTranslateTriggerMode = normalizeTranslateTriggerMode(result[TRANSLATE_TRIGGER_MODE_KEY]);
  return cachedTranslateTriggerMode;
}

async function setTranslationTriggerMode(mode) {
  const normalizedMode = normalizeTranslateTriggerMode(mode);
  await chrome.storage.sync.set({ [TRANSLATE_TRIGGER_MODE_KEY]: normalizedMode });
  cachedTranslateTriggerMode = normalizedMode;
  return true;
}

function getDeepLBaseUrl(apiKey, path) {
  const isPro = !apiKey.endsWith(':fx');
  return isPro ? `https://api.deepl.com/v2/${path}` : `https://api-free.deepl.com/v2/${path}`;
}

async function getDeepLUsage() {
  const apiKey = await getDeepLApiKey();
  if (!apiKey) {
    throw new TranslationError('Please configure DeepL API Key', 'MISSING_API_KEY');
  }

  const response = await fetchWithTimeout(getDeepLBaseUrl(apiKey, 'usage'), {
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`
    }
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    if (isJson) {
      const errorData = await response.json().catch(() => ({}));
      errorMsg = errorData.message || errorMsg;
    }
    throw new TranslationError(`DeepL usage check failed: ${errorMsg}`, response.status === 456 ? 'QUOTA_EXCEEDED' : 'DEEPL_USAGE_FAILED');
  }
  if (!isJson) {
    throw new TranslationError('DeepL usage check returned invalid format', 'DEEPL_USAGE_FAILED');
  }

  const usage = await response.json();
  if (Number.isFinite(usage.character_count) && Number.isFinite(usage.character_limit)) {
    if (usage.character_limit > usage.character_count) {
      await clearDeepLQuotaState();
    }
    usage.remaining = Math.max(0, usage.character_limit - usage.character_count);
  }
  usage.quotaState = deepLQuotaState?.status || 'ok';
  return usage;
}

async function clearTranslationCache() {
  translationCache.clear();
  await chrome.storage.local.remove(TRANSLATION_CACHE_STORAGE_KEY);
  return true;
}

async function getTranslationCacheStats() {
  await translationStateReady;
  pruneTranslationCache();
  return {
    entries: translationCache.size,
    maxEntries: TRANSLATION_CACHE_MAX_SIZE,
    ttlDays: Math.round(TRANSLATION_CACHE_TTL / (24 * 60 * 60 * 1000))
  };
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

  const response = await fetchWithTimeout(getDeepLBaseUrl(apiKey, 'translate'), {
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
    if (response.status === 456) {
      throw new TranslationError('DeepL quota exceeded. Please wait for quota reset or update your API plan.', 'QUOTA_EXCEEDED');
    }
    throw new TranslationError(`DeepL Translation Failed: ${errorMsg}`, 'DEEPL_TRANSLATION_FAILED');
  }

  if (!isJson) {
    throw new Error('DeepL service returned invalid format');
  }

  const data = await response.json();

  if (data.translations && data.translations.length > 0) {
    return {
      original: text,
      translated: data.translations[0].text,
      targetLang: targetLang,
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
  const trimmedText = (text || '').trim();
  if (!trimmedText) return null;
  if (trimmedText.length > MAX_TRANSLATION_TEXT_CHARS) {
    throw new TranslationError('Selected text exceeds 500 characters. Please shorten the selection.', 'TEXT_TOO_LONG');
  }

  await translationStateReady;
  const cacheKey = createTranslationCacheKey(targetLang, trimmedText);
  const cachedTranslation = getCachedTranslation(cacheKey);
  if (cachedTranslation) {
    return cachedTranslation;
  }

  if (isDeepLQuotaBlocked()) {
    throw new TranslationError('DeepL quota exceeded. Please wait for quota reset or update your API plan.', 'QUOTA_EXCEEDED');
  }

  const apiKey = await getDeepLApiKey();

  if (!apiKey) {
    throw new TranslationError('Please configure DeepL API Key', 'MISSING_API_KEY');
  }

  if (pendingTranslationRequests.has(cacheKey)) {
    return pendingTranslationRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      console.log('[Translation] Using DeepL engine');
      const translated = await translateWithDeepL(trimmedText, targetLang, apiKey);
      setCachedTranslation(cacheKey, translated);
      return translated;
    } catch (error) {
      if (error.code === 'QUOTA_EXCEEDED') {
        await setDeepLQuotaExceeded();
      }
      throw error;
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
    dictionaryCache.clear();
    chrome.storage.local.remove(['dictionaryCache']);
    console.log('Translater extension updated to version', chrome.runtime.getManifest().version);
  }
});
