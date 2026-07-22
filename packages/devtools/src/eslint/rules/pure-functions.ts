/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';
import {ALLOWED_GLOBALS, FORBIDDEN_IDENTIFIERS, PURE_FN_SOURCE_PACKAGES} from '../../pureFns/purityRules.ts';

type MessageIds =
    | 'purityThis'
    | 'purityAwait'
    | 'purityYield'
    | 'purityDynamicImport'
    | 'purityForbiddenIdentifier'
    | 'purityClosureVariable'
    | 'importedArgument'
    | 'unresolvedArgument';

/** Cache of pure function imports from @mionjs/client and @mionjs/core */
interface PureFnImports {
    /** Maps local name -> imported name for serverMapFrom/registerMionPureFn */
    pureFnNames: Map<string, string>;
}

/** Builds a cache of pure function imports from @mionjs/client and @mionjs/core */
function buildPureFnImportCache(program: TSESTree.Program): PureFnImports {
    const pureFnNames = new Map<string, string>();

    for (const statement of program.body) {
        if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;
        const source = statement.source.value;
        if (!PURE_FN_SOURCE_PACKAGES.includes(source as (typeof PURE_FN_SOURCE_PACKAGES)[number])) continue;

        for (const specifier of statement.specifiers) {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier) {
                const importedName = specifier.imported.name;
                if (importedName === 'serverMapFrom' || importedName === 'registerMionPureFn') {
                    pureFnNames.set(specifier.local.name, importedName);
                }
            }
        }
    }

    return {pureFnNames};
}

/** Collects all binding names from a pattern (handles destructuring) */
function collectBindingNames(node: TSESTree.Node, scope: Set<string>): void {
    switch (node.type) {
        case AST_NODE_TYPES.Identifier:
            scope.add(node.name);
            break;
        case AST_NODE_TYPES.ObjectPattern:
            for (const prop of node.properties) {
                if (prop.type === AST_NODE_TYPES.Property) {
                    collectBindingNames(prop.value, scope);
                } else if (prop.type === AST_NODE_TYPES.RestElement) {
                    collectBindingNames(prop.argument, scope);
                }
            }
            break;
        case AST_NODE_TYPES.ArrayPattern:
            for (const element of node.elements) {
                if (element) collectBindingNames(element, scope);
            }
            break;
        case AST_NODE_TYPES.RestElement:
            collectBindingNames(node.argument, scope);
            break;
        case AST_NODE_TYPES.AssignmentPattern:
            collectBindingNames(node.left, scope);
            break;
    }
}

/** Collects all locally declared variable names from a node tree */
function collectLocalDeclarations(node: TSESTree.Node, scope: Set<string>): void {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
        collectBindingNames(node.id, scope);
    }

    if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
        if (node.id) scope.add(node.id.name);
        for (const param of node.params) collectBindingNames(param, scope);
    }

    if (node.type === AST_NODE_TYPES.FunctionExpression) {
        if (node.id) scope.add(node.id.name);
        for (const param of node.params) collectBindingNames(param, scope);
    }

    if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        for (const param of node.params) collectBindingNames(param, scope);
    }

    if (
        (node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement) &&
        node.left.type === AST_NODE_TYPES.VariableDeclaration
    ) {
        for (const decl of node.left.declarations) {
            collectBindingNames(decl.id, scope);
        }
    }

    if (node.type === AST_NODE_TYPES.CatchClause && node.param) {
        collectBindingNames(node.param, scope);
    }

    // Recurse into children
    for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
                for (const item of child) {
                    if (item && typeof item === 'object' && 'type' in item) {
                        collectLocalDeclarations(item as TSESTree.Node, scope);
                    }
                }
            } else if ('type' in child) {
                collectLocalDeclarations(child as TSESTree.Node, scope);
            }
        }
    }
}

/** Collects the full local scope for a function node */
function collectLocalScope(fnNode: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): Set<string> {
    const scope = new Set<string>();

    // Add parameter names
    for (const param of fnNode.params) {
        collectBindingNames(param, scope);
    }

    // Add function name (for recursion)
    if (fnNode.type === AST_NODE_TYPES.FunctionExpression && fnNode.id) {
        scope.add(fnNode.id.name);
    }

    // Walk body collecting declarations
    collectLocalDeclarations(fnNode.body, scope);

    return scope;
}

/** Checks purity violations by traversing the function body AST */
function checkPurityViolations(
    body: TSESTree.Node,
    localScope: Set<string>,
    fnTypeLabel: string,
    context: TSESLint.RuleContext<MessageIds, []>
): void {
    const forbiddenSet = FORBIDDEN_IDENTIFIERS;

    function visit(node: TSESTree.Node): void {
        if (node.type === AST_NODE_TYPES.ThisExpression) {
            context.report({node, messageId: 'purityThis', data: {fnType: fnTypeLabel}});
        }

        if (node.type === AST_NODE_TYPES.AwaitExpression) {
            context.report({node, messageId: 'purityAwait', data: {fnType: fnTypeLabel}});
        }

        if (node.type === AST_NODE_TYPES.YieldExpression) {
            context.report({node, messageId: 'purityYield', data: {fnType: fnTypeLabel}});
        }

        if (node.type === AST_NODE_TYPES.ImportExpression) {
            context.report({node, messageId: 'purityDynamicImport', data: {fnType: fnTypeLabel}});
        }

        if (node.type === AST_NODE_TYPES.Identifier) {
            const name = node.name;

            // Skip non-computed property access (obj.prop — only check 'obj')
            if (node.parent?.type === AST_NODE_TYPES.MemberExpression && node.parent.property === node && !node.parent.computed) {
                return;
            }

            // Skip non-computed, non-shorthand property keys in object literals
            if (
                node.parent?.type === AST_NODE_TYPES.Property &&
                node.parent.key === node &&
                !node.parent.computed &&
                !node.parent.shorthand
            ) {
                return;
            }

            // Check forbidden identifiers
            if (forbiddenSet.has(name)) {
                context.report({
                    node,
                    messageId: 'purityForbiddenIdentifier',
                    data: {name, fnType: fnTypeLabel},
                });
                return;
            }

            // Check for closure variables (not local, not allowed global)
            if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
                context.report({
                    node,
                    messageId: 'purityClosureVariable',
                    data: {name, fnType: fnTypeLabel},
                });
            }
        }

        // Recurse into children (skip type-only AST subtrees)
        for (const key of Object.keys(node)) {
            if (
                key === 'parent' ||
                key === 'typeAnnotation' ||
                key === 'returnType' ||
                key === 'typeParameters' ||
                key === 'typeArguments'
            )
                continue;
            const child = (node as unknown as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    for (const item of child) {
                        if (item && typeof item === 'object' && 'type' in item) {
                            visit(item as TSESTree.Node);
                        }
                    }
                } else if ('type' in child) {
                    visit(child as TSESTree.Node);
                }
            }
        }
    }

    visit(body);
}

/** Resolves a variable identifier to its initializer expression within the same module (searches all scopes) */
function resolveVariableInitializer(name: string, program: TSESTree.Program): TSESTree.Expression | null {
    function search(node: TSESTree.Node): TSESTree.Expression | null {
        if (node.type === AST_NODE_TYPES.VariableDeclarator) {
            if (node.id.type === AST_NODE_TYPES.Identifier && node.id.name === name && node.init) {
                return node.init;
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'parent') continue;
            const child = (node as unknown as Record<string, unknown>)[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    for (const item of child) {
                        if (item && typeof item === 'object' && 'type' in item) {
                            const result = search(item as TSESTree.Node);
                            if (result) return result;
                        }
                    }
                } else if ('type' in child) {
                    const result = search(child as TSESTree.Node);
                    if (result) return result;
                }
            }
        }
        return null;
    }
    return search(program);
}

/** Extracts a function or object expression from a node, resolving variable references */
function resolveToExpression(node: TSESTree.Node, program: TSESTree.Program): TSESTree.Expression | null {
    if (node.type === AST_NODE_TYPES.Identifier) {
        return resolveVariableInitializer(node.name, program);
    }
    return node as TSESTree.Expression;
}

/** Checks if an identifier name is an import from any module */
function isImportedIdentifier(name: string, program: TSESTree.Program): boolean {
    for (const statement of program.body) {
        if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;
        for (const specifier of statement.specifiers) {
            if (specifier.local.name === name) return true;
        }
    }
    return false;
}

/** Finds the unresolved identifier in a pure function argument */
function findUnresolvedIdentifier(arg: TSESTree.Node): {name: string; node: TSESTree.Node} | null {
    // Direct identifier: serverMapFrom(source, myFn) or registerMionPureFn('name', myFn)
    if (arg.type === AST_NODE_TYPES.Identifier) return {name: arg.name, node: arg};
    return null;
}

/** Reports an error when a pure function argument cannot be resolved */
function reportUnresolvedArgument(
    node: TSESTree.CallExpression,
    callee: string,
    program: TSESTree.Program,
    context: TSESLint.RuleContext<MessageIds, []>
): void {
    const argIndex = 1;
    const arg = node.arguments[argIndex];
    if (!arg) return;

    const identifierToCheck = findUnresolvedIdentifier(arg);
    if (!identifierToCheck) return;

    const name = identifierToCheck.name;
    const reportNode = identifierToCheck.node;

    if (isImportedIdentifier(name, program)) {
        context.report({node: reportNode, messageId: 'importedArgument', data: {callee, name}});
    } else {
        context.report({node: reportNode, messageId: 'unresolvedArgument', data: {callee, name}});
    }
}

/** Extracts the factory function from a registerMionPureFn() call */
function extractRegisterMionPureFnTarget(
    node: TSESTree.CallExpression,
    program: TSESTree.Program
): {fnNode: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression; isFactory: true} | null {
    // registerMionPureFn(name, factory) - factory is the 2nd argument
    const fnArg = node.arguments[1];
    if (!fnArg) return null;

    // Resolve variable reference if needed
    const resolved = resolveToExpression(fnArg, program);
    if (!resolved) return null;

    if (resolved.type === AST_NODE_TYPES.FunctionExpression || resolved.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return {fnNode: resolved, isFactory: true};
    }

    return null;
}

/** Extracts the mapper function from a serverMapFrom(source, mapper) call */
function extractMapFromMapperTarget(
    node: TSESTree.CallExpression,
    program: TSESTree.Program
): {fnNode: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression; isFactory: boolean} | null {
    // serverMapFrom(source, mapper) - mapper is the 2nd argument
    const mapperArg = node.arguments[1];
    if (!mapperArg) return null;

    const resolved = resolveToExpression(mapperArg, program);
    if (!resolved) return null;

    if (resolved.type === AST_NODE_TYPES.FunctionExpression || resolved.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return {fnNode: resolved, isFactory: false};
    }

    return null;
}

const rule: TSESLint.RuleModule<MessageIds, []> = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Validate that functions passed to serverMapFrom() and registerMionPureFn() are pure and do not use forbidden identifiers, closures, or side effects.',
        },
        messages: {
            purityThis: "'this' is not allowed in {{fnType}}",
            purityAwait: 'async/await is not allowed in {{fnType}}',
            purityYield: 'generators are not allowed in {{fnType}}',
            purityDynamicImport: 'Dynamic import() is not allowed in {{fnType}}',
            purityForbiddenIdentifier: '"{{name}}" is not allowed in {{fnType}}',
            purityClosureVariable:
                'Closure variable "{{name}}" is not allowed in {{fnType}}. Pure functions cannot access outer scope variables.',
            importedArgument:
                '{{callee}}() argument "{{name}}" is imported from another module. Pure functions must be defined inline or as a variable in the same file.',
            unresolvedArgument:
                '{{callee}}() argument "{{name}}" could not be resolved to a variable declaration in this file. Pure functions must be defined inline or as a variable in the same file.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        let importCache: PureFnImports | null = null;
        let programNode: TSESTree.Program | null = null;

        return {
            Program(node) {
                programNode = node;
                importCache = buildPureFnImportCache(node);
            },

            CallExpression(node: TSESTree.CallExpression) {
                if (!importCache || !programNode || importCache.pureFnNames.size === 0) return;
                if (node.callee.type !== AST_NODE_TYPES.Identifier) return;

                const importedName = importCache.pureFnNames.get(node.callee.name);
                if (!importedName) return;

                let target: {
                    fnNode: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
                    isFactory: boolean;
                } | null = null;

                if (importedName === 'registerMionPureFn') {
                    target = extractRegisterMionPureFnTarget(node, programNode);
                } else if (importedName === 'serverMapFrom') {
                    target = extractMapFromMapperTarget(node, programNode);
                }

                if (!target) {
                    reportUnresolvedArgument(node, importedName, programNode, context);
                    return;
                }

                const fnTypeLabel = target.isFactory ? 'factory functions' : 'pure functions';
                const localScope = collectLocalScope(target.fnNode);
                checkPurityViolations(target.fnNode.body, localScope, fnTypeLabel, context);
            },
        };
    },
};

export default rule;
