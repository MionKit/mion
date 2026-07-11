import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Provides clickable links for code-import path attributes in markdown files.
 * Matches: <code-import path="packages/examples/src/..." ... />
 */
class CodeImportLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];
        const text = document.getText();

        // Find the monorepo root (parent of website folder)
        const documentDir = path.dirname(document.uri.fsPath);
        const monorepoRoot = this.findMonorepoRoot(documentDir);

        if (!monorepoRoot) {
            console.log('Code Import Links: Could not find monorepo root from', documentDir);
            return links;
        }

        // Use a fresh regex each time (global regexes maintain state)
        const pathRegex = /<code-import\s+[^>]*path=["']([^"']+)["'][^>]*\/?>/g;

        let match: RegExpExecArray | null;
        while ((match = pathRegex.exec(text)) !== null) {
            const fullMatch = match[0];
            const filePath = match[1];

            // Find the position of the path value within the match
            const pathAttrMatch = fullMatch.match(/path=["']([^"']+)["']/);
            if (!pathAttrMatch) continue;

            const pathStartInMatch = fullMatch.indexOf(pathAttrMatch[0]) + 6; // 'path="'.length
            const matchStart = match.index;
            const pathStart = matchStart + pathStartInMatch;
            const pathEnd = pathStart + filePath.length;

            const startPos = document.positionAt(pathStart);
            const endPos = document.positionAt(pathEnd);
            const range = new vscode.Range(startPos, endPos);

            // Resolve the file path relative to monorepo root
            const absolutePath = path.join(monorepoRoot, filePath);
            const targetUri = vscode.Uri.file(absolutePath);

            const link = new vscode.DocumentLink(range, targetUri);
            link.tooltip = `Open ${filePath}`;
            links.push(link);
        }

        console.log(`Code Import Links: Found ${links.length} links in ${document.fileName}`);
        return links;
    }

    private findMonorepoRoot(startDir: string): string | null {
        let currentDir = startDir;
        const maxDepth = 10;
        let depth = 0;

        while (depth < maxDepth) {
            // Check if this looks like the monorepo root (has packages folder)
            const packagesPath = path.join(currentDir, 'packages');
            try {
                if (fs.existsSync(packagesPath) && fs.statSync(packagesPath).isDirectory()) {
                    return currentDir;
                }
            } catch {
                // Ignore errors
            }

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break; // Reached filesystem root
            }
            currentDir = parentDir;
            depth++;
        }

        return null;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Import Links: Extension is activating...');

    const linkProvider = new CodeImportLinkProvider();

    // Register for markdown files using multiple selectors
    const selectors: vscode.DocumentSelector[] = [
        {scheme: 'file', language: 'markdown'},
        {scheme: 'file', pattern: '**/*.md'},
        {scheme: 'untitled', language: 'markdown'},
    ];

    for (const selector of selectors) {
        const disposable = vscode.languages.registerDocumentLinkProvider(selector, linkProvider);
        context.subscriptions.push(disposable);
    }

    // Add a test command to verify extension is working
    const testCommand = vscode.commands.registerCommand('codeImportLinks.test', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Code Import Links: No active editor');
            return;
        }

        const text = editor.document.getText();
        const regex = /<code-import\s+[^>]*path=["']([^"']+)["'][^>]*\/?>/g;
        const matches: string[] = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push(match[1]);
        }

        if (matches.length > 0) {
            vscode.window.showInformationMessage(
                `Code Import Links: Found ${matches.length} code-import paths:\n${matches.slice(0, 3).join('\n')}${matches.length > 3 ? '\n...' : ''}`
            );
        } else {
            vscode.window.showInformationMessage('Code Import Links: No code-import tags found in current file');
        }
    });

    context.subscriptions.push(testCommand);

    console.log('Code Import Links: Extension activated successfully!');
}

export function deactivate() {
    console.log('Code Import Links: Extension deactivated');
}

