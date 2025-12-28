// 快译 - 设置页面脚本

document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusMessage = document.getElementById('statusMessage');
    const currentEngine = document.getElementById('currentEngine');
    const toast = document.getElementById('toast');

    // 加载当前状态
    loadCurrentStatus();

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
            const testResult = await testApiKey(apiKey);

            if (testResult.success) {
                // 保存密钥
                await chrome.runtime.sendMessage({
                    action: 'setDeepLApiKey',
                    apiKey: apiKey
                });

                showToast('✅ API 密钥已保存并验证通过');
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
        if (confirm('确定要清除 DeepL API 密钥吗？清除后将使用 Google 翻译。')) {
            await chrome.runtime.sendMessage({
                action: 'setDeepLApiKey',
                apiKey: ''
            });
            showToast('🗑️ API 密钥已清除');
            loadCurrentStatus();
        }
    });

    // 加载当前状态
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
              🔄 Google 翻译（基础版）
            </span>
          `;
                    showStatus('配置 DeepL API 密钥以获得更好的翻译质量', 'info');
                }
            }
        } catch (error) {
            console.error('加载状态失败:', error);
        }
    }

    // 测试 API 密钥
    async function testApiKey(apiKey) {
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

    // 显示状态消息
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
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
