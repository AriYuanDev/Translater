// 快译 - Chrome 翻译扩展后台服务

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

// 获取词典数据
async function fetchDictionary(word) {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

  if (!response.ok) {
    throw new Error('未找到该单词');
  }

  const data = await response.json();
  return data[0];
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
