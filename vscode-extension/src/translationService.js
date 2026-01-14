const vscode = require('vscode');
const https = require('https');
const { URLSearchParams } = require('url');

function getConfiguration(key) {
    return vscode.workspace.getConfiguration('translater').get(key) || '';
}

// Robust fetch wrapper with Redirect handling and safe timeout
function fetchJson(url, options = {}, retries = 1) {
    return new Promise((resolve, reject) => {
        let isResolved = false;

        const req = https.request(url, options, (res) => {
            // Handle Redirects (301, 302, 307, 308)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (retries > 0) {
                    const redirectUrl = new URL(res.headers.location, url).toString();
                    return resolve(fetchJson(redirectUrl, options, retries - 1));
                }
                if (!isResolved) {
                    isResolved = true;
                    return reject(new Error('Too many redirects'));
                }
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (isResolved) return;
                isResolved = true;

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
            if (!isResolved) {
                isResolved = true;
                reject(new Error(`Network error: ${err.message}`));
            }
        });

        if (options.body) req.write(options.body);

        // Safe timeout with flag check
        req.setTimeout(10000, () => {
            if (!isResolved) {
                isResolved = true;
                req.destroy();
                reject(new Error('Request timed out'));
            }
        });

        req.end();
    });
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


module.exports = {
    translateText
};
