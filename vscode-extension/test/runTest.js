// Custom minimal test entry to validate translation service with mocked HTTP.
const assert = require('assert');
const { translateText, __testing } = require('../src/translationService');

async function run() {
    const calls = [];
    __testing.setHttpClient(async (config) => {
        calls.push(config);
        return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                translations: [{ text: '你好' }]
            })
        };
    });

    process.env.DEEPL_API_KEY = 'test-key';

    const result = await translateText('hello');
    assert.strictEqual(result, '你好');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].headers['Authorization'] || calls[0].headers['authorization'], 'DeepL-Auth-Key test-key');

    __testing.resetHttpClient();
    console.log('All tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
