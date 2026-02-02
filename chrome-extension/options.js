import { sendMessageSafe } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // DeepL elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusMessage = document.getElementById('statusMessage');
    const currentEngine = document.getElementById('currentEngine');
    const toast = document.getElementById('toast');

    // Merriam-Webster elements
    const mwApiKeyInput = document.getElementById('mwApiKey');
    const saveMWBtn = document.getElementById('saveMWBtn');
    const clearMWBtn = document.getElementById('clearMWBtn');
    const mwStatusMessage = document.getElementById('mwStatusMessage');

    // Load current status
    loadCurrentStatus();
    loadMWStatus();

    // ==================== DeepL API ====================

    // Save button
    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showStatus('Please enter an API Key', 'warning');
            return;
        }

        // Validate API Key format
        if (!apiKey.includes(':fx') && apiKey.length < 30) {
            showStatus('Incorrect API key format, please check again', 'warning');
            return;
        }

        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        try {
            // Test if API key is valid first
            const testResult = await testDeepLApiKey(apiKey);

            if (testResult.success) {
                // Save key
                await sendMessageSafe({
                    action: 'setDeepLApiKey',
                    apiKey: apiKey
                });

                showToast('✅ DeepL API key saved and verified');
                apiKeyInput.value = '';
                loadCurrentStatus();
            } else {
                showStatus('API key verification failed: ' + testResult.error, 'warning');
            }
        } catch (error) {
            showStatus('Save failed: ' + error.message, 'warning');
        } finally {
            saveBtn.textContent = 'Save Key';
            saveBtn.disabled = false;
        }
    });

    // Clear button
    clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear the DeepL API key? Translation will be disabled.')) {
            await sendMessageSafe({
                action: 'setDeepLApiKey',
                apiKey: ''
            });
            showToast('🗑️ DeepL API key cleared');
            loadCurrentStatus();
        }
    });

    // ==================== Merriam-Webster API ====================

    // MW Save button
    saveMWBtn.addEventListener('click', async () => {
        const apiKey = mwApiKeyInput.value.trim();

        if (!apiKey) {
            showMWStatus('Please enter an API Key', 'warning');
            return;
        }

        saveMWBtn.textContent = 'Saving...';
        saveMWBtn.disabled = true;

        try {
            // Test if API key is valid
            const testResult = await testMWApiKey(apiKey);

            if (testResult.success) {
                // Save key
                await sendMessageSafe({
                    action: 'setMWApiKey',
                    apiKey: apiKey
                });

                showToast('✅ Merriam-Webster API key saved and verified');
                mwApiKeyInput.value = '';
                loadMWStatus();
            } else {
                showMWStatus('API key verification failed: ' + testResult.error, 'warning');
            }
        } catch (error) {
            showMWStatus('Save failed: ' + error.message, 'warning');
        } finally {
            saveMWBtn.textContent = 'Save Key';
            saveMWBtn.disabled = false;
        }
    });

    // MW Clear button
    clearMWBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear the Merriam-Webster API key? Dictionary features will be disabled.')) {
            await sendMessageSafe({
                action: 'setMWApiKey',
                apiKey: ''
            });
            showToast('🗑️ Merriam-Webster API key cleared');
            loadMWStatus();
        }
    });

    // ==================== Status Loading ====================

    // Load DeepL status
    async function loadCurrentStatus() {
        try {
            const response = await sendMessageSafe({ action: 'getTranslationEngine' });

            if (response.success && response.data) {
                if (response.data.engine === 'DeepL') {
                    currentEngine.innerHTML = `
            <span class="engine-badge deepl">
              ✨ DeepL (High Quality)
            </span>
          `;
                    showStatus('DeepL API configured. Enjoy high-quality translation!', 'success');
                } else {
                    currentEngine.innerHTML = `
            <span class="engine-badge google">
              ⚠️ Not configured (Translation disabled)
            </span>
          `;
                    showStatus('Please configure DeepL API key to enable translation.', 'warning');
                }
            }
        } catch (error) {
            console.error('Failed to load status:', error);
        }
    }

    // Load MW status
    async function loadMWStatus() {
        try {
            const response = await sendMessageSafe({ action: 'getMWApiKey' });

            if (response.success && response.data) {
                if (response.data.apiKey) {
                    showMWStatus('✅ Merriam-Webster API configured. Dictionary is ready.', 'success');
                } else {
                    showMWStatus('⚠️ Please configure Merriam-Webster API key to enable dictionary features.', 'warning');
                }
            }
        } catch (error) {
            console.error('Failed to load MW status:', error);
        }
    }

    // ==================== API Testing ====================

    // Test DeepL API Key
    async function testDeepLApiKey(apiKey) {
        const isPro = !apiKey.endsWith(':fx');
        const baseUrl = isPro ? 'https://api.deepl.com/v2/usage' : 'https://api-free.deepl.com/v2/usage';

        try {
            const response = await fetch(baseUrl, {
                headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}` }
            });

            const contentType = response.headers.get('content-type');
            if (response.ok && contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return { success: true, data };
            } else {
                const errorText = !response.ok ? `HTTP ${response.status}` : 'Invalid return format';
                return { success: false, error: errorText };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Test Merriam-Webster API Key
    async function testMWApiKey(apiKey) {
        try {
            // Test with a simple word
            const response = await fetch(`https://www.dictionaryapi.com/api/v3/references/learners/json/test?key=${apiKey}`);

            const contentType = response.headers.get('content-type');
            if (response.ok && contentType && contentType.includes('application/json')) {
                const data = await response.json();
                // Check if data is valid entry mapping
                if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
                    return { success: true };
                } else {
                    return { success: false, error: 'Abnormal data format returned' };
                }
            } else if (response.status === 403) {
                return { success: false, error: 'Invalid API Key' };
            } else {
                return { success: false, error: `HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== UI Helpers ====================

    // Show DeepL status message
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
    }

    // Show MW status message
    function showMWStatus(message, type) {
        mwStatusMessage.textContent = message;
        mwStatusMessage.className = `status ${type}`;
    }

    // Show Toast notification
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});
