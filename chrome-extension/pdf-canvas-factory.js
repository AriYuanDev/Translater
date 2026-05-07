const READBACK_OPTIMIZED_CONTEXT_OPTIONS = Object.freeze({
    willReadFrequently: true
});

export function getReadbackOptimizedCanvasContext(canvas) {
    const context = canvas.getContext('2d', READBACK_OPTIMIZED_CONTEXT_OPTIONS);
    if (!context) {
        throw new Error('Unable to initialize PDF canvas context');
    }
    return context;
}

export class ReadbackOptimizedCanvasFactory {
    constructor({ ownerDocument = document } = {}) {
        this.ownerDocument = ownerDocument;
    }

    create(width, height) {
        if (width <= 0 || height <= 0) {
            throw new Error('Invalid canvas size');
        }

        const canvas = this.ownerDocument.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        return {
            canvas,
            context: getReadbackOptimizedCanvasContext(canvas)
        };
    }

    reset(canvasAndContext, width, height) {
        if (!canvasAndContext.canvas) {
            throw new Error('Canvas is not specified');
        }
        if (width <= 0 || height <= 0) {
            throw new Error('Invalid canvas size');
        }

        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }

    destroy(canvasAndContext) {
        if (!canvasAndContext.canvas) {
            throw new Error('Canvas is not specified');
        }

        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}
