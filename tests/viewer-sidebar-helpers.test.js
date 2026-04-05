import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDocumentEntry,
    parseDirectoryDocuments,
    shouldFallbackToCurrentDocument
} from '../chrome-extension/viewer-sidebar-helpers.js';
import { setupDom, teardownDom } from './helpers/dom-test-utils.js';

test('parseDirectoryDocuments extracts same-directory documents and keeps current first', () => {
    const dom = setupDom();

    try {
        const directoryUrl = 'https://example.com/docs/';
        const currentUrl = 'https://example.com/docs/current.pdf';
        const html = `
            <html><body>
                <a href="other.pdf">Other PDF</a>
                <a href="guide.md">Guide</a>
                <a href="../outside.pdf">Outside</a>
            </body></html>
        `;

        const documents = parseDirectoryDocuments(directoryUrl, html, currentUrl, {
            DOMParserCtor: dom.window.DOMParser,
            nodeFilter: dom.window.NodeFilter
        });

        assert.deepEqual(
            documents.map(documentEntry => documentEntry.url),
            [
                'https://example.com/docs/current.pdf',
                'https://example.com/docs/guide.md',
                'https://example.com/docs/other.pdf'
            ]
        );
    } finally {
        teardownDom(dom);
    }
});

test('createDocumentEntry returns label and normalized URL for supported files', () => {
    assert.deepEqual(createDocumentEntry('https://example.com/docs/file.md'), {
        url: 'https://example.com/docs/file.md',
        name: 'file.md',
        label: 'Markdown'
    });
});

test('shouldFallbackToCurrentDocument only treats 401/403/404 as expected directory failures', () => {
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 401')), true);
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 403')), true);
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 404')), true);
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 500')), false);
    assert.equal(shouldFallbackToCurrentDocument(new Error('Network error')), false);
});
