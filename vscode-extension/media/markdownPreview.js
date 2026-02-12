(function () {
    let currentPopup = null;
    let currentFloatButtons = null;

    const raf = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(cb, 16);

    function scheduleSelectionCheck(callback) {
        raf(() => raf(callback));
    }

    function removeAllPopups() {
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
    }

    function removeFloatButtons() {
        if (currentFloatButtons) {
            currentFloatButtons.remove();
            currentFloatButtons = null;
        }
    }

    // Use a hidden iframe as a target for command: URIs.
    // This is a known robust way to trigger custom protocols in webviews
    // without causing the main window to navigate (which causes the blank page).
    let dummyFrame = document.getElementById('translator-dummy-frame');
    if (!dummyFrame) {
        dummyFrame = document.createElement('iframe');
        dummyFrame.id = 'translator-dummy-frame';
        dummyFrame.name = 'translator-dummy-frame';
        dummyFrame.style.display = 'none';
        document.body.appendChild(dummyFrame);
    }

    function triggerCommand(command, payload) {
        const args = Array.isArray(payload) ? payload : [payload];
        const encodedArgs = encodeURIComponent(JSON.stringify(args));
        const cmd = `command:${command}?${encodedArgs}`;

        const a = document.createElement('a');
        a.href = cmd;
        a.target = 'translator-dummy-frame'; // Force navigation to the hidden iframe
        a.style.display = 'none';
        document.body.appendChild(a);

        a.click();

        setTimeout(() => {
            if (a.parentNode) a.remove();
        }, 100);
    }

    function createFloatingButton(anchorRect, fallbackPoint, text) {
        removeFloatButtons();

        const container = document.createElement('div');
        container.className = 'translator-float-buttons';
        const BUTTON_SIZE = 32;
        const OFFSET = 14;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        let left;
        let top;

        if (anchorRect && !Number.isNaN(anchorRect.left) && !Number.isNaN(anchorRect.top)) {
            left = anchorRect.left + (anchorRect.width / 2) - (BUTTON_SIZE / 2);
            top = anchorRect.top - BUTTON_SIZE - OFFSET;
            if (top < 10) {
                top = anchorRect.bottom + OFFSET;
            }
        } else {
            const fallbackX = fallbackPoint && typeof fallbackPoint.x === 'number' ? fallbackPoint.x : 0;
            const fallbackY = fallbackPoint && typeof fallbackPoint.y === 'number' ? fallbackPoint.y : 0;
            left = fallbackX - (BUTTON_SIZE / 2);
            top = fallbackY - BUTTON_SIZE - OFFSET;
        }

        left = Math.max(10, Math.min(left, viewportWidth - BUTTON_SIZE - 10));
        top = Math.max(10, Math.min(top, viewportHeight - BUTTON_SIZE - 10));

        container.style.left = left + 'px';
        container.style.top = top + 'px';

        const tBtn = document.createElement('button');
        tBtn.className = 'translator-float-btn translate-btn';
        tBtn.textContent = 'T';
        tBtn.title = 'Translate Selection';

        // Critical: Stop all events to prevent selection loss or scroll sync jumps
        const stopHandler = (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
        };

        tBtn.addEventListener('mousedown', stopHandler);
        tBtn.addEventListener('mouseup', stopHandler);
        tBtn.addEventListener('click', (e) => {
            stopHandler(e);
            triggerCommand('translater.showTranslation', { text, source: 'markdownPreview' });
            setTimeout(removeFloatButtons, 150);
        });

        container.appendChild(tBtn);
        document.body.appendChild(container);
        currentFloatButtons = container;
    }

    document.addEventListener('dblclick', (e) => {
        if (e.target.closest('.translator-float-buttons')) return;

        const selection = window.getSelection().toString().trim();
        if (selection) {
            triggerCommand('translater.showTranslation', { text: selection, source: 'markdownPreview' });
        }
    });

    document.addEventListener('mouseup', (e) => {
        scheduleSelectionCheck(() => {
            if (e.target.closest('.translator-float-buttons')) return;

            const selection = window.getSelection().toString().trim();
            if (selection && selection.length > 5 && selection.includes(' ')) {
                removeFloatButtons();
                createFloatingButton(e.clientX, e.clientY, selection);
            } else if (!selection) {
                removeFloatButtons();
            }
        });
    });

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.translator-float-buttons')) {
            removeFloatButtons();
        }
    });
})();
