export function getClampedZoomPercent(value, defaultZoom, minZoom, maxZoom) {
    const hasZoomValue = value !== null && value !== undefined && value !== '';
    const parsed = hasZoomValue ? Number(value) : Number.NaN;
    const fallback = Number(defaultZoom);
    const zoom = Number.isFinite(parsed) ? parsed : fallback;
    const min = Number(minZoom);
    const max = Number(maxZoom);

    return Math.min(max, Math.max(min, Math.round(zoom)));
}

export function createZoomStateParams(zoomPercent, {
    defaultZoom,
    isExplicit = true
} = {}) {
    const zoom = Number(zoomPercent);
    if (!Number.isFinite(zoom)) {
        return {};
    }

    const roundedZoom = Math.round(zoom);
    const roundedDefaultZoom = Math.round(Number(defaultZoom));
    if (!isExplicit && Number.isFinite(roundedDefaultZoom) && roundedZoom === roundedDefaultZoom) {
        return {};
    }

    return isExplicit ? { zoom: roundedZoom, zoomExplicit: 1 } : { zoom: roundedZoom };
}

export function getExplicitZoomParam(searchParams) {
    const params = searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams(searchParams || '');

    if (params.get('zoomExplicit') !== '1') {
        return null;
    }

    return params.get('zoom');
}

export function applyElementZoom(contentElement, zoomPercent) {
    if (!contentElement) return;

    const zoom = Number(zoomPercent);
    if (!Number.isFinite(zoom) || zoom <= 0) return;

    contentElement.style.zoom = String(zoom / 100);
    contentElement.style.transform = '';
    contentElement.style.transformOrigin = '';
    contentElement.style.marginBottom = '';
}

export function captureElementScrollAnchor(scrollContainer, contentElement) {
    if (!scrollContainer || !contentElement) return null;

    const containerRect = scrollContainer.getBoundingClientRect();
    const contentRect = contentElement.getBoundingClientRect();
    if (!contentRect.height) return { offsetRatio: 0 };

    const anchorY = containerRect.top + scrollContainer.clientHeight / 2;
    const offsetRatio = (anchorY - contentRect.top) / contentRect.height;

    return {
        offsetRatio: Math.min(Math.max(offsetRatio, 0), 1)
    };
}

export function restoreElementScrollAnchor(scrollContainer, contentElement, anchor) {
    if (!scrollContainer || !contentElement || !anchor) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const contentRect = contentElement.getBoundingClientRect();
    const relativeTop = contentRect.top - containerRect.top + scrollContainer.scrollTop;
    const ratio = Math.min(Math.max(anchor.offsetRatio ?? 0, 0), 1);
    const target = relativeTop + ratio * contentRect.height - scrollContainer.clientHeight / 2;

    scrollContainer.scrollTo({ top: Math.max(target, 0), behavior: 'auto' });
}
