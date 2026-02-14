/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as ts from 'typescript';
import {ExtractedPureFn} from './types.ts';
import {createUniqueHash, pureFnHashLength, normalizePureFnBody, PURE_SERVER_FN_NAMESPACE} from './pureFnUtils.ts';
import {ALLOWED_GLOBALS, FORBIDDEN_IDENTIFIERS} from './constants.ts';

/** Extracts all pureServerFn() calls from a source file using AST */
export function extractPureFnsFromSource(source: string, filePath: string): ExtractedPureFn[] {
    const results: ExtractedPureFn[] = [];

    // Quick check: does this file even contain pureServerFn?
    if (!source.includes('pureServerFn')) return results;

    // First, strip TypeScript types to get clean JavaScript
    const jsSource = stripTypes(source);

    // Parse the JavaScript into an AST
    const sourceFile = ts.createSourceFile(filePath, jsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

    // Visit all nodes to find pureServerFn() calls
    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            if (ts.isIdentifier(callee) && callee.text === 'pureServerFn') {
                const extracted = extractPureFnFromCall(node, sourceFile, filePath);
                results.push(extracted);
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return results;
}

/** Strips TypeScript type annotations from code, returning pure JavaScript */
export function stripTypes(code: string): string {
    const result = ts.transpileModule(code, {
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            // Remove comments to get cleaner output
            removeComments: true,
            // Don't emit helpers
            importHelpers: false,
            // Preserve newlines for readability
            newLine: ts.NewLineKind.LineFeed,
        },
    });
    return result.outputText.trim();
}

/** Extracts a pure function from a pureServerFn() call expression */
function extractPureFnFromCall(call: ts.CallExpression, sourceFile: ts.SourceFile, filePath: string): ExtractedPureFn {
    if (call.arguments.length !== 1) {
        throw new PurityError('pureServerFn() requires exactly one function argument', filePath, call.getStart(sourceFile));
    }

    const arg = call.arguments[0];

    // Must be a function expression (named or arrow)
    if (!ts.isFunctionExpression(arg) && !ts.isArrowFunction(arg)) {
        throw new PurityError(
            'pureServerFn() argument must be a function expression or arrow function',
            filePath,
            arg.getStart(sourceFile)
        );
    }

    // Extract function name (optional - for debugging purposes)
    let fnName: string | undefined;
    if (ts.isFunctionExpression(arg) && arg.name) {
        fnName = arg.name.text;
    } else if (ts.isArrowFunction(arg)) {
        // Arrow function - try to get name from parent variable declaration (optional)
        fnName = tryGetArrowFunctionName(arg);
    }

    // Extract parameter names
    const paramNames = arg.parameters.map((param) => {
        if (!ts.isIdentifier(param.name)) {
            throw new PurityError(
                'Pure function parameters must be simple identifiers (no destructuring)',
                filePath,
                param.getStart(sourceFile)
            );
        }
        return param.name.text;
    });

    // Get the function body
    const bodyNode = arg.body;

    // Validate purity by traversing the body AST
    validatePurity(bodyNode, new Set(paramNames), fnName, sourceFile, filePath);

    // Get the body text (already JavaScript, no types to strip)
    const bodyText = getBodyText(bodyNode, sourceFile);

    // Normalize body for hashing (collapse whitespace)
    // Hash is computed from namespace + body only (no fnName) for consistent identification
    const normalizedBody = normalizePureFnBody(bodyText);
    const bodyHash = createUniqueHash(PURE_SERVER_FN_NAMESPACE + normalizedBody, pureFnHashLength);

    return {
        fnName, // Optional - for debugging purposes
        paramNames,
        code: bodyText,
        bodyHash,
        dependencies: [],
        sourceFile: filePath,
    };
}

/** Tries to get the name of an arrow function from its parent variable declaration (returns undefined if not found) */
function tryGetArrowFunctionName(arrow: ts.ArrowFunction): string | undefined {
    // Walk up to find variable declaration
    let parent = arrow.parent;
    while (parent) {
        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
            return parent.name.text;
        }
        if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
            return parent.name.text;
        }
        parent = parent.parent;
    }
    return undefined; // Anonymous function - that's OK now
}

/** Gets the body text from a function body node */
function getBodyText(body: ts.Node, sourceFile: ts.SourceFile): string {
    if (ts.isBlock(body)) {
        // Block body: { statements }
        // Get the text without the braces
        const fullText = body.getText(sourceFile);
        return fullText.slice(1, -1).trim();
    } else {
        // Expression body (arrow function): return the expression wrapped in return
        return `return ${body.getText(sourceFile)}`;
    }
}

/** Validates that a function body is pure by traversing its AST */
function validatePurity(
    body: ts.Node,
    localScope: Set<string>,
    fnName: string | undefined,
    sourceFile: ts.SourceFile,
    filePath: string
): void {
    // Collect all locally declared variables
    collectLocalDeclarations(body, localScope);

    // Add the function name to local scope (for recursion) if it exists
    if (fnName) localScope.add(fnName);

    // Traverse the AST and check for purity violations
    function checkNode(node: ts.Node): void {
        // Check for 'this' keyword
        if (node.kind === ts.SyntaxKind.ThisKeyword) {
            throw new PurityError("'this' is not allowed in pure functions", filePath, node.getStart(sourceFile));
        }

        // Check for 'await' expression
        if (ts.isAwaitExpression(node)) {
            throw new PurityError('async/await is not allowed in pure functions', filePath, node.getStart(sourceFile));
        }

        // Check for 'yield' keyword
        if (node.kind === ts.SyntaxKind.YieldKeyword) {
            throw new PurityError('generators are not allowed in pure functions', filePath, node.getStart(sourceFile));
        }

        // Check for dynamic import
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            throw new PurityError('Dynamic import() is not allowed in pure functions', filePath, node.getStart(sourceFile));
        }

        // Check for identifier references
        if (ts.isIdentifier(node)) {
            const name = node.text;

            // Skip if it's a property access (e.g., obj.prop - we only care about 'obj')
            if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
                ts.forEachChild(node, checkNode);
                return;
            }

            // Skip if it's a property name in object literal
            if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) {
                ts.forEachChild(node, checkNode);
                return;
            }

            // Skip if it's a shorthand property assignment name
            if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
                // But we still need to check the value reference
                if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
                    throw new PurityError(
                        `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
                        filePath,
                        node.getStart(sourceFile)
                    );
                }
                ts.forEachChild(node, checkNode);
                return;
            }

            // Check for forbidden identifiers
            if (FORBIDDEN_IDENTIFIERS.has(name)) {
                throw new PurityError(`${name} is not allowed in pure functions`, filePath, node.getStart(sourceFile));
            }

            // Check for closure variables (not local, not allowed global)
            if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
                throw new PurityError(
                    `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
                    filePath,
                    node.getStart(sourceFile)
                );
            }
        }

        ts.forEachChild(node, checkNode);
    }

    checkNode(body);
}

/** Collects all locally declared variable names from a node */
function collectLocalDeclarations(node: ts.Node, scope: Set<string>): void {
    function visit(n: ts.Node): void {
        // Variable declarations: const x = ..., let y = ..., var z = ...
        if (ts.isVariableDeclaration(n)) {
            collectBindingNames(n.name, scope);
        }

        // Function declarations: function foo() {}
        if (ts.isFunctionDeclaration(n) && n.name) {
            scope.add(n.name.text);
            // Don't recurse into function body - it has its own scope
            return;
        }

        // Function expressions: const foo = function bar() {}
        if (ts.isFunctionExpression(n) && n.name) {
            scope.add(n.name.text);
            // Collect parameters
            n.parameters.forEach((p) => collectBindingNames(p.name, scope));
            // Don't recurse into function body - it has its own scope
            return;
        }

        // Arrow functions: (x) => ...
        if (ts.isArrowFunction(n)) {
            // Collect parameters
            n.parameters.forEach((p) => collectBindingNames(p.name, scope));
            // Don't recurse into function body - it has its own scope
            return;
        }

        // For-of/for-in loop variables
        if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {
            if (ts.isVariableDeclarationList(n.initializer)) {
                n.initializer.declarations.forEach((d) => collectBindingNames(d.name, scope));
            }
        }

        // Catch clause variable
        if (ts.isCatchClause(n) && n.variableDeclaration) {
            collectBindingNames(n.variableDeclaration.name, scope);
        }

        ts.forEachChild(n, visit);
    }

    visit(node);
}

/** Collects binding names from a binding pattern (handles destructuring) */
function collectBindingNames(name: ts.BindingName, scope: Set<string>): void {
    if (ts.isIdentifier(name)) {
        scope.add(name.text);
    } else if (ts.isObjectBindingPattern(name)) {
        name.elements.forEach((el) => collectBindingNames(el.name, scope));
    } else if (ts.isArrayBindingPattern(name)) {
        name.elements.forEach((el) => {
            if (ts.isBindingElement(el)) {
                collectBindingNames(el.name, scope);
            }
        });
    }
}

/** Error thrown when a purity violation is detected */
export class PurityError extends Error {
    constructor(
        message: string,
        public readonly filePath: string,
        public readonly position: number
    ) {
        super(`${message} (in ${filePath} at position ${position})`);
        this.name = 'PurityError';
    }
}
