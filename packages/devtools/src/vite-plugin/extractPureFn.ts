/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as ts from 'typescript';
import {createHash} from 'crypto';
import {transformSync} from 'esbuild';
import {ExtractedPureFn, ServerPureFunctionsOptions} from './types.ts';
import {ALLOWED_GLOBALS, BODY_HASH_LENGTH, FORBIDDEN_IDENTIFIERS, PURE_SERVER_FN_NAMESPACE} from './constants.ts';
import {readdirSync, statSync, readFileSync} from 'fs';
import {resolve, join} from 'path/posix';
import {isIncluded} from './mionVitePlugin.ts';

/** Scans the client source directory and extracts all pure functions */
export function scanClientSource(options: ServerPureFunctionsOptions): ExtractedPureFn[] {
    const include = options.include || ['**/*.ts', '**/*.tsx'];
    const exclude = options.exclude || ['**/node_modules/**', '**/.dist/**', '**/dist/**'];
    const clientSrcPath = resolve(options.clientSrcPath);
    const fns: ExtractedPureFn[] = [];

    function scanDir(dir: string) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip excluded directories
                if (!isIncluded(fullPath + '/', include, exclude)) continue;
                scanDir(fullPath);
            } else if (stat.isFile()) {
                // Only process included files
                if (!isIncluded(fullPath, include, exclude)) continue;

                try {
                    const code = readFileSync(fullPath, 'utf-8');
                    // Quick check: does this file contain pureServerFn?
                    if (!code.includes('pureServerFn')) continue;

                    const extracted = extractPureFnsFromSource(code, fullPath);
                    fns.push(...extracted);
                } catch (err: any) {
                    // Log but don't fail - some files might not be parseable
                    console.warn(`[mion-pure-functions] Warning: Could not parse ${fullPath}: ${err.message}`);
                }
            }
        }
    }

    scanDir(clientSrcPath);
    return fns;
}

/** Extracts all calls to the given function name from a source file using AST */
export function extractPureFnsFromSource(source: string, filePath: string, fnName = 'pureServerFn'): ExtractedPureFn[] {
    const results: ExtractedPureFn[] = [];

    // Quick check: does this file even contain the target function?
    if (!source.includes(fnName)) return results;

    // First, strip TypeScript types to get clean JavaScript
    const jsSource = stripTypes(source);

    // Parse the JavaScript into an AST
    const sourceFile = ts.createSourceFile(filePath, jsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

    // Visit all nodes and extract pure functions
    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            if (ts.isIdentifier(callee) && callee.text === fnName) {
                if (fnName === 'registerPureFnFactory') {
                    const extracted = extractDataFromRegisterPureFnFactoryAST(node, sourceFile, filePath);
                    results.push(extracted);
                } else {
                    const extracted = extractDataFromPureFnDefAST(node, sourceFile, filePath);
                    results.push(extracted);
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return results;
}

/**
 * Strips TypeScript type annotations from code, returning pure JavaScript.
 * Uses esbuild instead of ts.transpileModule to avoid deepkit type compiler patches
 * that would inject __assignType artifacts into the output.
 */
export function stripTypes(code: string): string {
    try {
        const result = transformSync(code, {
            loader: 'ts',
            target: 'esnext',
            minify: false,
        });
        return result.code.trim();
    } catch (err: any) {
        // esbuild errors (e.g. await in non-async) are transformed to PurityError
        // so the extraction pipeline has a consistent error type
        throw new PurityError(err.message || String(err), '<esbuild>', 0);
    }
}

/** Extracts a single PureFnDef from a pureServerFn() call expression */
function extractDataFromPureFnDefAST(call: ts.CallExpression, sourceFile: ts.SourceFile, filePath: string): ExtractedPureFn {
    // Accept 1 or 2 arguments: pureServerFn(fnOrDef) or pureServerFn(fnOrDef, 'bodyHash') (already transformed)
    if (call.arguments.length < 1 || call.arguments.length > 2) {
        throw new PurityError(
            'pureServerFn() requires 1 or 2 arguments: a function/PureFnDef and an optional bodyHash string',
            filePath,
            call.getStart(sourceFile)
        );
    }

    let arg = call.arguments[0];

    // If the argument is a variable reference, resolve it to its initializer
    if (ts.isIdentifier(arg)) {
        const resolved = resolveVariableInitializer(arg.text, sourceFile);
        if (!resolved) {
            throw new PurityError(
                `pureServerFn() argument "${arg.text}" could not be resolved to a variable declaration in this file`,
                filePath,
                arg.getStart(sourceFile)
            );
        }
        arg = resolved;
    }

    // Plain function shorthand: pureServerFn((x) => x + 1) or pureServerFn(function myFn(x) { ... })
    if (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg)) {
        return buildExtractedPureFn(arg, PURE_SERVER_FN_NAMESPACE, undefined, false, sourceFile, filePath);
    }

    // Full PureFnDef object: pureServerFn({ pureFn: ..., namespace: ..., fnName: ... })
    if (ts.isObjectLiteralExpression(arg)) {
        return extractPureFnDefFromObjectLiteral(arg, sourceFile, filePath);
    }

    throw new PurityError(
        'pureServerFn() first argument must be a function, an object literal (PureFnDef), or a variable referencing one',
        filePath,
        call.arguments[0].getStart(sourceFile)
    );
}

/** Extracts data from a registerPureFnFactory(namespace, functionID, factoryFn) call expression */
function extractDataFromRegisterPureFnFactoryAST(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile,
    filePath: string
): ExtractedPureFn {
    // Accept 3 or 4 arguments: registerPureFnFactory(ns, id, fn) or registerPureFnFactory(ns, id, fn, parsedFn)
    if (call.arguments.length < 3 || call.arguments.length > 4) {
        throw new PurityError(
            'registerPureFnFactory() requires 3 or 4 arguments: namespace, functionID, factoryFn, and optional parsedFn',
            filePath,
            call.getStart(sourceFile)
        );
    }

    // 1st arg: namespace (string literal)
    const nsArg = call.arguments[0];
    if (!ts.isStringLiteral(nsArg)) {
        throw new PurityError(
            'registerPureFnFactory() first argument (namespace) must be a string literal',
            filePath,
            nsArg.getStart(sourceFile)
        );
    }
    const namespace = nsArg.text;

    // 2nd arg: functionID (string literal)
    const idArg = call.arguments[1];
    if (!ts.isStringLiteral(idArg)) {
        throw new PurityError(
            'registerPureFnFactory() second argument (functionID) must be a string literal',
            filePath,
            idArg.getStart(sourceFile)
        );
    }
    const fnName = idArg.text;

    // 3rd arg: factoryFn (function expression or arrow function)
    const fnArg = call.arguments[2];
    if (!ts.isFunctionExpression(fnArg) && !ts.isArrowFunction(fnArg)) {
        throw new PurityError(
            'registerPureFnFactory() third argument (factoryFn) must be a function expression or arrow function',
            filePath,
            fnArg.getStart(sourceFile)
        );
    }

    // Extract parameter names
    const paramNames = fnArg.parameters.map((param) => {
        if (!ts.isIdentifier(param.name)) {
            throw new PurityError(
                'Factory function parameters must be simple identifiers (no destructuring)',
                filePath,
                param.getStart(sourceFile)
            );
        }
        return param.name.text;
    });

    // Get the function body
    const bodyNode = fnArg.body;
    const bodyText = getBodyText(bodyNode, sourceFile);

    // Normalize body for hashing (collapse whitespace)
    const normalizedBody = bodyText.replace(/[ \t]+/g, ' ').trim();
    const bodyHash = createHash('sha256')
        .update(namespace + fnName + normalizedBody)
        .digest('base64url')
        .slice(0, BODY_HASH_LENGTH);

    return {
        namespace,
        fnName,
        paramNames,
        fnBody: bodyText,
        bodyHash,
        dependencies: new Set(),
        sourceFile: filePath,
        isFactory: true, // registerPureFnFactory always registers factory functions
    };
}

/** Resolves a variable name to its initializer expression within the source file */
function resolveVariableInitializer(name: string, sourceFile: ts.SourceFile): ts.Expression | undefined {
    let result: ts.Expression | undefined;

    function visit(node: ts.Node): void {
        if (result) return;
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
            result = node.initializer;
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return result;
}

/** Extracts PureFnDef data from an object literal AST node */
function extractPureFnDefFromObjectLiteral(
    objLiteral: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    filePath: string
): ExtractedPureFn {
    let pureFn: ts.FunctionExpression | ts.ArrowFunction | undefined;
    let namespace: string = PURE_SERVER_FN_NAMESPACE;
    let fnName: string | undefined;
    let isFactory = false;

    // Extract properties from the object literal
    for (const prop of objLiteral.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;

        const propName = ts.isIdentifier(prop.name) ? prop.name.text : undefined;
        if (!propName) continue;

        switch (propName) {
            case 'pureFn': {
                const initializer = prop.initializer;
                if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
                    pureFn = initializer;
                } else {
                    throw new PurityError(
                        'pureFn property must be a function expression or arrow function',
                        filePath,
                        prop.initializer.getStart(sourceFile)
                    );
                }
                break;
            }
            case 'namespace':
                if (ts.isStringLiteral(prop.initializer)) {
                    namespace = prop.initializer.text;
                } else {
                    throw new PurityError(
                        'namespace property must be a string literal',
                        filePath,
                        prop.initializer.getStart(sourceFile)
                    );
                }
                break;
            case 'fnName':
                if (ts.isStringLiteral(prop.initializer)) {
                    fnName = prop.initializer.text;
                } else {
                    throw new PurityError(
                        'fnName property must be a string literal',
                        filePath,
                        prop.initializer.getStart(sourceFile)
                    );
                }
                break;
            case 'isFactory':
                if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                    isFactory = true;
                } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
                    isFactory = false;
                } else {
                    throw new PurityError(
                        'isFactory property must be a boolean literal',
                        filePath,
                        prop.initializer.getStart(sourceFile)
                    );
                }
                break;
        }
    }

    if (!pureFn) {
        throw new PurityError('PureFnDef must have a pureFn property', filePath, objLiteral.getStart(sourceFile));
    }

    // For PureFnDef path: if no explicit fnName, try function.name fallback (set to 'useFunction' sentinel)
    const explicitFnName = fnName ?? (ts.isFunctionExpression(pureFn) && pureFn.name ? pureFn.name.text : undefined);
    return buildExtractedPureFn(pureFn, namespace, explicitFnName, isFactory, sourceFile, filePath);
}

/** Common extraction logic: validates purity, computes hash, builds ExtractedPureFn */
function buildExtractedPureFn(
    fnNode: ts.FunctionExpression | ts.ArrowFunction,
    namespace: string,
    explicitFnName: string | undefined,
    isFactory: boolean,
    sourceFile: ts.SourceFile,
    filePath: string
): ExtractedPureFn {
    // Extract parameter names
    const paramNames = fnNode.parameters.map((param) => {
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
    const bodyNode = fnNode.body;

    // Validate purity (skip for factory functions as they receive jitUtils)
    if (!isFactory) {
        validatePurity(bodyNode, new Set(paramNames), explicitFnName, sourceFile, filePath);
    } else {
        validateFactoryPurity(bodyNode, new Set(paramNames), explicitFnName, sourceFile, filePath);
    }

    // Get the body text
    const bodyText = getBodyText(bodyNode, sourceFile);

    // Normalize body for hashing (collapse whitespace)
    const normalizedBody = bodyText.replace(/[ \t]+/g, ' ').trim();
    const bodyHash = createHash('sha256')
        .update(namespace + normalizedBody)
        .digest('base64url')
        .slice(0, BODY_HASH_LENGTH);

    // Use explicit fnName if provided, otherwise default to bodyHash
    const fnName = explicitFnName || bodyHash;

    return {
        namespace,
        fnName,
        paramNames,
        fnBody: bodyText,
        bodyHash,
        dependencies: new Set(),
        sourceFile: filePath,
        isFactory,
    };
}

/** Gets the body text from a function body node */
function getBodyText(body: ts.Node, sourceFile: ts.SourceFile): string {
    if (ts.isBlock(body)) {
        // Block body: { statements }
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

/** Validates factory function purity - more relaxed than regular pure functions */
function validateFactoryPurity(
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
            throw new PurityError("'this' is not allowed in factory functions", filePath, node.getStart(sourceFile));
        }

        // Check for 'await' expression
        if (ts.isAwaitExpression(node)) {
            throw new PurityError('async/await is not allowed in factory functions', filePath, node.getStart(sourceFile));
        }

        // Check for 'yield' keyword
        if (node.kind === ts.SyntaxKind.YieldKeyword) {
            throw new PurityError('generators are not allowed in factory functions', filePath, node.getStart(sourceFile));
        }

        // Check for dynamic import
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            throw new PurityError('Dynamic import() is not allowed in factory functions', filePath, node.getStart(sourceFile));
        }

        // Check for identifier references - but allow more globals for factory functions
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
                ts.forEachChild(node, checkNode);
                return;
            }

            // Check for forbidden identifiers (but not all - factory functions have more access)
            const factoryForbidden = new Set(['eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket']);
            if (factoryForbidden.has(name)) {
                throw new PurityError(`${name} is not allowed in factory functions`, filePath, node.getStart(sourceFile));
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
            return;
        }

        // Function expressions: const foo = function bar() {}
        if (ts.isFunctionExpression(n) && n.name) {
            scope.add(n.name.text);
            n.parameters.forEach((p) => collectBindingNames(p.name, scope));
            return;
        }

        // Arrow functions: (x) => ...
        if (ts.isArrowFunction(n)) {
            n.parameters.forEach((p) => collectBindingNames(p.name, scope));
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
