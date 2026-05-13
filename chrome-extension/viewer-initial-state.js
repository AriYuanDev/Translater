(function () {
    try {
        if (new URLSearchParams(window.location.search).get('sidebar') === 'open') {
            document.documentElement.classList.add('viewer-sidebar-open');
        }
    } catch {
        // Keep viewer startup resilient if URL parsing is unavailable.
    }
}());
