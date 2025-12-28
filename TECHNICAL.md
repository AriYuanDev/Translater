# 快译 技术手册

> **版本**: 1.2.0  
> **更新日期**: 2025-12-28

## 概述

快译是一个 Chrome 扩展程序，提供划词翻译、单词查询和语音朗读功能。本文档详细说明了扩展的技术架构和实现细节。

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        Chrome 浏览器                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    消息通信     ┌─────────────────────┐    │
│  │ content.js  │ ◄────────────► │   background.js     │    │
│  │  (内容脚本)  │                │   (Service Worker)  │    │
│  └──────┬──────┘                └──────────┬──────────┘    │
│         │                                   │               │
│         ▼                                   ▼               │
│  ┌─────────────┐                ┌─────────────────────┐    │
│  │ styles.css  │                │   外部 API 请求      │    │
│  │  (样式文件)  │                │ - Cambridge Dict    │    │
│  └─────────────┘                │ - Google Translate  │    │
│                                 └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 文件结构

| 文件 | 类型 | 说明 |
|------|------|------|
| `manifest.json` | 配置 | 扩展清单，定义权限和资源 |
| `background.js` | JS | Service Worker，处理 API 请求和词典缓存 |
| `content.js` | JS | 内容脚本，处理页面交互和 UI |
| `styles.css` | CSS | 弹窗和按钮样式 |
| `pdfviewer.*` | 多种 | PDF 阅读器模块 |

---

## 核心模块

### 1. background.js - 后台服务

#### 功能职责

- 处理来自 content.js 的消息
- 调用 Cambridge Dictionary 获取单词信息
- **LRU 词典缓存**（100 词上限，30 分钟过期）
- 调用 Google Translate 获取翻译
- 拦截 PDF 文件并重定向到自定义阅读器

#### 关键函数

```javascript
// 词典缓存管理
function getCachedDictionary(word)
function setCachedDictionary(word, data)

// 获取词典数据（带缓存）
async function fetchDictionary(word)

// 解析 Cambridge Dictionary HTML
function parseCambridgeDictionary(html, word)

// 从 IPA span 中提取音标（处理嵌套标签）
function extractPhonetic(ipaHtml)

// 翻译文本
async function translateText(text, targetLang)
```

#### 词典缓存机制

```javascript
const dictionaryCache = new Map();
const CACHE_MAX_SIZE = 100;      // 最多缓存 100 个单词
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟过期
```

#### 音标解析

Cambridge Dictionary 的音标包含嵌套的 HTML 标签：
```html
<span class="ipa">ˈnæʃ.<span class="sp dsp">ə</span>n.əl</span>
```

使用 `extractPhonetic()` 函数清理：
```javascript
function extractPhonetic(ipaHtml) {
  const text = ipaHtml.replace(/<[^>]+>/g, '').trim();
  return text ? `/${text}/` : '';
}
// 输出: /ˈnæʃ.ən.əl/
```

#### API 数据格式

```javascript
{
  word: "hello",
  phonetic: "/heˈloʊ/",     // 美式音标优先
  phonetics: [
    { text: "/heˈloʊ/", audio: "https://...us_pron....mp3" },
    { text: "/heˈləʊ/", audio: "https://...uk_pron....mp3" }
  ],
  meanings: [
    {
      partOfSpeech: "exclamation",
      definitions: [
        { definition: "used when meeting or greeting someone:" }
      ]
    }
  ]
}
```

---

### 2. content.js - 内容脚本

#### 功能职责

- 监听双击事件，触发单词查询
- 监听文本选中，显示悬浮按钮
- 渲染翻译弹窗（加载/成功/失败状态）
- 调用 Web Speech API 进行朗读
- **语音缓存**（缓存美式英语语音对象）

#### 事件处理流程

```
双击英文单词 ──► 显示加载弹窗（含单词）
             ──► 发送 fetchDictionary 消息
             ├─► 成功 ──► 渲染词典弹窗 + 自动朗读
             └─► 失败 ──► 尝试翻译 ──► 显示错误（含单词）

选中文本 ──► 显示悬浮按钮
         ├─► 悬停「译」──► 发送 translate 消息 ──► 显示翻译结果
         └─► 悬停「🔊」──► 调用 speakText() 朗读
```

#### 关键函数

| 函数 | 说明 |
|------|------|
| `escapeHtml(text)` | HTML 转义（字符串替换，防止 XSS） |
| `speakText(text)` | 使用缓存的语音对象朗读 |
| `loadVoices()` | 加载并缓存美式英语语音 |
| `playAudio(url, fallback)` | 播放音频 URL，失败时回退 TTS |
| `autoSpeakWord(data, word)` | 自动选择最佳音频朗读 |
| `renderWordPopup(data, word)` | 渲染词典弹窗 |
| `renderError(word, message)` | 渲染错误弹窗（含原单词） |
| `translateSelection(text, x, y)` | 翻译选中文本 |

---

## 消息通信

content.js 与 background.js 通过 Chrome Message API 通信：

### fetchDictionary

```javascript
// 请求
{ action: 'fetchDictionary', word: 'hello' }

// 响应（成功）
{ success: true, data: { word, phonetic, phonetics, meanings } }

// 响应（失败 - 词条不匹配或未找到）
{ success: false, error: '未找到该单词' }
```

### translate

```javascript
// 请求
{ action: 'translate', text: 'Hello world', targetLang: 'zh-CN' }

// 响应（成功）
{ success: true, data: { original, translated, sourceLang } }
```

---

## 性能优化

### 1. 词典缓存
- LRU 策略，最多 100 个单词
- 30 分钟自动过期
- 缓存命中时跳过网络请求

### 2. 语音缓存
- 预加载美式英语语音对象
- 避免每次朗读时调用 `getVoices()`

### 3. escapeHtml 优化
- 使用字符串替换代替 DOM 操作
- 减少 DOM 创建开销

---

## 安全措施

### XSS 防护

所有用户输入和 API 返回的内容在插入 DOM 前都经过转义：

```javascript
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

### 词条验证

解析 Cambridge 页面前验证词条匹配：
```javascript
const headwordMatch = html.match(/<span class="hw dhw">([^<]+)<\/span>/);
if (!pageHeadword.includes(normalizedWord)) {
  return null;  // 防止返回错误词条的音标
}
```

### 错误处理

- `selection.getRangeAt()` 包裹在 try-catch 中
- 所有 DOM 操作前进行 null 检查
- API 请求失败时显示友好错误信息（含原单词）

---

## 外部依赖

| 服务 | 用途 | URL |
|------|------|-----|
| Cambridge Dictionary | 美式音标和释义 | `dictionary.cambridge.org` |
| Google Translate | 句子翻译 | `translate.googleapis.com` |
| Web Speech API | 本地朗读 | 浏览器内置 |

---

## 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 访问当前标签页 |
| `webNavigation` | 拦截 PDF 文件导航 |
| `host_permissions` | 访问 Cambridge Dictionary 和 Google Translate |

---

## 开发调试

1. 打开 `chrome://extensions/`
2. 启用「开发者模式」
3. 点击扩展卡片上的「Service Worker」查看后台日志
4. 在任意网页按 F12，查看 Console 中的 content.js 日志
5. 缓存命中时会在后台日志显示 `[缓存命中] word`
