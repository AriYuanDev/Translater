const vscode = require('vscode');

function getConfiguration(key) {
    return vscode.workspace.getConfiguration('translater').get(key) || '';
}

async function fetchJson(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            // fetch automatically handles redirects by default
        });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw new Error(`Network error: ${error.message}`);
    }
}

async function translateText(text, targetLang = 'ZH') {
    const apiKey = getConfiguration('deepLApiKey');
    if (!apiKey) {
        throw new Error('请先配置 DeepL API Key');
    }
    return await translateWithDeepL(text, targetLang, apiKey);
}

async function translateWithDeepL(text, targetLang, apiKey) {
    const url = 'https://api-free.deepl.com/v2/translate';
    const postData = new URLSearchParams({
        text: text,
        target_lang: targetLang
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: postData.toString(),
            signal: controller.signal
        };

        const data = await fetchJson(url, options);
        clearTimeout(timeoutId);

        if (data.translations && data.translations.length > 0) {
            return data.translations[0].text;
        }
        throw new Error('DeepL format error');
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}


module.exports = {
    translateText
};
