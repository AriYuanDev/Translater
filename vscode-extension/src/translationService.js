const https = require('https');

let vscodeApi = null;
try {
    // VS Code provides this module at runtime; tests may not.
    // eslint-disable-next-line global-require
    vscodeApi = require('vscode');
} catch {
    vscodeApi = null;
}

function getConfiguration(key) {
    if (vscodeApi?.workspace?.getConfiguration) {
        return vscodeApi.workspace.getConfiguration('translater').get(key) || '';
    }
    return '';
}

function resolveApiKey() {
    return getConfiguration('deepLApiKey') || process.env.DEEPL_API_KEY || '';
}

function defaultHttpClient({ url, method = 'GET', headers = {}, body = '', timeoutMs = 10000 }) {
    return new Promise((resolve, reject) => {
        const request = https.request(url, { method, headers }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode || 0,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString()
                });
            });
        });

        request.on('error', reject);
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error('Request timed out'));
        });

        if (body) {
            request.write(body);
        }

        request.end();
    });
}

let httpClient = defaultHttpClient;

function setHttpClient(client) {
    httpClient = client;
}

function resetHttpClient() {
    httpClient = defaultHttpClient;
}

async function translateText(text, targetLang = 'ZH') {
    const apiKey = resolveApiKey();
    if (!apiKey) {
        throw new Error('Please configure DeepL API Key first');
    }
    return translateWithDeepL(text, targetLang, apiKey);
}

async function translateWithDeepL(text, targetLang, apiKey) {
    const isPro = !apiKey.endsWith(':fx');
    const baseUrl = isPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';
    const body = new URLSearchParams({
        text,
        target_lang: targetLang
    }).toString();

    const response = await httpClient({
        url: baseUrl,
        method: 'POST',
        headers: {
            'Authorization': `DeepL-Auth-Key ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        timeoutMs: 10000
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`DeepL Translation Failed: HTTP ${response.status}`);
    }

    const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
    if (!contentType.includes('application/json')) {
        throw new Error('DeepL service returned invalid format');
    }

    let data;
    try {
        data = JSON.parse(response.body);
    } catch (error) {
        throw new Error('DeepL service returned invalid JSON');
    }

    if (data.translations && data.translations.length > 0) {
        return data.translations[0].text;
    }
    throw new Error('DeepL returned invalid data format');
}

module.exports = {
    translateText,
    __testing: {
        setHttpClient,
        resetHttpClient
    }
};
