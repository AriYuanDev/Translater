import test from 'node:test';
import assert from 'node:assert/strict';

import { setupViewerSidebar } from '../chrome-extension/viewer-sidebar.js';
import { setupDom, teardownDom, installChromeStub } from './helpers/dom-test-utils.js';

function flushPromises() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

let dom;

test.beforeEach(() => {
    dom = setupDom(`
        <!doctype html>
        <html>
            <body>
                <div id="sidebar" class="sidebar">
                    <button type="button" data-sidebar-panel="files">Files</button>
                    <button type="button" data-sidebar-panel="contents">Contents</button>
                    <div class="sidebar-panel" data-panel="files"></div>
                    <div class="sidebar-panel" data-panel="contents"></div>
                </div>
                <div id="viewerContainer"></div>
                <button id="sidebarToggle"></button>
                <div id="fileBrowserContainer"></div>
                <div id="sidebarFolderName"></div>
            </body>
        </html>
    `);
    installChromeStub();
});

test.afterEach(() => {
    delete globalThis.fetch;
    teardownDom(dom);
});

test('setupViewerSidebar falls back to the current document when directory listing returns 404', async () => {
    globalThis.fetch = async () => ({
        ok: false,
        status: 404,
        async text() {
            return '';
        }
    });

    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/current.pdf',
        sidebar: document.getElementById('sidebar'),
        viewerContainer: document.getElementById('viewerContainer'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    const fileBrowserContainer = document.getElementById('fileBrowserContainer');
    const folderName = document.getElementById('sidebarFolderName');
    const links = fileBrowserContainer.querySelectorAll('a.file-item');

    assert.equal(links.length, 1);
    assert.match(fileBrowserContainer.textContent, /current\.pdf/);
    assert.match(fileBrowserContainer.textContent, /PDF/);
    assert.equal(links[0].getAttribute('aria-current'), 'page');
    assert.equal(links[0].href, 'chrome-extension://test/pdfviewer.html?url=' + encodeURIComponent('https://example.com/docs/current.pdf'));
    assert.equal(folderName.textContent, 'docs');
    assert.equal(folderName.title, 'https://example.com/docs/');
});
