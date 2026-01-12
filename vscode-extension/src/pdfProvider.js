const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class PdfEditorProvider {

    static register(context) {
        const provider = new PdfEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(PdfEditorProvider.viewType, provider);
        return providerRegistration;
    }

    static viewType = 'translater.pdfPreview';

    constructor(context) {
        this.context = context;
    }

    async resolveCustomEditor(document, webviewPanel, _token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath))
            ]
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);
    }

    getHtmlForWebview(webview, documentUri) {
        // We need to convert the disk path to a webview URI so it can be loaded
        const scriptPathOnDisk = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'pdfviewer.js'));
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        const stylePathOnDisk = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'pdfviewer.css'));
        const styleUri = webview.asWebviewUri(stylePathOnDisk);

        const pdfWorkerPathOnDisk = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'pdf.worker.min.mjs'));
        const pdfWorkerUri = webview.asWebviewUri(pdfWorkerPathOnDisk);

        const pdfLibPathOnDisk = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'pdf.min.mjs'));
        const pdfLibUri = webview.asWebviewUri(pdfLibPathOnDisk);

        // Convert the document content to a URI that the webview can read
        // For custom editors, the document URI is strictly for the file. 
        // We need to pass this URI to our javascript so it can load it.
        // However, standard PDF.js usually expects a URL. 
        // The Webview can access the file space if we allow it in localResourceRoots (we did).
        const pdfDocUri = webview.asWebviewUri(documentUri);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PDF Viewer</title>
            <link rel="stylesheet" href="${styleUri}">
        </head>
        <body>
            <div class="pdf-toolbar">
                <div class="toolbar-left">
                    <button id="prev" class="toolbar-btn" title="Previous Page">
                        <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                    </button>
                    <button id="next" class="toolbar-btn" title="Next Page">
                        <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </button>
                    <div class="page-info">
                        <span id="page_num">--</span> / <span id="page_count">--</span>
                    </div>
                </div>
            </div>
            <div id="viewerContainer" class="viewer-container">
                <div class="pdf-page-container">
                     <canvas id="the-canvas"></canvas>
                </div>
            </div>
            
            <script type="module">
                window.PDF_WORKER_SRC = '${pdfWorkerUri}';
                window.PDF_URL = '${pdfDocUri}';
            </script>
            <script type="module" src="${pdfLibUri}"></script>
            <script type="module" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}

module.exports = {
    PdfEditorProvider
};
