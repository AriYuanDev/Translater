// Adapted for VS Code
const vscode = acquireVsCodeApi();

// PDF.js Config
const pdfjsLib = await import('./pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDF_WORKER_SRC; // Injected by Provider

let pdfDoc = null;
let currentScale = 1.0;
let renderedPages = new Map();

// UI Elements
const viewer = document.getElementById('viewerContainer'); // Note: ID changed in Provider HTML? Provider uses 'viewerContainer'. 
// Wait, Provider HTML has:
// <div id="viewerContainer"><canvas id="the-canvas"></canvas></div>
// The original pdfviewer.js appended pages to 'viewer' (id='viewer').
// The Provider HTML structure I wrote in pdfProvider.js:
// <div id="app"> <div id="toolbar">...</div> <div id="viewerContainer"><canvas id="the-canvas"></canvas></div> </div>
// The original pdfviewer.js uses 'viewer' to append pages.
// I should update pdfviewer.js to match the new HTML structure OR update pdfProvider.js.
// Let's assume we stick to the provided HTML in pdfProvider.js which is simplified. 
// Actually, the original pdfviewer.js logic for 'renderAllPages' creates 'pdf-page-container' divs.
// I should make sure my HTML container matches what this script expects.
// Let's adjust this script to look for 'viewerContainer' and append children to it directly or create a wrapper.

const container = document.getElementById('viewerContainer');
const currentPageInput = document.getElementById('current_page'); // check toolbar
// Provider HTML IDs: prev, next, page_num, page_count.
// Original JS: prevPage, nextPage, currentPage, totalPages.
// I need to align these. 

// Re-mapping IDs to match pdfProvider.js HTML
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const pageNumSpan = document.getElementById('page_num');
const pageCountSpan = document.getElementById('page_count');

// Basic Load
async function loadPdf(url) {
    try {
        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
            cMapPacked: true,
        });

        pdfDoc = await loadingTask.promise;
        pageCountSpan.textContent = pdfDoc.numPages;
        pageNumSpan.textContent = 1;

        renderPage(1);
    } catch (error) {
        console.error('Load Error:', error);
        container.textContent = 'Error loading PDF: ' + error.message;
    }
}

async function renderPage(num) {
    // Simplified single page render for MVP to ensure it works
    const page = await pdfDoc.getPage(num);
    const scale = 1.5;
    const viewport = page.getViewport({ scale: scale });

    const canvas = document.getElementById('the-canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext).promise;

    pageNumSpan.textContent = num;
}

// Events
prevBtn.addEventListener('click', () => {
    if (pageNumSpan.textContent <= 1) return;
    renderPage(parseInt(pageNumSpan.textContent) - 1);
});

nextBtn.addEventListener('click', () => {
    if (pageNumSpan.textContent >= pdfDoc.numPages) return;
    renderPage(parseInt(pageNumSpan.textContent) + 1);
});

// Init
if (window.PDF_URL) {
    loadPdf(window.PDF_URL);
} else {
    console.error('No PDF_URL defined');
}
