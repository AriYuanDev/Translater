import { getViewerType, isSupportedViewerDocument } from './viewer-routing.js';

const DOCUMENT_NAME_REGEX = /[^<>:"/\\|?*\r\n\t]+?\.(?:pdf|md|markdown)\b/gi;

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
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.split('/').pop();
        return safeDecodeURIComponent(filename || 'Untitled');
    } catch {
        const filename = String(url || '').split('/').pop()?.split('?')[0] || 'Untitled';
        return safeDecodeURIComponent(filename);
    }
}

export function getDirectoryUrl(url) {
    try {
        return new URL('.', url).toString();
    } catch {
        if (!url || !url.includes('/')) return '';
        return url.slice(0, url.lastIndexOf('/') + 1);
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

export function parseDirectoryDocuments(
    directoryUrl,
    html,
    currentUrl,
    {
        DOMParserCtor = globalThis.DOMParser,
        nodeFilter = globalThis.NodeFilter
    } = {}
) {
    const documents = new Map();
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
    const parser = new DOMParserCtor();
    const doc = parser.parseFromString(html, 'text/html');

    extractAnchorCandidates(doc, html).forEach(candidate => {
        addDocumentFromCandidate(documents, candidate.href, directoryUrl);
    });

    if (directoryUrl.startsWith('file://') && documents.size <= 1 && nodeFilter) {
        extractTextCandidates(doc, nodeFilter).forEach(candidate => {
            addDocumentFromCandidate(documents, candidate, directoryUrl);
        });
    }

    if (isSupportedViewerDocument(normalizedCurrentUrl) && !documents.has(normalizedCurrentUrl)) {
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
