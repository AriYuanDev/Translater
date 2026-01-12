const vscode = require('vscode');
const path = require('path');
const { fetchDictionary, translateText } = require('./src/translationService');
const { PdfEditorProvider } = require('./src/pdfProvider');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Translater extension is now active!');

    // 1. Register Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
        async provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);

            if (!word || !/^[a-zA-Z]+$/.test(word)) {
                return null;
            }

            try {
                // Fetch Dictionary Data
                const dictData = await fetchDictionary(word);
                // Simplify display for Hover
                const md = new vscode.MarkdownString();
                md.isTrusted = true;

                if (dictData && dictData.meanings) {
                    md.appendMarkdown(`**${word}**  \n`);
                    if (dictData.phonetic) md.appendMarkdown(`*${dictData.phonetic}*  \n`);

                    dictData.meanings.slice(0, 3).forEach(m => {
                        md.appendMarkdown(`**${m.partOfSpeech}**  \n`);
                        m.definitions.slice(0, 2).forEach(d => {
                            md.appendMarkdown(`- ${d.definition}  \n`);
                        });
                    });
                } else {
                    // Fallback to translation if no dictionary entry
                    const trans = await translateText(word);
                    md.appendMarkdown(`**${word}**: ${trans}`);
                }

                return new vscode.Hover(md);

            } catch (e) {
                console.error(e);
                return null;
            }
        }
    });

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
            vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
        }
    });

    // 3. Register Custom PDF Editor
    const pdfProvider = PdfEditorProvider.register(context);

    context.subscriptions.push(hoverProvider, disposableCommand, pdfProvider);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
