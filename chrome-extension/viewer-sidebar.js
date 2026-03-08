const VIEWER_TYPES = {
    pdf: { label: 'PDF', viewerPage: 'pdfviewer.html' },
    md: { label: 'Markdown', viewerPage: 'mdviewer.html' },
    markdown: { label: 'Markdown', viewerPage: 'mdviewer.html' }
};

const DOCUMENT_NAME_REGEX = /[^<>:"/\\|?*\r\n\t]+?\.(?:pdf|md|markdown)\b/gi;

function normalizeUrl(url) {
    try {
        return new URL(url).toString();
    } catch {
        return url || '';
    }
}

function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value || '');
    } catch {
        return value || '';
    }
}

function getPathExtension(url) {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        const match = pathname.match(/\.([a-z0-9]+)$/);
        return match ? match[1] : '';
    } catch {
        const pathname = String(url || '').split('?')[0].toLowerCase();
        const match = pathname.match(/\.([a-z0-9]+)$/);
        return match ? match[1] : '';
    }
}

function getViewerType(url) {
    const extension = getPathExtension(url);
    return VIEWER_TYPES[extension] || null;
}

function isSupportedDocument(url) {
    return !!getViewerType(url);
}

function getDocumentName(url) {
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.split('/').pop();
        return safeDecodeURIComponent(filename || 'Untitled');
    } catch {
        const filename = String(url || '').split('/').pop()?.split('?')[0] || 'Untitled';
        return safeDecodeURIComponent(filename);
    }
}

function getDirectoryUrl(url) {
    try {
        return new URL('.', url).toString();
    } catch {
        if (!url || !url.includes('/')) return '';
        return url.slice(0, url.lastIndexOf('/') + 1);
    }
}

function getDirectoryLabel(directoryUrl) {
    try {
        const parsedUrl = new URL(directoryUrl);
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
            return safeDecodeURIComponent(segments[segments.length - 1]);
        }
        return parsedUrl.protocol === 'file:' ? '/' : (parsedUrl.host || 'Current Folder');
    } catch {
        return 'Current Folder';
    }
}

function createViewerUrl(url) {
    const viewerType = getViewerType(url);
    if (!viewerType) return url;
    return chrome.runtime.getURL(viewerType.viewerPage) + '?url=' + encodeURIComponent(url);
}

function createDocumentEntry(url) {
    const viewerType = getViewerType(url);
    if (!viewerType) return null;

    return {
        url: normalizeUrl(url),
        name: getDocumentName(url),
        label: viewerType.label
    };
}

function isSameDirectory(candidateUrl, directoryUrl) {
    return getDirectoryUrl(candidateUrl) === normalizeUrl(directoryUrl);
}

function extractAnchorCandidates(doc, html) {
    const candidates = [];

    doc.querySelectorAll('a[href]').forEach(anchor => {
        candidates.push({
            href: anchor.getAttribute('href') || '',
            text: anchor.textContent || ''
        });
    });

    const anchorRegex = /href=(['"])(.*?)\1/gi;
    let match;
    while ((match = anchorRegex.exec(html)) !== null) {
        candidates.push({ href: match[2], text: '' });
    }

    return candidates;
}

function extractTextCandidates(doc) {
    const candidates = [];
    const root = doc.body || doc.documentElement;

    if (!root) {
        return candidates;
    }

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const text = walker.currentNode.textContent || '';
        const matches = text.match(DOCUMENT_NAME_REGEX);
        if (!matches) continue;

        matches.forEach(match => {
            const trimmed = match.trim();
            if (trimmed) {
                candidates.push(trimmed);
            }
        });
    }

    return candidates;
}

function addDocumentFromCandidate(documents, candidate, directoryUrl) {
    const value = String(candidate || '').trim();
    if (!value || value.startsWith('#') || value.startsWith('?')) {
        return;
    }

    let resolvedUrl;
    try {
        resolvedUrl = new URL(value, directoryUrl).toString();
    } catch {
        return;
    }

    if (!isSupportedDocument(resolvedUrl)) return;
    if (!isSameDirectory(resolvedUrl, directoryUrl)) return;

    const entry = createDocumentEntry(resolvedUrl);
    if (!entry) return;
    documents.set(entry.url, entry);
}

function parseDirectoryDocuments(directoryUrl, html, currentUrl) {
    const documents = new Map();
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    extractAnchorCandidates(doc, html).forEach(candidate => {
        addDocumentFromCandidate(documents, candidate.href, directoryUrl);
    });

    if (directoryUrl.startsWith('file://') && documents.size <= 1) {
        extractTextCandidates(doc).forEach(candidate => {
            addDocumentFromCandidate(documents, candidate, directoryUrl);
        });
    }

    if (isSupportedDocument(normalizedCurrentUrl) && !documents.has(normalizedCurrentUrl)) {
        const currentEntry = createDocumentEntry(normalizedCurrentUrl);
        if (currentEntry) {
            documents.set(currentEntry.url, currentEntry);
        }
    }

    return Array.from(documents.values()).sort((left, right) => {
        const leftIsCurrent = left.url === normalizedCurrentUrl;
        const rightIsCurrent = right.url === normalizedCurrentUrl;
        if (leftIsCurrent !== rightIsCurrent) {
            return leftIsCurrent ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });
}

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

        link.href = createViewerUrl(documentEntry.url);
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
        console.error('Failed to load sibling documents:', error);
        if (sidebarFolderName) {
            sidebarFolderName.textContent = 'Current Folder';
            sidebarFolderName.title = '';
        }
        renderEmptyState(fileBrowserContainer, getLoadErrorMessage(currentUrl, error));
    });
}
