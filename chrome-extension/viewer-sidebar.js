import { createViewerUrlForDocument } from './viewer-routing.js';
import {
    createDocumentEntry,
    getDirectoryLabel,
    getDirectoryUrl,
    normalizeUrl,
    parseDirectoryDocuments,
    shouldFallbackToCurrentDocument
} from './viewer-sidebar-helpers.js';

async function loadSiblingDocuments(currentUrl) {
    const directoryUrl = getDirectoryUrl(currentUrl);
    if (!directoryUrl) {
        throw new Error('Unable to resolve parent directory');
    }

    const response = await fetch(directoryUrl);
    const isReadableFileResponse = directoryUrl.startsWith('file://') && response.status === 0;
    if (!response.ok && !isReadableFileResponse) {
        throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return {
        directoryUrl,
        directoryLabel: getDirectoryLabel(directoryUrl),
        documents: parseDirectoryDocuments(directoryUrl, html, currentUrl)
    };
}

function renderEmptyState(container, message) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = message;
    container.appendChild(empty);
}

function renderDocumentList(container, documents, currentUrl) {
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
    container.innerHTML = '';

    if (!documents.length) {
        renderEmptyState(container, 'No PDF or Markdown files found in this folder.');
        return;
    }

    documents.forEach(documentEntry => {
        const link = document.createElement('a');
        const isCurrent = documentEntry.url === normalizedCurrentUrl;
        const fileMain = document.createElement('div');
        const fileName = document.createElement('span');
        const fileBadge = document.createElement('span');

        link.className = 'file-item';
        if (isCurrent) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        }

        link.href = createViewerUrlForDocument(documentEntry.url, value => chrome.runtime.getURL(value));
        link.target = '_self';
        link.title = documentEntry.name;

        fileMain.className = 'file-main';
        fileName.className = 'file-name';
        fileName.textContent = documentEntry.name;
        fileBadge.className = 'file-badge';
        fileBadge.textContent = documentEntry.label;

        fileMain.appendChild(fileName);
        fileMain.appendChild(fileBadge);
        link.appendChild(fileMain);

        if (isCurrent) {
            link.addEventListener('click', event => {
                event.preventDefault();
            });
        }

        container.appendChild(link);
    });
}

function renderCurrentDocumentFallback(container, currentUrl) {
    const currentEntry = createDocumentEntry(currentUrl);
    if (!currentEntry) {
        renderEmptyState(container, 'Only the current file is available.');
        return;
    }

    renderDocumentList(container, [currentEntry], currentUrl);
}

function getLoadErrorMessage(currentUrl, error) {
    if (String(currentUrl || '').startsWith('file://')) {
        return 'Unable to read this folder. Enable “Allow access to file URLs” for the extension first.';
    }

    if (error?.message?.startsWith('HTTP')) {
        return 'This site does not expose a browsable directory listing for sibling documents.';
    }

    return 'Unable to load sibling documents for this file.';
}

export function setupViewerSidebar({
    currentUrl,
    sidebar,
    viewerContainer,
    sidebarToggle,
    fileBrowserContainer,
    sidebarFolderName,
    defaultPanel = 'files'
}) {
    const tabButtons = Array.from(sidebar.querySelectorAll('[data-sidebar-panel]'));
    const panels = Array.from(sidebar.querySelectorAll('.sidebar-panel'));

    const setActivePanel = (panelName) => {
        tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.sidebarPanel === panelName);
        });
        panels.forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === panelName);
        });
    };

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            setActivePanel(button.dataset.sidebarPanel || defaultPanel);
        });
    });

    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        viewerContainer.classList.toggle('sidebar-open');
    });

    setActivePanel(defaultPanel);
    renderEmptyState(fileBrowserContainer, 'Loading sibling documents...');

    loadSiblingDocuments(currentUrl).then(({ directoryUrl, directoryLabel, documents }) => {
        if (sidebarFolderName) {
            sidebarFolderName.textContent = directoryLabel;
            sidebarFolderName.title = directoryUrl;
        }
        renderDocumentList(fileBrowserContainer, documents, currentUrl);
    }).catch(error => {
        if (shouldFallbackToCurrentDocument(error)) {
            if (sidebarFolderName) {
                const directoryUrl = getDirectoryUrl(currentUrl);
                sidebarFolderName.textContent = getDirectoryLabel(directoryUrl);
                sidebarFolderName.title = directoryUrl;
            }
            renderCurrentDocumentFallback(fileBrowserContainer, currentUrl);
            return;
        }

        console.error('Failed to load sibling documents:', error);
        if (sidebarFolderName) {
            sidebarFolderName.textContent = 'Current Folder';
            sidebarFolderName.title = '';
        }
        renderEmptyState(fileBrowserContainer, getLoadErrorMessage(currentUrl, error));
    });
}
