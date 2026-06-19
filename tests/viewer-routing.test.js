import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createViewerPageUrl,
    createViewerUrlForDocument,
    getFilenameFromUrl,
    getViewerSourceUrl,
    hasViewerBypass,
    isFileUrl,
    isMdUrl,
    isPdfUrl
} from '../chrome-extension/viewer-routing.js';

test('isPdfUrl detects direct pdf URLs and embedded pdf segments', () => {
    assert.equal(isPdfUrl('https://example.com/files/report.pdf'), true);
    assert.equal(isPdfUrl('https://example.com/files/report.pdf?download=1'), true);
    assert.equal(isPdfUrl('https://example.com/files/report.pdf/download'), false);
    assert.equal(isPdfUrl('https://example.com/files/report.txt'), false);
});

test('isMdUrl detects markdown files', () => {
    assert.equal(isMdUrl('https://example.com/docs/readme.md'), true);
    assert.equal(isMdUrl('https://example.com/docs/readme.markdown'), true);
    assert.equal(isMdUrl('https://example.com/docs/readme.txt'), false);
});

test('hasViewerBypass detects search and hash bypass flags', () => {
    assert.equal(hasViewerBypass('https://example.com/report.pdf?translater_no_redirect=1'), true);
    assert.equal(hasViewerBypass('https://example.com/report.pdf#no_redirect'), true);
    assert.equal(hasViewerBypass('https://example.com/report.pdf'), false);
});

test('viewer URL helpers build encoded extension URLs', () => {
    const sourceUrl = 'https://example.com/files/report.pdf?download=1';
    const runtimeUrlResolver = path => `chrome-extension://test/${path}`;

    assert.equal(
        createViewerPageUrl('pdfviewer.html', sourceUrl, runtimeUrlResolver),
        'chrome-extension://test/pdfviewer.html?url=' + encodeURIComponent(sourceUrl)
    );
    assert.equal(
        createViewerUrlForDocument(sourceUrl, runtimeUrlResolver),
        'chrome-extension://test/pdfviewer.html?url=' + encodeURIComponent(sourceUrl)
    );
    assert.equal(
        createViewerUrlForDocument('https://example.com/docs/readme.md', runtimeUrlResolver),
        'chrome-extension://test/mdviewer.html?url=' + encodeURIComponent('https://example.com/docs/readme.md')
    );
});

test('viewer URL helpers preserve viewer state parameters after source URL', () => {
    const sourceUrl = 'https://example.com/files/report.pdf?download=1';
    const runtimeUrlResolver = path => `chrome-extension://test/${path}`;

    assert.equal(
        createViewerUrlForDocument(sourceUrl, runtimeUrlResolver, { zoom: 175 }),
        'chrome-extension://test/pdfviewer.html?url=' + encodeURIComponent(sourceUrl) + '&zoom=175'
    );
});

test('viewer source URL helper reads the encoded source document URL', () => {
    const sourceUrl = 'file:///Users/example/docs/readme.md';
    const search = '?url=' + encodeURIComponent(sourceUrl) + '&zoom=140';

    assert.equal(getViewerSourceUrl(search), sourceUrl);
    assert.equal(getViewerSourceUrl('?zoom=140'), null);
});

test('file URL and filename helpers handle viewer documents consistently', () => {
    assert.equal(isFileUrl('file:///Users/example/report.pdf'), true);
    assert.equal(isFileUrl('https://example.com/report.pdf'), false);

    assert.equal(getFilenameFromUrl('https://example.com/docs/Report%202026.pdf?download=1'), 'Report 2026.pdf');
    assert.equal(getFilenameFromUrl('not a url/path/README.md?raw=1'), 'README.md');
    assert.equal(getFilenameFromUrl(''), 'Untitled');
});
