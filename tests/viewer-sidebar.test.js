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

test('setupViewerSidebar appends fresh viewer state params to document links', async () => {
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
            return '<html><body><a href="next.md">Next</a></body></html>';
        }
    });

    let zoom = 150;
    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/current.pdf',
        sidebar: document.getElementById('sidebar'),
        viewerContainer: document.getElementById('viewerContainer'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName'),
        getViewerStateParams: () => ({ zoom })
    });

    await flushPromises();

    const nextLink = Array.from(document.querySelectorAll('a.file-item'))
        .find(link => link.textContent.includes('next.md'));
    assert.ok(nextLink);
    assert.equal(nextLink.href, 'chrome-extension://test/mdviewer.html?url=' + encodeURIComponent('https://example.com/docs/next.md') + '&zoom=150');

    zoom = 180;
    nextLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(nextLink.href, 'chrome-extension://test/mdviewer.html?url=' + encodeURIComponent('https://example.com/docs/next.md') + '&zoom=180');
});

test('setupViewerSidebar preserves open sidebar state in document links', async () => {
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
            return '<html><body><a href="next.md">Next</a></body></html>';
        }
    });

    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('open');

    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/current.pdf',
        sidebar,
        viewerContainer: document.getElementById('viewerContainer'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    const nextLink = Array.from(document.querySelectorAll('a.file-item'))
        .find(link => link.textContent.includes('next.md'));
    assert.ok(nextLink);
    assert.equal(nextLink.href, 'chrome-extension://test/mdviewer.html?url=' + encodeURIComponent('https://example.com/docs/next.md') + '&sidebar=open');
});

test('setupViewerSidebar restores open sidebar state from the viewer URL', async () => {
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
            return '<html><body><a href="next.md">Next</a></body></html>';
        }
    });
    window.history.pushState(null, '', 'https://example.com/viewer.html?sidebar=open');

    const sidebar = document.getElementById('sidebar');
    const viewerContainer = document.getElementById('viewerContainer');
    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/current.pdf',
        sidebar,
        viewerContainer,
        sidebarToggle: document.getElementById('sidebarToggle'),
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    assert.equal(sidebar.classList.contains('open'), true);
    assert.equal(viewerContainer.classList.contains('sidebar-open'), true);
});

test('setupViewerSidebar mirrors open sidebar state onto the document root', async () => {
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
            return '<html><body><a href="next.md">Next</a></body></html>';
        }
    });
    window.history.pushState(null, '', 'https://example.com/viewer.html?sidebar=open');

    const sidebar = document.getElementById('sidebar');
    const viewerContainer = document.getElementById('viewerContainer');
    const sidebarToggle = document.getElementById('sidebarToggle');
    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/current.pdf',
        sidebar,
        viewerContainer,
        sidebarToggle,
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    assert.equal(document.documentElement.classList.contains('viewer-sidebar-open'), true);

    sidebarToggle.click();
    assert.equal(sidebar.classList.contains('open'), false);
    assert.equal(viewerContainer.classList.contains('sidebar-open'), false);
    assert.equal(document.documentElement.classList.contains('viewer-sidebar-open'), false);

    sidebarToggle.click();
    assert.equal(sidebar.classList.contains('open'), true);
    assert.equal(viewerContainer.classList.contains('sidebar-open'), true);
    assert.equal(document.documentElement.classList.contains('viewer-sidebar-open'), true);
});

test('setupViewerSidebar removes sidebar URL state when the user closes the sidebar', async () => {
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
            return '<html><body><a href="next.md">Next</a></body></html>';
        }
    });
    window.history.pushState(null, '', 'https://example.com/viewer.html?url=current.md&sidebar=open&zoom=150');

    const sidebar = document.getElementById('sidebar');
    const viewerContainer = document.getElementById('viewerContainer');
    const sidebarToggle = document.getElementById('sidebarToggle');
    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/current.md',
        sidebar,
        viewerContainer,
        sidebarToggle,
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    assert.equal(sidebar.classList.contains('open'), true);

    sidebarToggle.click();

    const closedParams = new URLSearchParams(window.location.search);
    assert.equal(sidebar.classList.contains('open'), false);
    assert.equal(closedParams.get('sidebar'), null);
    assert.equal(closedParams.get('zoom'), '150');

    sidebarToggle.click();

    const reopenedParams = new URLSearchParams(window.location.search);
    assert.equal(sidebar.classList.contains('open'), true);
    assert.equal(reopenedParams.get('sidebar'), 'open');
    assert.equal(reopenedParams.get('zoom'), '150');
});

test('setupViewerSidebar can enter child folders from the file panel', async () => {
    const requests = [];
    globalThis.fetch = async (url) => {
        requests.push(url);
        return {
            ok: true,
            status: 200,
            async text() {
                if (url === 'https://example.com/docs/') {
                    return '<html><body><a href="topic-a/">Topic A</a><a href="overview.md">Overview</a></body></html>';
                }
                if (url === 'https://example.com/docs/topic-a/') {
                    return '<html><body><a href="lesson.md">Lesson</a></body></html>';
                }
                return '';
            }
        };
    };

    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/overview.md',
        sidebar: document.getElementById('sidebar'),
        viewerContainer: document.getElementById('viewerContainer'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    const folderLink = Array.from(document.querySelectorAll('.file-item'))
        .find(link => link.textContent.includes('topic-a'));
    assert.ok(folderLink);
    folderLink.click();
    await flushPromises();

    assert.deepEqual(requests, ['https://example.com/docs/', 'https://example.com/docs/topic-a/']);
    assert.equal(document.getElementById('sidebarFolderName').textContent, 'topic-a');
    assert.match(document.getElementById('fileBrowserContainer').textContent, /lesson\.md/);
});

test('setupViewerSidebar can load one parent directory from the file panel', async () => {
    const requests = [];
    globalThis.fetch = async (url) => {
        requests.push(url);
        return {
            ok: true,
            status: 200,
            async text() {
                if (url === 'https://example.com/docs/week1/') {
                    return '<html><body><a href="current.pdf">Current</a><a href="notes.md">Notes</a></body></html>';
                }
                if (url === 'https://example.com/docs/') {
                    return '<html><body><a href="overview.md">Overview</a></body></html>';
                }
                return '';
            }
        };
    };

    setupViewerSidebar({
        currentUrl: 'https://example.com/docs/week1/current.pdf',
        sidebar: document.getElementById('sidebar'),
        viewerContainer: document.getElementById('viewerContainer'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        fileBrowserContainer: document.getElementById('fileBrowserContainer'),
        sidebarFolderName: document.getElementById('sidebarFolderName')
    });

    await flushPromises();

    const parentButton = document.querySelector('[data-directory-action="parent"]');
    assert.ok(parentButton);
    parentButton.click();
    await flushPromises();

    assert.deepEqual(requests, ['https://example.com/docs/week1/', 'https://example.com/docs/']);
    assert.equal(document.getElementById('sidebarFolderName').textContent, 'docs');
    assert.match(document.getElementById('fileBrowserContainer').textContent, /overview\.md/);
    assert.doesNotMatch(document.getElementById('fileBrowserContainer').textContent, /current\.pdf/);
});
