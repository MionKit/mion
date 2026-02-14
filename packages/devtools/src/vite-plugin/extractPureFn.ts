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

/** Extracts all pureServerFn() and pureServerFnGroup() calls from a source file using AST */
export function extractPureFnsFromSource(source: string, filePath: string): ExtractedPureFn[] {
    const results: ExtractedPureFn[] = [];

    // Quick check: does this file even contain pureServerFn?
    if (!source.includes('pureServerFn') && !source.includes('pureServerFnGroup')) return results;

    // First, strip TypeScript types to get clean JavaScript
    const jsSource = stripTypes(source);

    // Parse the JavaScript into an AST
    const sourceFile = ts.createSourceFile(filePath, jsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

    // Visit all nodes and extract pure functions
    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            if (ts.isIdentifier(callee)) {
                if (callee.text === 'pureServerFn') {
                    const extracted = extractDataFromPureFnDefAST(node, sourceFile, filePath);
                    results.push(extracted);
                } else if (callee.text === 'pureServerFnGroup') {
                    const extracted = extractDataFromPureFnDefListAST(node, sourceFile, filePath);
                    results.push(...extracted);
                }
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
            removeComments: true,
            importHelpers: false,
            newLine: ts.NewLineKind.LineFeed,
        },
        // Disable deepkit type compiler transformations
        transformers: {},
    });
    return result.outputText.trim();
}

/** Extracts a single PureFnDef from a pureServerFn() call expression */
function extractDataFromPureFnDefAST(call: ts.CallExpression, sourceFile: ts.SourceFile, filePath: string): ExtractedPureFn {
    if (call.arguments.length !== 1) {
        throw new PurityError(
            'pureServerFn() requires exactly 1 argument: a PureFnDef object',
            filePath,
            call.getStart(sourceFile)
        );
    }

    const objArg = call.arguments[0];
    if (!ts.isObjectLiteralExpression(objArg)) {
        throw new PurityError(
            'pureServerFn() argument must be an object literal (PureFnDef)',
            filePath,
            objArg.getStart(sourceFile)
        );
    }

    return extractPureFnDefFromObjectLiteral(objArg, sourceFile, filePath);
}

/** Extracts a list of PureFnDef from a pureServerFnGroup() call expression */
function extractDataFromPureFnDefListAST(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile,
    filePath: string
): ExtractedPureFn[] {
    if (call.arguments.length !== 1) {
        throw new PurityError(
            'pureServerFnGroup() requires exactly 1 argument: an array of PureFnDef objects',
            filePath,
            call.getStart(sourceFile)
        );
    }

    const arrayArg = call.arguments[0];
    if (!ts.isArrayLiteralExpression(arrayArg)) {
        throw new PurityError(
            'pureServerFnGroup() argument must be an array literal (tuple), not a dynamic array',
            filePath,
            arrayArg.getStart(sourceFile)
        );
    }

    const fns: ExtractedPureFn[] = [];
    for (const element of arrayArg.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
            throw new PurityError(
                'pureServerFnGroup() array elements must be object literals (PureFnDef)',
                filePath,
                element.getStart(sourceFile)
            );
        }
        fns.push(extractPureFnDefFromObjectLiteral(element, sourceFile, filePath));
    }

    // Add cross-dependencies to all extracted functions
    const allKeys = fns.map((fn) => `${fn.namespace}::${fn.fnName}`);
    for (const fn of fns) {
        const ownKey = `${fn.namespace}::${fn.fnName}`;
        fn.dependencies = allKeys.filter((key) => key !== ownKey);
    }

    return fns;
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
                // Extract function from property initializer
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

    // Extract parameter names
    const paramNames = pureFn.parameters.map((param) => {
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
    const bodyNode = pureFn.body;

    // Validate purity (skip for factory functions as they receive jitUtils)
    if (!isFactory) {
        validatePurity(bodyNode, new Set(paramNames), fnName, sourceFile, filePath);
    } else {
        validateFactoryPurity(bodyNode, new Set(paramNames), fnName, sourceFile, filePath);
    }

    // Get the body text
    const bodyText = getBodyText(bodyNode, sourceFile);

    // Normalize body for hashing
    const normalizedBody = normalizePureFnBody(bodyText);
    const bodyHash = createUniqueHash(namespace + normalizedBody, pureFnHashLength);

    // If no fnName, try to get from function name or use bodyHash
    if (!fnName) {
        if (ts.isFunctionExpression(pureFn) && pureFn.name) {
            fnName = pureFn.name.text;
        } else {
            fnName = bodyHash;
        }
    }

    return {
        namespace,
        fnName,
        paramNames,
        code: bodyText,
        bodyHash,
        dependencies: [],
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
