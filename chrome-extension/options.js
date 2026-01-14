// 快译 - 设置页面脚本

document.addEventListener('DOMContentLoaded', () => {
    // DeepL 相关元素
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusMessage = document.getElementById('statusMessage');
    const currentEngine = document.getElementById('currentEngine');
    const toast = document.getElementById('toast');

    // Merriam-Webster 相关元素
    const mwApiKeyInput = document.getElementById('mwApiKey');
    const saveMWBtn = document.getElementById('saveMWBtn');
    const clearMWBtn = document.getElementById('clearMWBtn');
    const mwStatusMessage = document.getElementById('mwStatusMessage');

    // 加载当前状态
    loadCurrentStatus();
    loadMWStatus();

    // ==================== DeepL API ====================

    // 保存按钮
    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showStatus('请输入 API 密钥', 'warning');
            return;
        }

        // 验证 API 密钥格式
        if (!apiKey.includes(':fx') && apiKey.length < 30) {
            showStatus('API 密钥格式不正确，请检查', 'warning');
            return;
        }

        saveBtn.textContent = '保存中...';
        saveBtn.disabled = true;

        try {
            // 先测试 API 密钥是否有效
            const testResult = await testDeepLApiKey(apiKey);

            if (testResult.success) {
                // 保存密钥
                await chrome.runtime.sendMessage({
                    action: 'setDeepLApiKey',
                    apiKey: apiKey
                });

                showToast('✅ DeepL API 密钥已保存并验证通过');
                apiKeyInput.value = '';
                loadCurrentStatus();
            } else {
                showStatus('API 密钥验证失败: ' + testResult.error, 'warning');
            }
        } catch (error) {
            showStatus('保存失败: ' + error.message, 'warning');
        } finally {
            saveBtn.textContent = '保存密钥';
            saveBtn.disabled = false;
        }
    });

    // 清除按钮
    clearBtn.addEventListener('click', async () => {
        if (confirm('确定要清除 DeepL API 密钥吗？清除后翻译功能将不可用。')) {
            await chrome.runtime.sendMessage({
                action: 'setDeepLApiKey',
                apiKey: ''
            });
            showToast('🗑️ DeepL API 密钥已清除');
            loadCurrentStatus();
        }
    });

    // ==================== Merriam-Webster API ====================

    // MW 保存按钮
    saveMWBtn.addEventListener('click', async () => {
        const apiKey = mwApiKeyInput.value.trim();

        if (!apiKey) {
            showMWStatus('请输入 API 密钥', 'warning');
            return;
        }

        saveMWBtn.textContent = '保存中...';
        saveMWBtn.disabled = true;

        try {
            // 测试 API 密钥是否有效
            const testResult = await testMWApiKey(apiKey);

            if (testResult.success) {
                // 保存密钥
                await chrome.runtime.sendMessage({
                    action: 'setMWApiKey',
                    apiKey: apiKey
                });

                showToast('✅ Merriam-Webster API 密钥已保存并验证通过');
                mwApiKeyInput.value = '';
                loadMWStatus();
            } else {
                showMWStatus('API 密钥验证失败: ' + testResult.error, 'warning');
            }
        } catch (error) {
            showMWStatus('保存失败: ' + error.message, 'warning');
        } finally {
            saveMWBtn.textContent = '保存密钥';
            saveMWBtn.disabled = false;
        }
    });

    // MW 清除按钮
    clearMWBtn.addEventListener('click', async () => {
        if (confirm('确定要清除 Merriam-Webster API 密钥吗？清除后词典功能将不可用。')) {
            await chrome.runtime.sendMessage({
                action: 'setMWApiKey',
                apiKey: ''
            });
            showToast('🗑️ Merriam-Webster API 密钥已清除');
            loadMWStatus();
        }
    });

    // ==================== 状态加载 ====================

    // 加载 DeepL 当前状态
    async function loadCurrentStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getTranslationEngine' });

            if (response.success) {
                if (response.engine === 'DeepL') {
                    currentEngine.innerHTML = `
            <span class="engine-badge deepl">
              ✨ DeepL（高质量翻译）
            </span>
          `;
                    showStatus('DeepL API 已配置，享受高质量翻译！', 'success');
                } else {
                    currentEngine.innerHTML = `
            <span class="engine-badge google">
              ⚠️ 未配置（翻译不可用）
            </span>
          `;
                    showStatus('请配置 DeepL API 密钥以启用翻译功能', 'warning');
                }
            }
        } catch (error) {
            console.error('加载状态失败:', error);
        }
    }

    // 加载 MW 当前状态
    async function loadMWStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getMWApiKey' });

            if (response.success) {
                if (response.apiKey) {
                    showMWStatus('✅ Merriam-Webster API 已配置，词典功能可用', 'success');
                } else {
                    showMWStatus('⚠️ 请配置 Merriam-Webster API 密钥以使用词典功能', 'warning');
                }
            }
        } catch (error) {
            console.error('加载 MW 状态失败:', error);
        }
    }

    // ==================== API 测试 ====================

    // 测试 DeepL API 密钥
    async function testDeepLApiKey(apiKey) {
        try {
            const response = await fetch('https://api-free.deepl.com/v2/usage', {
                headers: {
                    'Authorization': `DeepL-Auth-Key ${apiKey}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('DeepL 使用量:', data);
                return { success: true, data };
            } else {
                const error = await response.text();
                return { success: false, error: `HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 测试 Merriam-Webster API 密钥
    async function testMWApiKey(apiKey) {
        try {
            // 用一个简单的单词测试
            const response = await fetch(`https://www.dictionaryapi.com/api/v3/references/learners/json/test?key=${apiKey}`);

            if (response.ok) {
                const data = await response.json();
                // 检查返回的是否是有效的词条数据
                if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
                    return { success: true };
                } else {
                    return { success: false, error: '返回数据格式异常' };
                }
            } else if (response.status === 403) {
                return { success: false, error: 'API Key 无效' };
            } else {
                return { success: false, error: `HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== UI 辅助 ====================

    // 显示 DeepL 状态消息
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
    }

    // 显示 MW 状态消息
    function showMWStatus(message, type) {
        mwStatusMessage.textContent = message;
        mwStatusMessage.className = `status ${type}`;
    }

    // 显示 Toast 提示
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});
