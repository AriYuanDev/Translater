import { sendMessageSafe } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const REQUEST_TIMEOUT_MS = 15000;

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

    // DeepL elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const copyDeepLKeyBtn = document.getElementById('copyDeepLKeyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusMessage = document.getElementById('statusMessage');
    const currentEngine = document.getElementById('currentEngine');
    const toast = document.getElementById('toast');
    const translationStatusTitle = document.getElementById('translationStatusTitle');
    const translationStatusState = document.getElementById('translationStatusState');
    const translationStatusNote = document.getElementById('translationStatusNote');
    const dictionaryStatusTitle = document.getElementById('dictionaryStatusTitle');
    const dictionaryStatusState = document.getElementById('dictionaryStatusState');
    const dictionaryStatusNote = document.getElementById('dictionaryStatusNote');
    const quotaStatusTitle = document.getElementById('quotaStatusTitle');
    const quotaStatusState = document.getElementById('quotaStatusState');
    const quotaStatusNote = document.getElementById('quotaStatusNote');
    const clickTriggerToggle = document.getElementById('clickTriggerToggle');
    const deepLUsageStatus = document.getElementById('deepLUsageStatus');
    const refreshUsageBtn = document.getElementById('refreshUsageBtn');
    const translationCacheStatus = document.getElementById('translationCacheStatus');
    const clearTranslationCacheBtn = document.getElementById('clearTranslationCacheBtn');

    // Merriam-Webster elements
    const mwApiKeyInput = document.getElementById('mwApiKey');
    const saveMWBtn = document.getElementById('saveMWBtn');
    const copyMWKeyBtn = document.getElementById('copyMWKeyBtn');
    const clearMWBtn = document.getElementById('clearMWBtn');
    const mwStatusMessage = document.getElementById('mwStatusMessage');

    // Load current status
    loadCurrentStatus();
    loadMWStatus();
    loadTriggerMode();
    loadDeepLUsage();
    loadTranslationCacheStats();

    // ==================== DeepL API ====================

    // Save button
    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showStatus('Please enter an API Key', 'warning');
            return;
        }

        // Basic length check - actual validation is done via API test
        if (apiKey.length < 20) {
            showStatus('API key appears to be too short', 'warning');
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

                showToast('DeepL API key saved and verified');
                apiKeyInput.value = '';
                loadCurrentStatus();
                loadDeepLUsage();
            } else {
                showStatus('API key verification failed: ' + testResult.error, 'warning');
            }
        } catch (error) {
            showStatus('Save failed: ' + error.message, 'warning');
        } finally {
            saveBtn.textContent = 'Save key';
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
            showToast('DeepL API key cleared');
            loadCurrentStatus();
            loadDeepLUsage();
        }
    });

    copyDeepLKeyBtn.addEventListener('click', () => {
        copySavedApiKey({
            storageKey: 'deepLApiKey',
            label: 'DeepL',
            showInlineStatus: showStatus
        });
    });

    clickTriggerToggle.addEventListener('change', async () => {
        const mode = clickTriggerToggle.checked ? 'click' : 'hover';
        const response = await sendMessageSafe({
            action: 'setTranslationTriggerMode',
            mode
        });
        if (response && response.success) {
            showToast(mode === 'click' ? 'Click-to-translate enabled' : 'Hover-to-translate enabled');
        } else {
            showStatus((response && response.error) || 'Failed to save trigger mode', 'warning');
            clickTriggerToggle.checked = mode !== 'click';
        }
    });

    refreshUsageBtn.addEventListener('click', () => {
        loadDeepLUsage();
    });

    clearTranslationCacheBtn.addEventListener('click', async () => {
        if (!confirm('Clear stored translation cache? This may increase future DeepL usage.')) return;
        const response = await sendMessageSafe({ action: 'clearTranslationCache' });
        if (response && response.success) {
            showToast('Translation cache cleared');
            loadTranslationCacheStats();
        } else {
            showStatus((response && response.error) || 'Failed to clear translation cache', 'warning');
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

                showToast('Merriam-Webster API key saved and verified');
                mwApiKeyInput.value = '';
                loadMWStatus();
            } else {
                showMWStatus('API key verification failed: ' + testResult.error, 'warning');
            }
        } catch (error) {
            showMWStatus('Save failed: ' + error.message, 'warning');
        } finally {
            saveMWBtn.textContent = 'Save key';
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
            showToast('Merriam-Webster API key cleared');
            loadMWStatus();
        }
    });

    copyMWKeyBtn.addEventListener('click', () => {
        copySavedApiKey({
            storageKey: 'mwApiKey',
            label: 'Merriam-Webster',
            showInlineStatus: showMWStatus
        });
    });

    // ==================== Status Loading ====================

    function updateStatusCard({ titleEl, stateEl, noteEl, title, badge, tone, note }) {
        if (titleEl) titleEl.textContent = title;
        if (stateEl) {
            stateEl.textContent = badge;
            stateEl.className = `status-badge ${tone}`;
        }
        if (noteEl) noteEl.textContent = note;
    }

    async function loadCurrentStatus() {
        try {
            const response = await sendMessageSafe({ action: 'getTranslationEngine' });

            if (response.success && response.data && response.data.engine === 'DeepL') {
                currentEngine.textContent = 'DeepL';
                updateStatusCard({
                    titleEl: translationStatusTitle,
                    stateEl: translationStatusState,
                    noteEl: translationStatusNote,
                    title: 'DeepL ready',
                    badge: 'Ready',
                    tone: 'ready',
                    note: 'Selection translation and definition translation are enabled.'
                });
                showStatus('DeepL API configured. Translation is ready.', 'success');
                return;
            }

            currentEngine.textContent = 'Not configured';
            updateStatusCard({
                titleEl: translationStatusTitle,
                stateEl: translationStatusState,
                noteEl: translationStatusNote,
                title: 'DeepL missing',
                badge: 'Action needed',
                tone: 'warning',
                note: 'Add a DeepL API key to enable selected text translation.'
            });
            showStatus('Add a DeepL API key to enable translation.', 'warning');
        } catch (error) {
            console.error('Failed to load status:', error);
            updateStatusCard({
                titleEl: translationStatusTitle,
                stateEl: translationStatusState,
                noteEl: translationStatusNote,
                title: 'Status unavailable',
                badge: 'Unavailable',
                tone: 'neutral',
                note: 'Translation status could not be loaded.'
            });
        }
    }

    async function loadMWStatus() {
        try {
            const response = await sendMessageSafe({ action: 'getMWApiKey' });

            if (response.success && response.data && response.data.apiKey) {
                updateStatusCard({
                    titleEl: dictionaryStatusTitle,
                    stateEl: dictionaryStatusState,
                    noteEl: dictionaryStatusNote,
                    title: 'Dictionary ready',
                    badge: 'Ready',
                    tone: 'ready',
                    note: 'Word lookup, IPA, and dictionary audio are enabled.'
                });
                showMWStatus('Merriam-Webster API configured. Dictionary is ready.', 'success');
                return;
            }

            updateStatusCard({
                titleEl: dictionaryStatusTitle,
                stateEl: dictionaryStatusState,
                noteEl: dictionaryStatusNote,
                title: 'Dictionary missing',
                badge: 'Action needed',
                tone: 'warning',
                note: 'Add a Learners Dictionary API key to enable dictionary lookup.'
            });
            showMWStatus('Add a Merriam-Webster API key to enable dictionary features.', 'warning');
        } catch (error) {
            console.error('Failed to load MW status:', error);
            updateStatusCard({
                titleEl: dictionaryStatusTitle,
                stateEl: dictionaryStatusState,
                noteEl: dictionaryStatusNote,
                title: 'Status unavailable',
                badge: 'Unavailable',
                tone: 'neutral',
                note: 'Dictionary status could not be loaded.'
            });
        }
    }

    async function loadTriggerMode() {
        try {
            const response = await sendMessageSafe({ action: 'getTranslationTriggerMode' });
            const mode = response && response.success && response.data ? response.data.mode : 'click';
            clickTriggerToggle.checked = mode !== 'hover';
        } catch (error) {
            console.error('Failed to load trigger mode:', error);
            clickTriggerToggle.checked = true;
        }
    }

    async function loadDeepLUsage() {
        deepLUsageStatus.textContent = 'Checking usage...';
        updateStatusCard({
            titleEl: quotaStatusTitle,
            stateEl: quotaStatusState,
            noteEl: quotaStatusNote,
            title: 'Checking usage',
            badge: 'Loading',
            tone: 'neutral',
            note: 'DeepL quota is being checked.'
        });

        try {
            const response = await sendMessageSafe({ action: 'getDeepLUsage' });
            if (!response || !response.success || !response.data) {
                const message = (response && response.error) || 'DeepL usage unavailable.';
                deepLUsageStatus.textContent = message;
                updateStatusCard({
                    titleEl: quotaStatusTitle,
                    stateEl: quotaStatusState,
                    noteEl: quotaStatusNote,
                    title: 'Usage unavailable',
                    badge: 'Unavailable',
                    tone: 'neutral',
                    note: message
                });
                return;
            }

            const { character_count, character_limit, remaining, quotaState } = response.data;
            if (Number.isFinite(character_count) && Number.isFinite(character_limit)) {
                const safeRemaining = Number.isFinite(remaining)
                    ? remaining
                    : Math.max(0, character_limit - character_count);
                const usageText = `${character_count} / ${character_limit} chars used. ${safeRemaining} remaining.`;
                const stateText = quotaState || 'ok';

                deepLUsageStatus.textContent = `${usageText} Quota state: ${stateText}.`;
                updateStatusCard({
                    titleEl: quotaStatusTitle,
                    stateEl: quotaStatusState,
                    noteEl: quotaStatusNote,
                    title: `${safeRemaining} chars left`,
                    badge: stateText === 'ok' ? 'Healthy' : stateText,
                    tone: stateText === 'ok' ? 'ready' : 'warning',
                    note: usageText
                });
            } else {
                deepLUsageStatus.textContent = 'Usage returned without character counts.';
                updateStatusCard({
                    titleEl: quotaStatusTitle,
                    stateEl: quotaStatusState,
                    noteEl: quotaStatusNote,
                    title: 'Usage loaded',
                    badge: 'Partial',
                    tone: 'info',
                    note: 'DeepL did not return character counts.'
                });
            }
        } catch (error) {
            const message = error.message || 'DeepL usage unavailable.';
            deepLUsageStatus.textContent = message;
            updateStatusCard({
                titleEl: quotaStatusTitle,
                stateEl: quotaStatusState,
                noteEl: quotaStatusNote,
                title: 'Usage unavailable',
                badge: 'Unavailable',
                tone: 'neutral',
                note: message
            });
        }
    }

    async function loadTranslationCacheStats() {
        try {
            const response = await sendMessageSafe({ action: 'getTranslationCacheStats' });
            if (response && response.success && response.data) {
                translationCacheStatus.textContent = `${response.data.entries} / ${response.data.maxEntries} cached translations. TTL: ${response.data.ttlDays} days.`;
            } else {
                translationCacheStatus.textContent = (response && response.error) || 'Cache status unavailable.';
            }
        } catch (error) {
            translationCacheStatus.textContent = error.message || 'Cache status unavailable.';
        }
    }

    // ==================== API Testing ====================

    // Test DeepL API Key
    async function testDeepLApiKey(apiKey) {
        const isPro = !apiKey.endsWith(':fx');
        const baseUrl = isPro ? 'https://api.deepl.com/v2/usage' : 'https://api-free.deepl.com/v2/usage';

        try {
            const response = await fetchWithTimeout(baseUrl, {
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
            const response = await fetchWithTimeout(`https://www.dictionaryapi.com/api/v3/references/learners/json/test?key=${apiKey}`);

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

    async function copySavedApiKey({ storageKey, label, showInlineStatus }) {
        try {
            const result = await chrome.storage.sync.get([storageKey]);
            const apiKey = (result[storageKey] || '').trim();

            if (!apiKey) {
                showInlineStatus(`No saved ${label} API key to copy`, 'warning');
                return;
            }

            if (!navigator.clipboard || !navigator.clipboard.writeText) {
                showInlineStatus('Clipboard is unavailable in this browser context', 'warning');
                return;
            }

            await navigator.clipboard.writeText(apiKey);
            showToast(`${label} API key copied`);
        } catch (error) {
            showInlineStatus('Copy failed: ' + error.message, 'warning');
        }
    }

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
