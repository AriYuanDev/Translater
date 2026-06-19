export function setViewerLoading(container, show, loadingText = 'Loading...') {
    if (!container) return null;

    let overlay = container.querySelector('.loading-overlay');
    if (!show) {
        overlay?.remove();
        return null;
    }

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';

        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';

        const text = document.createElement('div');
        text.className = 'loading-text';

        overlay.append(spinner, text);
        container.appendChild(overlay);
    }

    overlay.querySelector('.loading-text').textContent = loadingText;
    return overlay;
}

export function showViewerError({
    loadingContainer,
    contentContainer,
    message,
    icon = '📄',
    retryLabel = 'Retry',
    onRetry = () => location.reload()
}) {
    if (!contentContainer) return null;

    setViewerLoading(loadingContainer, false);
    contentContainer.textContent = '';

    const error = document.createElement('div');
    error.className = 'error-container';

    const errorIcon = document.createElement('div');
    errorIcon.className = 'error-icon';
    errorIcon.textContent = icon;

    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = message;

    const retryButton = document.createElement('button');
    retryButton.className = 'error-retry-btn';
    retryButton.id = 'retryBtn';
    retryButton.textContent = retryLabel;
    retryButton.onclick = onRetry;

    error.append(errorIcon, errorMessage, retryButton);
    contentContainer.appendChild(error);
    return error;
}
