import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDocumentEntry,
    getParentDirectoryUrl,
    parseDirectoryDocuments,
    parseDirectoryItems,
    shouldFallbackToCurrentDocument
} from '../chrome-extension/viewer-sidebar-helpers.js';
import { setupDom, teardownDom } from './helpers/dom-test-utils.js';

test('parseDirectoryDocuments extracts same-directory documents without reordering the listing', () => {
    const dom = setupDom();

    try {
        const directoryUrl = 'https://example.com/docs/';
        const currentUrl = 'https://example.com/docs/current.pdf';
        const html = `
            <html><body>
                <a href="other.pdf">Other PDF</a>
                <a href="guide.md">Guide</a>
                <a href="current.pdf">Current</a>
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
                'https://example.com/docs/other.pdf',
                'https://example.com/docs/guide.md',
                'https://example.com/docs/current.pdf'
            ]
        );
    } finally {
        teardownDom(dom);
    }
});

test('parseDirectoryItems extracts child folders and documents in listing order', () => {
    const dom = setupDom();

    try {
        const directoryUrl = 'https://example.com/docs/';
        const currentUrl = 'https://example.com/docs/current.pdf';
        const html = `
            <html><body>
                <a href="topic-a/">Topic A</a>
                <a href="overview.md">Overview</a>
                <a href="topic-b/">Topic B</a>
                <a href="../">Parent</a>
            </body></html>
        `;

        const items = parseDirectoryItems(directoryUrl, html, currentUrl, {
            DOMParserCtor: dom.window.DOMParser,
            nodeFilter: dom.window.NodeFilter
        });

        assert.deepEqual(
            items.map(item => [item.type, item.name, item.url]),
            [
                ['directory', 'topic-a', 'https://example.com/docs/topic-a/'],
                ['document', 'overview.md', 'https://example.com/docs/overview.md'],
                ['directory', 'topic-b', 'https://example.com/docs/topic-b/']
            ]
        );
    } finally {
        teardownDom(dom);
    }
});

test('parseDirectoryItems extracts Chrome file directory addRow folders', () => {
    const dom = setupDom();

    try {
        const directoryUrl = 'file:///Users/zhaozeyi/Documents/PTE/';
        const currentUrl = 'file:///Users/zhaozeyi/Documents/PTE/current.md';
        const html = `
            <html><body><table>
                <script>addRow("..", "../", 1, 0, "", "", "");</script>
                <script>addRow("topic-a", "topic-a", 1, 0, "", "", "");</script>
                <script>addRow("overview.md", "overview.md", 0, 100, "100 B", "", "");</script>
                <script>addRow("topic-b/", "topic-b/", 1, 0, "", "", "");</script>
            </table></body></html>
        `;

        const items = parseDirectoryItems(directoryUrl, html, currentUrl, {
            DOMParserCtor: dom.window.DOMParser,
            nodeFilter: dom.window.NodeFilter
        });

        assert.deepEqual(
            items.map(item => [item.type, item.name, item.url]),
            [
                ['directory', 'topic-a', 'file:///Users/zhaozeyi/Documents/PTE/topic-a/'],
                ['document', 'overview.md', 'file:///Users/zhaozeyi/Documents/PTE/overview.md'],
                ['directory', 'topic-b', 'file:///Users/zhaozeyi/Documents/PTE/topic-b/']
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

test('getParentDirectoryUrl returns one directory above non-root directories', () => {
    assert.equal(getParentDirectoryUrl('https://example.com/docs/week1/'), 'https://example.com/docs/');
    assert.equal(getParentDirectoryUrl('file:///Users/zhaozeyi/Documents/PTE/week1/'), 'file:///Users/zhaozeyi/Documents/PTE/');
    assert.equal(getParentDirectoryUrl('https://example.com/'), '');
    assert.equal(getParentDirectoryUrl('file:///'), '');
});

test('parseDirectoryDocuments does not inject current child document into a parent directory listing', () => {
    const dom = setupDom();

    try {
        const directoryUrl = 'https://example.com/docs/';
        const currentUrl = 'https://example.com/docs/week1/current.pdf';
        const html = `
            <html><body>
                <a href="overview.md">Overview</a>
            </body></html>
        `;

        const documents = parseDirectoryDocuments(directoryUrl, html, currentUrl, {
            DOMParserCtor: dom.window.DOMParser,
            nodeFilter: dom.window.NodeFilter
        });

        assert.deepEqual(
            documents.map(documentEntry => documentEntry.url),
            ['https://example.com/docs/overview.md']
        );
    } finally {
        teardownDom(dom);
    }
});

test('shouldFallbackToCurrentDocument only treats 401/403/404 as expected directory failures', () => {
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 401')), true);
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 403')), true);
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 404')), true);
    assert.equal(shouldFallbackToCurrentDocument(new Error('HTTP 500')), false);
    assert.equal(shouldFallbackToCurrentDocument(new Error('Network error')), false);
});
