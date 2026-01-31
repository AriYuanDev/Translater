# 快译 技术手册 (Technical Documentation)

> **版本**: 1.4.0 (Robustness & UI Refinement)  
> **更新日期**: 2026-01-31
> **主要改进**: 引入了 Shadow DOM 异步样式同步机制，优化了词典排版，并增强了 API 层并发保护与容错。

## 1. 概述 (Overview)

快译是一个全平台（Chrome & VS Code）生产力套件，提供高精度划词翻译、美式词典查询和自然语音朗读功能。

---

## 2. 核心架构 (Architecture)

### 2.1 现代 ES 模块化设计
项目采用 **ES Modules (ESM)** 架构，通过核心工具库实现逻辑复用：
- **[utils.js](file:///utils.js)**: 容纳所有共享逻辑（安全消息传递、TTS 驱动、安全转义、坐标计算等）。
- **动态导入**: 在 `content.js` 和 `pdfviewer.js` 中使用 `await import(chrome.runtime.getURL('utils.js'))` 实现即时加载。

### 2.2 UI 隔离与同步 (Shadow DOM)
-   **样式同步**: 针对异步加载 `link` 标签导致的无样式内容闪烁 (FOUC) 风险，引入了基于 `Promise` 的样式等待机制。在 `ensureShadowRoot` 中挂载 `styles.css` 后，会监听 `onload` 事件，确保 UI 逻辑仅在 CSS 生效后执行。
-   **隔离性**: 确保弹窗样式在任何网页（如 GitHub, Gmail）下均不会变形。
-   **一致性**: PDF 查看器与普通网页共享相同的阴影根创建逻辑，保持视效统。

---

## 3. Chrome 扩展模块 (Chrome Extension)

### 3.1 background.js (后台大脑)
-   **API 智能检测**: 自动识别 DeepL Free (:fx) 与 Pro 密钥，动态切换 API 端点。
-   **并发保护**: 引入 `pendingRequests` Map 追踪进行中的网络请求。针对同一文本的短时重复触发，自动执行 promise 复用，降低 API 成本。
-   **响应容错**: 强制校验 `Content-Type: application/json`，防止在 API 返回错误 HTML 页面时触发 JSON 解析崩溃。
-   **LRU 缓存**: 双级缓存机制（内存 + Storage），词典查询结果缓存 30 分钟。
- **PDF 智能重定向**: 优化的正则算法，拦截符合 PDF 特征的导航并切换至定制阅读器。

### 3.2 UI 交互逻辑 (content.js)
- **安全 DOM 链**: 抛弃 `innerHTML`，全量使用 `createElement` 链式调用，天然免疫 XSS 攻击。
- **双击取词**: 自动识别英语单词，首选 Merriam-Webster Learners 词典，备选 DeepL 翻译。
- **智能悬浮组**: 选中文本后动态计算最优位置，支持「划词即读」和「即时译」。

---

## 4. PDF 阅读器 (PDF Viewer)

- **核心引擎**: 基于 PDF.js v4.x。
- **懒加载渲染**: 结合 `IntersectionObserver` 实现了长文档的按需渲染，极大地节省了内存。
- **UI 同步技术**: PDF 查看器内的翻译弹窗采用与普通网页相同的 Shadow DOM 技术，确保操作体验无缝切换。

---

## 5. VS Code 扩展端 (VS Code Integration)

- **轻量化原则**: 剔除了 Hover UI 以保持编辑器的纯净，仅保留右键菜单「Translate」命令。
- **现代化网络层**: 使用原生 `fetch` 替代了 Node.js Legacy `https` 模块，极大增强了重定向处理的稳定性。

---

## 6. 安全与性能指标 (Security & Performance)

- **100% XSS 防御**: `escapeHtml` 映射转义配合 `textContent` 注入。
- **零延迟 TTS**: `waitForVoices` 机制解决了 Web Speech API 重度冷启动问题。
- **极小体积**: 无外部重型依赖，所有资源（PDF.js 除外）均为原生实现。

---

## 7. 开发与维护 (Maintenance)

- **图标生成**: `/generate_icons.py` 可用于快速缩放多尺寸图标。
- **词典源**: 采用 Merriam-Webster Learners API，需注意申请时的词典类型选择。
