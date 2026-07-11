"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * Provides clickable links for code-import path attributes in markdown files.
 * Matches: <code-import path="packages/examples/src/..." ... />
 */
class CodeImportLinkProvider {
    provideDocumentLinks(document, _token) {
        const links = [];
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
        let match;
        while ((match = pathRegex.exec(text)) !== null) {
            const fullMatch = match[0];
            const filePath = match[1];
            // Find the position of the path value within the match
            const pathAttrMatch = fullMatch.match(/path=["']([^"']+)["']/);
            if (!pathAttrMatch)
                continue;
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
    findMonorepoRoot(startDir) {
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
            }
            catch {
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
function activate(context) {
    console.log('Code Import Links: Extension is activating...');
    const linkProvider = new CodeImportLinkProvider();
    // Register for markdown files using multiple selectors
    const selectors = [
        { scheme: 'file', language: 'markdown' },
        { scheme: 'file', pattern: '**/*.md' },
        { scheme: 'untitled', language: 'markdown' },
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
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push(match[1]);
        }
        if (matches.length > 0) {
            vscode.window.showInformationMessage(`Code Import Links: Found ${matches.length} code-import paths:\n${matches.slice(0, 3).join('\n')}${matches.length > 3 ? '\n...' : ''}`);
        }
        else {
            vscode.window.showInformationMessage('Code Import Links: No code-import tags found in current file');
        }
    });
    context.subscriptions.push(testCommand);
    console.log('Code Import Links: Extension activated successfully!');
}
function deactivate() {
    console.log('Code Import Links: Extension deactivated');
}
//# sourceMappingURL=extension.js.map