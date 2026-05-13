import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { setupDom, teardownDom } from './helpers/dom-test-utils.js';

const scriptSource = readFileSync(new URL('../chrome-extension/viewer-initial-state.js', import.meta.url), 'utf8');

function runInitialStateScript(url) {
    const dom = setupDom('<!doctype html><html><body></body></html>', url);
    vm.runInThisContext(scriptSource);
    return dom;
}

test('viewer-initial-state marks the root before sidebar-open viewer layout renders', () => {
    const dom = runInitialStateScript('https://example.com/mdviewer.html?sidebar=open');

    assert.equal(document.documentElement.classList.contains('viewer-sidebar-open'), true);

    teardownDom(dom);
});

test('viewer-initial-state leaves the root untouched when sidebar is not open', () => {
    const dom = runInitialStateScript('https://example.com/mdviewer.html');

    assert.equal(document.documentElement.classList.contains('viewer-sidebar-open'), false);

    teardownDom(dom);
});
