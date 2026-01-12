const vscode = require('vscode');
const https = require('https');
const { URLSearchParams } = require('url');

function getConfiguration(key) {
    return vscode.workspace.getConfiguration('translater').get(key) || '';
}

// Robust fetch wrapper with Redirect handling
function fetchJson(url, options = {}, retries = 1) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            // Handle Redirects (301, 302, 307, 308)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (retries > 0) {
                    const redirectUrl = new URL(res.headers.location, url).toString();
                    return resolve(fetchJson(redirectUrl, options, retries - 1));
                }
                return reject(new Error('Too many redirects'));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`Network error: ${err.message}`));
        });

        if (options.body) req.write(options.body);

        // Slower timeout for reliability
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
    });
}

async function translateText(text, targetLang = 'ZH') {
    const apiKey = getConfiguration('deepLApiKey');
    if (apiKey) {
        try {
            return await translateWithDeepL(text, targetLang, apiKey);
        } catch (e) {
            console.warn('DeepL failed, falling back...');
        }
    }
    // Fallback or Google Translate (Note: standard Google Translate API requires key or paid sub, free endpoint has limits)
    // For this demo, we'll try the free endpoint used in background.js but be aware of rate limits.
    return await translateWithGoogle(text, targetLang);
}

async function translateWithDeepL(text, targetLang, apiKey) {
    const url = 'https://api-free.deepl.com/v2/translate';
    const postData = new URLSearchParams({
        text: text,
        target_lang: targetLang
    }).toString();

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `DeepL-Auth-Key ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        },
        body: postData
    };

    const data = await fetchJson(url, options);
    if (data.translations && data.translations.length > 0) {
        return data.translations[0].text;
    }
    throw new Error('DeepL format error');
}

async function translateWithGoogle(text, targetLang) {
    // Note: The 'gtx' client used in background.js is for browser use. 
    // In Node, we might need a different approach or just use the same URL.
    targetLang = targetLang === 'ZH' ? 'zh-CN' : targetLang;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    // Using simple GET
    const data = await fetchJson(url);
    // Google returns [[["translated_text",...]]]
    if (data && data[0]) {
        return data[0].map(item => item[0]).join('');
    }
    throw new Error('Google Translate failed');
}

module.exports = {
    translateText
};
