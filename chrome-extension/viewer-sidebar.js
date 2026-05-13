import { createViewerUrlForDocument } from './viewer-routing.js';
import {
    createDocumentEntry,
    getDirectoryLabel,
    getDirectoryUrl,
    getParentDirectoryUrl,
    normalizeUrl,
    parseDirectoryItems,
    shouldFallbackToCurrentDocument
} from './viewer-sidebar-helpers.js';

const ROOT_SIDEBAR_OPEN_CLASS = 'viewer-sidebar-open';

async function loadDirectoryDocuments(currentUrl, targetDirectoryUrl = getDirectoryUrl(currentUrl)) {
    const directoryUrl = normalizeUrl(targetDirectoryUrl);
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
        documents: parseDirectoryItems(directoryUrl, html, currentUrl)
    };
}

function appendEmptyState(container, message) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = message;
    container.appendChild(empty);
}

function renderEmptyState(container, message) {
    container.innerHTML = '';
    appendEmptyState(container, message);
}

function renderDirectoryNavigation(container, {
    activeDirectoryUrl,
    currentDirectoryUrl,
    onDirectoryChange
}) {
    const parentDirectoryUrl = getParentDirectoryUrl(activeDirectoryUrl);
    const isCurrentDirectory = normalizeUrl(activeDirectoryUrl) === normalizeUrl(currentDirectoryUrl);
    if (!parentDirectoryUrl && isCurrentDirectory) return;

    const nav = document.createElement('div');
    nav.className = 'folder-nav';

    if (parentDirectoryUrl) {
        const parentButton = document.createElement('button');
        parentButton.type = 'button';
        parentButton.className = 'folder-nav-button';
        parentButton.dataset.directoryAction = 'parent';
        parentButton.textContent = 'Parent';
        parentButton.title = parentDirectoryUrl;
        parentButton.addEventListener('click', () => onDirectoryChange(parentDirectoryUrl));
        nav.appendChild(parentButton);
    }

    if (!isCurrentDirectory) {
        const currentButton = document.createElement('button');
        currentButton.type = 'button';
        currentButton.className = 'folder-nav-button';
        currentButton.dataset.directoryAction = 'current';
        currentButton.textContent = 'Current';
        currentButton.title = currentDirectoryUrl;
        currentButton.addEventListener('click', () => onDirectoryChange(currentDirectoryUrl));
        nav.appendChild(currentButton);
    }

    container.appendChild(nav);
}

function renderDocumentList(container, documents, currentUrl, {
    activeDirectoryUrl = getDirectoryUrl(currentUrl),
    currentDirectoryUrl = getDirectoryUrl(currentUrl),
    onDirectoryChange = () => {},
    getViewerStateParams = () => ({}),
    sidebar = null,
    emptyMessage = 'No PDF or Markdown files found in this folder.'
} = {}) {
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
    container.innerHTML = '';
    renderDirectoryNavigation(container, {
        activeDirectoryUrl,
        currentDirectoryUrl,
        onDirectoryChange
    });

    if (!documents.length) {
        appendEmptyState(container, emptyMessage);
        return;
    }

    documents.forEach(documentEntry => {
        const link = document.createElement('a');
        const isDirectory = documentEntry.type === 'directory';
        const isCurrent = !isDirectory && documentEntry.url === normalizedCurrentUrl;
        const fileMain = document.createElement('div');
        const fileName = document.createElement('span');
        const fileBadge = document.createElement('span');

        link.className = 'file-item';
        if (isDirectory) {
            link.classList.add('folder-item');
        }
        if (isCurrent) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        }

        const updateHref = () => {
            const stateParams = {
                ...getViewerStateParams()
            };
            if (sidebar?.classList?.contains('open')) {
                stateParams.sidebar = 'open';
            }
            link.href = createViewerUrlForDocument(
                documentEntry.url,
                value => chrome.runtime.getURL(value),
                stateParams
            );
        };

        if (isDirectory) {
            link.href = '#';
        } else {
            updateHref();
        }
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
        } else if (isDirectory) {
            link.addEventListener('click', event => {
                event.preventDefault();
                onDirectoryChange(documentEntry.url);
            });
        } else {
            link.addEventListener('click', updateHref);
        }

        container.appendChild(link);
    });
}

function renderCurrentDocumentFallback(container, currentUrl, options = {}) {
    const currentEntry = createDocumentEntry(currentUrl);
    if (!currentEntry) {
        renderEmptyState(container, 'Only the current file is available.');
        return;
    }

    renderDocumentList(container, [currentEntry], currentUrl, options);
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
    defaultPanel = 'files',
    getViewerStateParams = () => ({})
}) {
    const tabButtons = Array.from(sidebar.querySelectorAll('[data-sidebar-panel]'));
    const panels = Array.from(sidebar.querySelectorAll('.sidebar-panel'));
    const currentDirectoryUrl = normalizeUrl(getDirectoryUrl(currentUrl));
    let activeDirectoryUrl = currentDirectoryUrl;
    let loadRequestId = 0;

    const setSidebarOpen = (isOpen) => {
        sidebar.classList.toggle('open', isOpen);
        viewerContainer.classList.toggle('sidebar-open', isOpen);
        document.documentElement.classList.toggle(ROOT_SIDEBAR_OPEN_CLASS, isOpen);
    };

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
        setSidebarOpen(!sidebar.classList.contains('open'));
    });

    if (new URLSearchParams(window.location.search).get('sidebar') === 'open') {
        setSidebarOpen(true);
    }

    setActivePanel(defaultPanel);

    const openDirectory = (targetDirectoryUrl) => {
        const requestId = ++loadRequestId;
        activeDirectoryUrl = normalizeUrl(targetDirectoryUrl || currentDirectoryUrl);
        renderEmptyState(fileBrowserContainer, 'Loading sibling documents...');

        loadDirectoryDocuments(currentUrl, activeDirectoryUrl).then(({ directoryUrl, directoryLabel, documents }) => {
            if (requestId !== loadRequestId) return;
            activeDirectoryUrl = directoryUrl;
            if (sidebarFolderName) {
                sidebarFolderName.textContent = directoryLabel;
                sidebarFolderName.title = directoryUrl;
            }
            renderDocumentList(fileBrowserContainer, documents, currentUrl, {
                activeDirectoryUrl,
                currentDirectoryUrl,
                onDirectoryChange: openDirectory,
                getViewerStateParams,
                sidebar
            });
        }).catch(error => {
            if (requestId !== loadRequestId) return;

            if (
                shouldFallbackToCurrentDocument(error) &&
                normalizeUrl(activeDirectoryUrl) === normalizeUrl(currentDirectoryUrl)
            ) {
                if (sidebarFolderName) {
                    sidebarFolderName.textContent = getDirectoryLabel(currentDirectoryUrl);
                    sidebarFolderName.title = currentDirectoryUrl;
                }
                renderCurrentDocumentFallback(fileBrowserContainer, currentUrl, {
                    activeDirectoryUrl,
                    currentDirectoryUrl,
                    onDirectoryChange: openDirectory,
                    getViewerStateParams,
                    sidebar
                });
                return;
            }

            console.error('Failed to load sibling documents:', error);
            if (sidebarFolderName) {
                sidebarFolderName.textContent = activeDirectoryUrl ? getDirectoryLabel(activeDirectoryUrl) : 'Current Folder';
                sidebarFolderName.title = activeDirectoryUrl || '';
            }
            renderDocumentList(fileBrowserContainer, [], currentUrl, {
                activeDirectoryUrl,
                currentDirectoryUrl,
                onDirectoryChange: openDirectory,
                getViewerStateParams,
                sidebar,
                emptyMessage: getLoadErrorMessage(currentUrl, error)
            });
        });
    };

    openDirectory(currentDirectoryUrl);
}
