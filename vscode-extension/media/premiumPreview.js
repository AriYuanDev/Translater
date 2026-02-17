(function () {
    const vscode = acquireVsCodeApi();
    let currentPopup = null;
    let currentFloatBtn = null;

    function removeUI() {
        if (currentPopup) { currentPopup.remove(); currentPopup = null; }
        if (currentFloatBtn) { currentFloatBtn.remove(); currentFloatBtn = null; }
    }

    function createPopup(x, y, originalText, translatedText) {
        removeUI();
        const popup = document.createElement('div');
        popup.className = 'premium-popup';

        // Use scroll-compensated coordinates
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        popup.style.left = Math.min(x + scrollX, window.innerWidth + scrollX - 320) + 'px';
        popup.style.top = (y + scrollY + 20) + 'px';

        popup.innerHTML = `
            <div class="premium-popup-content">
                <div class="premium-popup-header">
                    <span>Translation</span>
                    <button class="premium-close-btn">&times;</button>
                </div>
                <div class="premium-translation">${translatedText}</div>
            </div>
        `;

        popup.querySelector('.premium-close-btn').onclick = removeUI;
        document.body.appendChild(popup);
        currentPopup = popup;
    }

    function createFloatBtn(selection, text) {
        removeUI();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        const btn = document.createElement('button');
        btn.className = 'premium-float-btn';
        btn.textContent = 'T';

        const btnSize = 36;
        let left = rect.left + (rect.width / 2) - (btnSize / 2);
        let top = rect.top - btnSize - 10; // Viewport relative for now

        // Boundary detection (in Viewport): if not enough space above, move to bottom
        if (top < 10) {
            top = rect.bottom + 10;
        }

        // Horizontal boundary protection (in Viewport)
        left = Math.max(10, Math.min(left, window.innerWidth - btnSize - 10));

        // Apply scroll compensation for absolute positioning
        btn.style.left = (left + scrollX) + 'px';
        btn.style.top = (top + scrollY) + 'px';

        btn.onclick = () => {
            btn.textContent = '...';
            vscode.postMessage({ command: 'translate', text: text });
        };

        document.body.appendChild(btn);
        currentFloatBtn = btn;
    }

    document.addEventListener('mouseup', (e) => {
        setTimeout(() => {
            if (e.target.closest('.premium-float-btn') || e.target.closest('.premium-popup')) return;

            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text && text.length > 3) {
                createFloatBtn(selection, text);
            } else {
                removeUI();
            }
        }, 50);
    });

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.premium-float-btn') && !e.target.closest('.premium-popup') && !e.target.closest('#zoom-toolbar')) {
            removeUI();
        }
    });

    // --- Zoom Controller ---
    const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 10, ZOOM_DEFAULT = 100;
    const contentEl = document.getElementById('content');
    const zoomLevelBtn = document.getElementById('zoomLevel');
    let zoomLevel = ZOOM_DEFAULT;

    function applyZoom(level) {
        zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(level / ZOOM_STEP) * ZOOM_STEP));
        contentEl.style.zoom = zoomLevel / 100;
        zoomLevelBtn.textContent = zoomLevel + '%';
        const state = vscode.getState() || {};
        vscode.setState(Object.assign(state, { zoomLevel }));
    }

    function calculateFitWidth() {
        const viewportWidth = window.innerWidth;
        const contentNaturalWidth = 960 + 120 + 2; // max-width + padding + border
        return Math.round((viewportWidth / contentNaturalWidth) * 100);
    }

    document.getElementById('zoomOut').addEventListener('click', () => applyZoom(zoomLevel - ZOOM_STEP));
    document.getElementById('zoomIn').addEventListener('click', () => applyZoom(zoomLevel + ZOOM_STEP));
    document.getElementById('zoomReset').addEventListener('click', () => applyZoom(ZOOM_DEFAULT));
    document.getElementById('fitWidth').addEventListener('click', () => applyZoom(calculateFitWidth()));

    document.addEventListener('keydown', (e) => {
        if (e.target.closest('#zoom-toolbar')) return;
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(zoomLevel + ZOOM_STEP); }
        else if (e.key === '-') { e.preventDefault(); applyZoom(zoomLevel - ZOOM_STEP); }
        else if (e.key === '0') { e.preventDefault(); applyZoom(ZOOM_DEFAULT); }
    });

    document.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        applyZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }, { passive: false });

    // Restore persisted zoom level
    const savedState = vscode.getState();
    if (savedState && savedState.zoomLevel) {
        applyZoom(savedState.zoomLevel);
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'translationResult':
                if (currentFloatBtn) {
                    const rect = currentFloatBtn.getBoundingClientRect();
                    createPopup(rect.left, rect.top + 36, message.original, message.text);
                }
                break;
            case 'error':
                console.error('Translation error:', message.message);
                break;
        }
    });
})();
