# 快译 技术手册

> **版本**: 1.1.0  
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
| `background.js` | JS | Service Worker，处理 API 请求 |
| `content.js` | JS | 内容脚本，处理页面交互和 UI |
| `styles.css` | CSS | 弹窗和按钮样式 |
| `pdfviewer.*` | 多种 | PDF 阅读器模块 |

---

## 核心模块

### 1. background.js - 后台服务

#### 功能职责

- 处理来自 content.js 的消息
- 调用 Cambridge Dictionary 获取单词信息
- 调用 Google Translate 获取翻译
- 拦截 PDF 文件并重定向到自定义阅读器

#### 关键函数

```javascript
// 获取词典数据
async function fetchDictionary(word)

// 解析 Cambridge Dictionary HTML
function parseCambridgeDictionary(html, word)

// 翻译文本
async function translateText(text, targetLang)
```

#### API 数据格式

从 Cambridge Dictionary 解析后返回的数据格式：

```javascript
{
  word: "hello",
  phonetic: "/heˈloʊ/",     // 美式音标优先
  phonetics: [
    { text: "/heˈloʊ/", audio: "https://...us_pron....mp3" },  // US
    { text: "/heˈləʊ/", audio: "https://...uk_pron....mp3" }   // UK
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
- 渲染翻译弹窗
- 调用 Web Speech API 进行朗读

#### 事件处理流程

```
双击英文单词 ──► 发送 fetchDictionary 消息 ──► 渲染词典弹窗
                                            ──► 自动朗读单词

选中文本 ──► 显示悬浮按钮
         ├─► 悬停「译」──► 发送 translate 消息 ──► 显示翻译结果
         └─► 悬停「🔊」──► 调用 speakText() 朗读
```

#### 关键函数

| 函数 | 说明 |
|------|------|
| `escapeHtml(text)` | HTML 转义，防止 XSS |
| `speakText(text)` | 使用 Web Speech API 朗读 |
| `playAudio(url, fallback)` | 播放音频 URL，失败时回退 TTS |
| `autoSpeakWord(data, word)` | 自动选择最佳音频朗读 |
| `renderWordPopup(data, word)` | 渲染词典弹窗 |
| `translateSelection(text, x, y)` | 翻译选中文本并显示弹窗 |

---

## 消息通信

content.js 与 background.js 通过 Chrome Message API 通信：

### fetchDictionary

```javascript
// 请求
{ action: 'fetchDictionary', word: 'hello' }

// 响应（成功）
{ success: true, data: { word, phonetic, phonetics, meanings } }

// 响应（失败）
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

## 安全措施

### XSS 防护

所有用户输入和 API 返回的内容在插入 DOM 前都经过转义：

```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

### 错误处理

- `selection.getRangeAt()` 包裹在 try-catch 中
- 所有 DOM 操作前进行 null 检查
- API 请求失败时显示友好错误信息

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
| `host_permissions` | 访问翻译和词典 API |

---

## 开发调试

1. 打开 `chrome://extensions/`
2. 启用「开发者模式」
3. 点击扩展卡片上的「Service Worker」查看后台日志
4. 在任意网页按 F12，查看 Console 中的 content.js 日志
