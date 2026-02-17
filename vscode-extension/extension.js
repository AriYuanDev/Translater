const vscode = require('vscode');
const { translateText } = require('./src/translationService');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Translater extension is now active!');

    // 1. Hover Provider Removed per user request
    // We only keep the explicit Right-Click Translate command.

    // 2. Register Command
    const disposableCommand = vscode.commands.registerCommand('translater.translateSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) return;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Translating...",
                cancellable: false
            }, async () => {
                const result = await translateText(text);
                vscode.window.showInformationMessage(`Translation: ${result}`, 'Copy').then(selection => {
                    if (selection === 'Copy') {
                        vscode.env.clipboard.writeText(result);
                    }
                });
            });
        } catch (error) {
            if (error.message === 'Please configure DeepL API Key first') {
                const selection = await vscode.window.showErrorMessage(
                    'DeepL API Key not configured. Translation disabled.',
                    'Configure'
                );
                if (selection === 'Configure') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'translater.deepLApiKey');
                }
            } else {
                vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
            }
        }
    });

    context.subscriptions.push(disposableCommand);

    // 3. Register Translation Proxy Command (for Markdown Previews)
    const disposableProxyCommand = vscode.commands.registerCommand('translater.showTranslation', async (payload) => {
        const normalized = normalizeMarkdownPayload(payload);
        if (!normalized.text) return;
        logPreviewEvent(normalized.source);
        try {
            const result = await translateText(normalized.text);
            vscode.window.showInformationMessage(`Translation: ${result}`, 'Copy').then(selection => {
                if (selection === 'Copy') {
                    vscode.env.clipboard.writeText(result);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
        }
    });

    context.subscriptions.push(disposableProxyCommand);

    const disposablePremiumPreview = vscode.commands.registerCommand('translater.openPremiumPreview', () => {
        PremiumPreviewPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposablePremiumPreview);

    // Register Premium Custom Editor Provider
    const provider = new PremiumPreviewEditorProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider('translater.premiumPreview', provider));

    // 4. Return the markdown-it plugin
    return {
        extendMarkdownIt(md) {
            return require('./src/markdownItPlugin')(md);
        }
    };
}

class PremiumPreviewEditorProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }

    async resolveCustomTextEditor(document, webviewPanel, token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };

        const updateWebview = async () => {
            let content = '';
            try {
                // Use VS Code's built-in Markdown rendering API
                content = await vscode.commands.executeCommand('markdown.api.render', document.getText());
            } catch (e) {
                content = `<pre>${document.getText()}</pre>`;
                console.error('Rendering failed, falling back to pre:', e);
            }

            const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'premiumPreview.js'));
            const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'premiumPreview.css'));

            webviewPanel.webview.html = `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewPanel.webview.cspSource} https:; script-src ${webviewPanel.webview.cspSource} 'unsafe-inline'; style-src ${webviewPanel.webview.cspSource} 'unsafe-inline';">
                    <link rel="stylesheet" href="${styleUri}">
                    <title>Premium Translation Preview</title>
                </head>
                <body>
                    <div id="content">${content}</div>
                    <div id="zoom-toolbar">
                        <button id="zoomOut" title="Zoom Out (Ctrl+-)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </button>
                        <button id="zoomLevel" title="Current Zoom Level">100%</button>
                        <button id="zoomIn" title="Zoom In (Ctrl++)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </button>
                        <button id="fitWidth" title="Fit Width">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                        </button>
                        <button id="zoomReset" title="Reset Zoom (Ctrl+0)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </button>
                    </div>
                    <script src="${scriptUri}"></script>
                </body>
                </html>`;
        };

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'translate':
                    try {
                        const result = await translateText(message.text);
                        webviewPanel.webview.postMessage({ command: 'translationResult', text: result, original: message.text });
                    } catch (err) {
                        webviewPanel.webview.postMessage({ command: 'error', message: err.message });
                    }
                    return;
            }
        });

        updateWebview();
    }
}

class PremiumPreviewPanel {
    static createOrShow(extensionUri) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'translater.premiumPreview', vscode.ViewColumn.Beside);
        } else {
            vscode.window.showInformationMessage('Please open a Markdown file first.');
        }
    }
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};

function normalizeMarkdownPayload(payload) {
    if (typeof payload === 'string') {
        return { text: payload, source: 'markdownPreview' };
    }
    if (Array.isArray(payload) && payload.length > 0) {
        const [text = ''] = payload;
        return { text, source: 'array' };
    }
    if (payload && typeof payload === 'object' && typeof payload.text === 'string') {
        return { text: payload.text, source: payload.source || 'markdownPreview' };
    }
    return { text: '', source: 'unknown' };
}

function logPreviewEvent(source) {
    if (!source || source === 'markdownPreview') {
        return;
    }
    console.warn('[Translater] Unexpected translation payload source:', source);
}
