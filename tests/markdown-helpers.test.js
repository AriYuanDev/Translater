import test from 'node:test';
import assert from 'node:assert/strict';

import { rewriteRelativePaths, sanitizeMarkdownHtml } from '../chrome-extension/markdown-helpers.js';
import { setupDom, teardownDom } from './helpers/dom-test-utils.js';

test('sanitizeMarkdownHtml removes dangerous tags and attributes', () => {
    const dom = setupDom();

    try {
        const sanitized = sanitizeMarkdownHtml(
            '<div onclick="evil()"><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="ok.png" onerror="evil()"></div>',
            dom.window.document
        );

        assert.equal(sanitized.includes('<script'), false);
        assert.equal(sanitized.includes('onclick='), false);
        assert.equal(sanitized.includes('onerror='), false);
        assert.equal(sanitized.includes('javascript:'), false);
    } finally {
        teardownDom(dom);
    }
});

test('rewriteRelativePaths rewrites relative links and images in place', () => {
    const dom = setupDom();

    try {
        const container = dom.window.document.createElement('div');
        container.innerHTML = `
            <img src="./images/cover.png">
            <a id="doc" href="guide/intro.html">Doc</a>
            <a id="hash" href="#section">Section</a>
            <a id="mail" href="mailto:test@example.com">Mail</a>
        `;

        rewriteRelativePaths(container, 'https://example.com/docs/');

        assert.equal(
            container.querySelector('img').src,
            'https://example.com/docs/images/cover.png'
        );
        assert.equal(
            container.querySelector('#doc').href,
            'https://example.com/docs/guide/intro.html'
        );
        assert.equal(container.querySelector('#doc').target, '_blank');
        assert.equal(container.querySelector('#doc').rel, 'noopener noreferrer');
        assert.equal(container.querySelector('#hash').getAttribute('href'), '#section');
        assert.equal(container.querySelector('#mail').getAttribute('href'), 'mailto:test@example.com');
    } finally {
        teardownDom(dom);
    }
});
