const vscode = require('vscode');
const path = require('path');
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
            }, async (progress) => {
                const result = await translateText(text);
                vscode.window.showInformationMessage(`Translation: ${result}`, 'Copy').then(selection => {
                    if (selection === 'Copy') {
                        vscode.env.clipboard.writeText(result);
                    }
                });
            });
        } catch (error) {
            if (error.message === '请先配置 DeepL API Key') {
                const selection = await vscode.window.showErrorMessage(
                    'DeepL API Key 未配置，无法翻译。',
                    '去配置'
                );
                if (selection === '去配置') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'translater.deepLApiKey');
                }
            } else {
                vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
            }
        }
    });

    context.subscriptions.push(disposableCommand);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
