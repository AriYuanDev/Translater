import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyElementZoom,
    captureElementScrollAnchor,
    createZoomStateParams,
    getExplicitZoomParam,
    getClampedZoomPercent,
    restoreElementScrollAnchor
} from '../chrome-extension/viewer-zoom-helpers.js';

test('applyElementZoom uses layout zoom instead of transform scaling', () => {
    const element = {
        style: {
            zoom: '',
            transform: 'scale(1.5)',
            transformOrigin: 'top center',
            marginBottom: '500px'
        }
    };

    applyElementZoom(element, 150);

    assert.equal(element.style.zoom, '1.5');
    assert.equal(element.style.transform, '');
    assert.equal(element.style.transformOrigin, '');
    assert.equal(element.style.marginBottom, '');
});

test('getClampedZoomPercent parses query values and clamps to viewer limits', () => {
    assert.equal(getClampedZoomPercent('175', 100, 60, 200), 175);
    assert.equal(getClampedZoomPercent('20', 100, 60, 200), 60);
    assert.equal(getClampedZoomPercent('250', 100, 60, 200), 200);
    assert.equal(getClampedZoomPercent('bad', 100, 60, 200), 100);
    assert.equal(getClampedZoomPercent(null, 100, 60, 200), 100);
});

test('createZoomStateParams omits invalid zoom values', () => {
    assert.deepEqual(createZoomStateParams(190), { zoom: 190, zoomExplicit: 1 });
    assert.deepEqual(createZoomStateParams(Number.NaN), {});
});

test('createZoomStateParams distinguishes explicit and passive default zoom values', () => {
    assert.deepEqual(createZoomStateParams(100, { defaultZoom: 100 }), { zoom: 100, zoomExplicit: 1 });
    assert.deepEqual(createZoomStateParams(100, { defaultZoom: 100, isExplicit: false }), {});
    assert.deepEqual(createZoomStateParams(60, { defaultZoom: 100, isExplicit: true }), { zoom: 60, zoomExplicit: 1 });
    assert.deepEqual(createZoomStateParams(150, { defaultZoom: 100, isExplicit: false }), { zoom: 150 });
});

test('getExplicitZoomParam ignores stale zoom params without explicit marker', () => {
    assert.equal(getExplicitZoomParam(new URLSearchParams('zoom=60')), null);
    assert.equal(getExplicitZoomParam(new URLSearchParams('zoom=60&zoomExplicit=1')), '60');
});

test('captureElementScrollAnchor and restoreElementScrollAnchor keep the viewport center anchored', () => {
    let scrollTop = 300;
    const scrollCalls = [];
    const container = {
        clientHeight: 400,
        getBoundingClientRect() {
            return { top: 50 };
        },
        get scrollTop() {
            return scrollTop;
        },
        scrollTo(options) {
            scrollTop = options.top;
            scrollCalls.push(options);
        }
    };

    const content = {
        getBoundingClientRect() {
            return { top: -150, height: 1000 };
        }
    };

    const anchor = captureElementScrollAnchor(container, content);
    assert.deepEqual(anchor, { offsetRatio: 0.4 });

    content.getBoundingClientRect = () => ({ top: -350, height: 1600 });
    restoreElementScrollAnchor(container, content, anchor);

    assert.deepEqual(scrollCalls, [{ top: 340, behavior: 'auto' }]);
});
