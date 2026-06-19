import test from 'node:test';
import assert from 'node:assert/strict';

import {
    setViewerLoading,
    showViewerError
} from '../chrome-extension/viewer-ui.js';
import {
    setupDom,
    teardownDom
} from './helpers/dom-test-utils.js';

let dom;

test.beforeEach(() => {
    dom = setupDom('<!doctype html><html><body><main id="container"><section id="content"></section></main></body></html>');
});

test.afterEach(() => {
    teardownDom(dom);
});

test('setViewerLoading creates one overlay and removes it cleanly', () => {
    const container = document.getElementById('container');

    setViewerLoading(container, true, 'Loading PDF...');
    setViewerLoading(container, true, 'Loading Markdown...');

    const overlays = container.querySelectorAll('.loading-overlay');
    assert.equal(overlays.length, 1);
    assert.equal(overlays[0].querySelector('.loading-text').textContent, 'Loading Markdown...');

    setViewerLoading(container, false);
    assert.equal(container.querySelector('.loading-overlay'), null);
});

test('showViewerError removes loading, escapes the message, and wires retry', () => {
    const container = document.getElementById('container');
    const content = document.getElementById('content');
    let retryCalls = 0;

    setViewerLoading(container, true, 'Loading...');
    showViewerError({
        loadingContainer: container,
        contentContainer: content,
        message: '<script>alert(1)</script>',
        onRetry: () => {
            retryCalls += 1;
        }
    });

    assert.equal(container.querySelector('.loading-overlay'), null);
    assert.equal(content.querySelector('.error-message').textContent, '<script>alert(1)</script>');
    assert.equal(content.innerHTML.includes('<script>'), false);

    content.querySelector('.error-retry-btn').click();
    assert.equal(retryCalls, 1);
});
