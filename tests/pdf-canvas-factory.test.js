import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ReadbackOptimizedCanvasFactory,
    getReadbackOptimizedCanvasContext
} from '../chrome-extension/pdf-canvas-factory.js';

function createFakeCanvas(context = {}) {
    const getContextCalls = [];
    const canvas = {
        width: 0,
        height: 0,
        getContext(type, options) {
            getContextCalls.push({ type, options });
            return context;
        }
    };

    return { canvas, getContextCalls };
}

test('getReadbackOptimizedCanvasContext requests the 2d context with frequent readback enabled', () => {
    const context = { scale() {} };
    const { canvas, getContextCalls } = createFakeCanvas(context);

    assert.equal(getReadbackOptimizedCanvasContext(canvas), context);
    assert.deepEqual(getContextCalls, [
        {
            type: '2d',
            options: { willReadFrequently: true }
        }
    ]);
});

test('ReadbackOptimizedCanvasFactory creates PDF.js canvas entries with readback-optimized contexts', () => {
    const { canvas, getContextCalls } = createFakeCanvas({ canvas: null });
    const ownerDocument = {
        createElement(tagName) {
            assert.equal(tagName, 'canvas');
            return canvas;
        }
    };
    const factory = new ReadbackOptimizedCanvasFactory({ ownerDocument });

    const entry = factory.create(320, 240);

    assert.equal(entry.canvas, canvas);
    assert.equal(canvas.width, 320);
    assert.equal(canvas.height, 240);
    assert.deepEqual(getContextCalls[0], {
        type: '2d',
        options: { willReadFrequently: true }
    });
});

test('ReadbackOptimizedCanvasFactory resets and destroys canvas entries like PDF.js expects', () => {
    const { canvas } = createFakeCanvas({});
    const factory = new ReadbackOptimizedCanvasFactory({
        ownerDocument: {
            createElement() {
                return canvas;
            }
        }
    });
    const entry = factory.create(100, 100);

    factory.reset(entry, 200, 150);

    assert.equal(entry.canvas.width, 200);
    assert.equal(entry.canvas.height, 150);

    factory.destroy(entry);

    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
    assert.equal(entry.canvas, null);
    assert.equal(entry.context, null);
});
