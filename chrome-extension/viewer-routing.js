export const VIEWER_TYPES = {
    pdf: { label: 'PDF', viewerPage: 'pdfviewer.html' },
    md: { label: 'Markdown', viewerPage: 'mdviewer.html' },
    markdown: { label: 'Markdown', viewerPage: 'mdviewer.html' }
};

export function getPathExtension(url) {
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

export function getViewerType(url) {
    const extension = getPathExtension(url);
    return VIEWER_TYPES[extension] || null;
}

export function isSupportedViewerDocument(url) {
    return !!getViewerType(url);
}

export function isPdfUrl(url) {
    if (!url) return false;
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        if (pathname.endsWith('.pdf')) return true;
        const segments = pathname.split('/');
        const lastSegment = segments[segments.length - 1];
        return lastSegment.includes('.pdf');
    } catch {
        return String(url).toLowerCase().includes('.pdf');
    }
}

export function isMdUrl(url) {
    if (!url) return false;
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        return pathname.endsWith('.md') || pathname.endsWith('.markdown');
    } catch {
        const lower = String(url).toLowerCase();
        return lower.endsWith('.md') || lower.endsWith('.markdown');
    }
}

export function hasViewerBypass(url) {
    if (!url) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.searchParams.has('translater_no_redirect') || parsedUrl.hash.includes('no_redirect');
    } catch {
        return String(url).includes('no_redirect');
    }
}

export function createViewerPageUrl(viewerPage, sourceUrl, runtimeUrlResolver = value => value) {
    return runtimeUrlResolver(viewerPage) + '?url=' + encodeURIComponent(sourceUrl);
}

export function createViewerUrlForDocument(url, runtimeUrlResolver = value => value) {
    const viewerType = getViewerType(url);
    if (!viewerType) return url;
    return createViewerPageUrl(viewerType.viewerPage, url, runtimeUrlResolver);
}
