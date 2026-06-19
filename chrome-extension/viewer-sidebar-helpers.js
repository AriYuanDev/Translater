import {
    getFilenameFromUrl,
    getViewerType,
    isFileUrl,
    isSupportedViewerDocument
} from './viewer-routing.js';

const DOCUMENT_NAME_REGEX = /[^<>:"/\\|?*\r\n\t]+?\.(?:pdf|md|markdown)\b/gi;
const CHROME_FILE_ROW_REGEX = /addRow\(\s*("(?:\\.|[^"\\])*")\s*,\s*("(?:\\.|[^"\\])*")\s*,\s*(true|false|0|1)\b/gi;

export function normalizeUrl(url) {
    try {
        return new URL(url).toString();
    } catch {
        return url || '';
    }
}

export function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value || '');
    } catch {
        return value || '';
    }
}

export function getDocumentName(url) {
    return getFilenameFromUrl(url, 'Untitled');
}

export function getDirectoryUrl(url) {
    try {
        return new URL('.', url).toString();
    } catch {
        if (!url || !url.includes('/')) return '';
        return url.slice(0, url.lastIndexOf('/') + 1);
    }
}

export function getParentDirectoryUrl(directoryUrl) {
    const value = String(directoryUrl || '');
    if (!value) return '';

    try {
        const normalizedDirectoryUrl = normalizeUrl(value.endsWith('/') ? value : `${value}/`);
        const parentDirectoryUrl = new URL('..', normalizedDirectoryUrl).toString();
        return parentDirectoryUrl === normalizedDirectoryUrl ? '' : parentDirectoryUrl;
    } catch {
        const trimmed = value.endsWith('/') ? value.slice(0, -1) : value;
        const separatorIndex = trimmed.lastIndexOf('/');
        if (separatorIndex < 0) return '';

        const parentDirectoryUrl = trimmed.slice(0, separatorIndex + 1);
        return parentDirectoryUrl === value ? '' : parentDirectoryUrl;
    }
}

export function getDirectoryLabel(directoryUrl) {
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

export function createDirectoryEntry(url) {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl || !normalizedUrl.endsWith('/')) return null;

    return {
        type: 'directory',
        url: normalizedUrl,
        name: getDirectoryLabel(normalizedUrl),
        label: 'Folder'
    };
}

export function getHttpStatusFromError(error) {
    const match = String(error?.message || '').match(/^HTTP\s+(\d{3})$/);
    return match ? Number(match[1]) : null;
}

export function shouldFallbackToCurrentDocument(error) {
    const status = getHttpStatusFromError(error);
    return status === 401 || status === 403 || status === 404;
}

export function createDocumentEntry(url) {
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

function isChildDirectory(candidateUrl, directoryUrl) {
    const normalizedCandidateUrl = normalizeUrl(candidateUrl);
    const normalizedDirectoryUrl = normalizeUrl(directoryUrl);
    if (!normalizedCandidateUrl.endsWith('/')) return false;
    if (normalizedCandidateUrl === normalizedDirectoryUrl) return false;
    return getParentDirectoryUrl(normalizedCandidateUrl) === normalizedDirectoryUrl;
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

function decodeJavaScriptStringLiteral(value) {
    try {
        return JSON.parse(value);
    } catch {
        return String(value || '').slice(1, -1);
    }
}

function extractChromeFileRowCandidates(html) {
    const candidates = [];
    let match;

    while ((match = CHROME_FILE_ROW_REGEX.exec(html)) !== null) {
        candidates.push({
            href: decodeJavaScriptStringLiteral(match[2]),
            isDirectory: match[3] === 'true' || match[3] === '1'
        });
    }

    return candidates;
}

function extractTextCandidates(doc, nodeFilter) {
    const candidates = [];
    const root = doc.body || doc.documentElement;

    if (!root) {
        return candidates;
    }

    const walker = doc.createTreeWalker(root, nodeFilter.SHOW_TEXT);
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

    if (!isSupportedViewerDocument(resolvedUrl)) return;
    if (!isSameDirectory(resolvedUrl, directoryUrl)) return;

    const entry = createDocumentEntry(resolvedUrl);
    if (!entry) return;
    documents.set(entry.url, entry);
}

function addItemFromCandidate(items, candidate, directoryUrl) {
    const candidateValue = typeof candidate === 'object' ? candidate.href : candidate;
    const isDirectoryHint = typeof candidate === 'object' && candidate.isDirectory;
    let value = String(candidateValue || '').trim();
    if (!value || value.startsWith('#') || value.startsWith('?')) {
        return;
    }

    if (isDirectoryHint) {
        value = value.endsWith('/') ? value : `${value}/`;
    }

    let resolvedUrl;
    try {
        resolvedUrl = new URL(value, directoryUrl).toString();
    } catch {
        return;
    }

    if (isDirectoryHint) {
        if (isChildDirectory(resolvedUrl, directoryUrl)) {
            const entry = createDirectoryEntry(resolvedUrl);
            if (entry) {
                items.set(`directory:${entry.url}`, entry);
            }
        }
        return;
    }

    if (isSupportedViewerDocument(resolvedUrl) && isSameDirectory(resolvedUrl, directoryUrl)) {
        const entry = createDocumentEntry(resolvedUrl);
        if (entry) {
            items.set(`document:${entry.url}`, { type: 'document', ...entry });
        }
        return;
    }

    if (isChildDirectory(resolvedUrl, directoryUrl)) {
        const entry = createDirectoryEntry(resolvedUrl);
        if (entry) {
            items.set(`directory:${entry.url}`, entry);
        }
    }
}

function countDocumentItems(items) {
    let count = 0;
    items.forEach(item => {
        if (item.type === 'document') count += 1;
    });
    return count;
}

export function parseDirectoryItems(
    directoryUrl,
    html,
    currentUrl,
    {
        DOMParserCtor = globalThis.DOMParser,
        nodeFilter = globalThis.NodeFilter
    } = {}
) {
    const items = new Map();
    const parser = new DOMParserCtor();
    const doc = parser.parseFromString(html, 'text/html');

    extractAnchorCandidates(doc, html).forEach(candidate => {
        addItemFromCandidate(items, candidate.href, directoryUrl);
    });

    extractChromeFileRowCandidates(html).forEach(candidate => {
        addItemFromCandidate(items, candidate, directoryUrl);
    });

    if (isFileUrl(directoryUrl) && countDocumentItems(items) <= 1 && nodeFilter) {
        const documents = new Map();
        extractTextCandidates(doc, nodeFilter).forEach(candidate => {
            addDocumentFromCandidate(documents, candidate, directoryUrl);
        });

        documents.forEach(entry => {
            items.set(`document:${entry.url}`, { type: 'document', ...entry });
        });
    }

    return Array.from(items.values());
}

export function parseDirectoryDocuments(directoryUrl, html, currentUrl, options = {}) {
    return parseDirectoryItems(directoryUrl, html, currentUrl, options)
        .filter(item => item.type === 'document')
        .map(({ type, ...documentEntry }) => documentEntry);
}
