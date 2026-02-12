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
        if (!e.target.closest('.premium-float-btn') && !e.target.closest('.premium-popup')) {
            removeUI();
        }
    });

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
