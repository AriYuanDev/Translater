import test from 'node:test';
import assert from 'node:assert/strict';

import { resetCurrentTabBrowserZoom } from '../chrome-extension/viewer-browser-zoom.js';

test('resetCurrentTabBrowserZoom resets the current extension tab to browser zoom 100%', async () => {
    const calls = [];
    const chromeApi = {
        tabs: {
            async getCurrent() {
                calls.push(['getCurrent']);
                return { id: 42 };
            },
            async setZoom(tabId, zoomFactor) {
                calls.push(['setZoom', tabId, zoomFactor]);
            }
        }
    };

    await resetCurrentTabBrowserZoom(chromeApi);

    assert.deepEqual(calls, [
        ['getCurrent'],
        ['setZoom', 42, 1]
    ]);
});

test('resetCurrentTabBrowserZoom quietly ignores missing tabs API', async () => {
    await assert.doesNotReject(resetCurrentTabBrowserZoom({}));
});
