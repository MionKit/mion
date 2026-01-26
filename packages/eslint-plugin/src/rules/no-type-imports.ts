/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

/** List of router functions that should have strongly typed handlers */
const ROUTER_FUNCTIONS = ['route', 'linkedFn', 'headersLinkedFn'] as const;
/** List of handler types that can be used with type annotations */
const HANDLER_TYPES = ['Handler', 'HeaderHandler'] as const;

/** Cache for imports from @mionkit/router - computed once per file */
interface MionRouterImports {
    /** Set of function names imported from @mionkit/router (route, linkedFn, headersLinkedFn) */
    routerFunctions: Set<string>;
    /** Set of type names imported from @mionkit/router (Handler, HeaderHandler) */
    handlerTypes: Set<string>;
}

/** Cache for type-only imports - computed once per file */
interface TypeOnlyImports {
    /** Map of type name to import declaration node */
    typeOnlyImports: Map<string, TSESTree.ImportDeclaration>;
}

/** Type reference with its node for precise error reporting */
interface TypeRefWithNode {
    typeName: string;
    node: TSESTree.Node;
}

/** Builds a cache of all imports from @mionkit/router */
function buildRouterImportCache(program: TSESTree.Program): MionRouterImports {
    const routerFunctions = new Set<string>();
    const handlerTypes = new Set<string>();

    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/router' || source === '@mionkit/router/') {
                for (const specifier of statement.specifiers) {
                    if (
                        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier
                    ) {
                        const name = specifier.imported.name;
                        if (ROUTER_FUNCTIONS.includes(name as (typeof ROUTER_FUNCTIONS)[number])) {
                            routerFunctions.add(name);
                        }
                        if (HANDLER_TYPES.includes(name as (typeof HANDLER_TYPES)[number])) {
                            handlerTypes.add(name);
                        }
                    }
                }
            }
        }
    }

    return {routerFunctions, handlerTypes};
}

/** Builds a cache of all type-only imports */
function buildTypeOnlyImportCache(program: TSESTree.Program): TypeOnlyImports {
    const typeOnlyImports = new Map<string, TSESTree.ImportDeclaration>();

    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            // Check if the entire import is type-only: import type { X } from '...'
            const isTypeOnlyImport = statement.importKind === 'type';

            for (const specifier of statement.specifiers) {
                if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
                    // Check if individual specifier is type-only: import { type X } from '...'
                    const isTypeOnlySpecifier = specifier.importKind === 'type';

                    if (isTypeOnlyImport || isTypeOnlySpecifier) {
                        const localName = specifier.local.name;
                        typeOnlyImports.set(localName, statement);
                    }
                }
            }
        }
    }

    return {typeOnlyImports};
}

/** Checks if a call expression is calling router functions from @mionkit/router */
function getRouterFunctionName(node: TSESTree.CallExpression, importCache: MionRouterImports): string | null {
    if (node.callee.type !== AST_NODE_TYPES.Identifier) return null;
    const functionName = node.callee.name;
    if (importCache.routerFunctions.has(functionName)) return functionName;
    return null;
}

/** Extracts all type references with their nodes from a type node recursively */
function extractTypeReferencesWithNodes(typeNode: TSESTree.TypeNode | null | undefined): TypeRefWithNode[] {
    if (!typeNode) return [];

    const references: TypeRefWithNode[] = [];

    switch (typeNode.type) {
        case AST_NODE_TYPES.TSTypeReference:
            if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
                // Report on the type reference node itself (e.g., "User" in ": User")
                references.push({typeName: typeNode.typeName.name, node: typeNode});
            }
            // Also check type arguments (generics)
            if (typeNode.typeArguments) {
                for (const param of typeNode.typeArguments.params) {
                    references.push(...extractTypeReferencesWithNodes(param));
                }
            }
            break;

        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType:
            for (const member of typeNode.types) {
                references.push(...extractTypeReferencesWithNodes(member));
            }
            break;

        case AST_NODE_TYPES.TSArrayType:
            references.push(...extractTypeReferencesWithNodes(typeNode.elementType));
            break;

        case AST_NODE_TYPES.TSTupleType:
            for (const element of typeNode.elementTypes) {
                references.push(...extractTypeReferencesWithNodes(element));
            }
            break;

        case AST_NODE_TYPES.TSTypeLiteral:
            for (const member of typeNode.members) {
                if (member.type === AST_NODE_TYPES.TSPropertySignature && member.typeAnnotation) {
                    references.push(...extractTypeReferencesWithNodes(member.typeAnnotation.typeAnnotation));
                }
            }
            break;

        case AST_NODE_TYPES.TSConditionalType:
            references.push(...extractTypeReferencesWithNodes(typeNode.checkType));
            references.push(...extractTypeReferencesWithNodes(typeNode.extendsType));
            references.push(...extractTypeReferencesWithNodes(typeNode.trueType));
            references.push(...extractTypeReferencesWithNodes(typeNode.falseType));
            break;

        case AST_NODE_TYPES.TSMappedType:
            references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
            break;

        case AST_NODE_TYPES.TSIndexedAccessType:
            references.push(...extractTypeReferencesWithNodes(typeNode.objectType));
            references.push(...extractTypeReferencesWithNodes(typeNode.indexType));
            break;

        case AST_NODE_TYPES.TSTypeOperator:
            references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
            break;

        case AST_NODE_TYPES.TSRestType:
            references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
            break;

        case AST_NODE_TYPES.TSOptionalType:
            references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
            break;

        case AST_NODE_TYPES.TSFunctionType:
        case AST_NODE_TYPES.TSConstructorType:
            // Check parameters
            for (const param of typeNode.params) {
                if ('typeAnnotation' in param && param.typeAnnotation) {
                    references.push(...extractTypeReferencesWithNodes(param.typeAnnotation.typeAnnotation));
                }
            }
            // Check return type
            if (typeNode.returnType) {
                references.push(...extractTypeReferencesWithNodes(typeNode.returnType.typeAnnotation));
            }
            break;
    }

    return references;
}

/** Gets type annotation from a parameter if it exists */
function getParamTypeAnnotation(param: TSESTree.Parameter): TSESTree.TypeNode | null {
    if (param.type === AST_NODE_TYPES.Identifier && param.typeAnnotation) {
        return param.typeAnnotation.typeAnnotation;
    }
    if (param.type === AST_NODE_TYPES.RestElement && param.typeAnnotation) {
        return param.typeAnnotation.typeAnnotation;
    }
    if (param.type === AST_NODE_TYPES.ArrayPattern && param.typeAnnotation) {
        return param.typeAnnotation.typeAnnotation;
    }
    if (param.type === AST_NODE_TYPES.ObjectPattern && param.typeAnnotation) {
        return param.typeAnnotation.typeAnnotation;
    }
    if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        // Check if there's a type annotation on the pattern itself
        if (param.typeAnnotation) {
            return param.typeAnnotation.typeAnnotation;
        }
        // Check if there's a type annotation on the left side
        if (param.left.type === AST_NODE_TYPES.Identifier && param.left.typeAnnotation) {
            return param.left.typeAnnotation.typeAnnotation;
        }
    }
    return null;
}

/** Extracts type references with nodes from function parameters (excluding first ctx parameter) */
function extractParamTypeReferencesWithNodes(params: TSESTree.Parameter[]): TypeRefWithNode[] {
    const references: TypeRefWithNode[] = [];

    // Skip first parameter (ctx)
    for (let i = 1; i < params.length; i++) {
        const param = params[i];
        if (param) {
            const typeAnnotation = getParamTypeAnnotation(param);
            if (typeAnnotation) {
                references.push(...extractTypeReferencesWithNodes(typeAnnotation));
            }
        }
    }

    return references;
}

/** Extracts type references with nodes from function return type */
function extractReturnTypeReferencesWithNodes(
    node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration
): TypeRefWithNode[] {
    if (node.returnType) {
        return extractTypeReferencesWithNodes(node.returnType.typeAnnotation);
    }
    return [];
}

const rule: TSESLint.RuleModule<'noTypeImports', []> = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow type-only imports for types used in route/linkedFn parameters or return types. Type-only imports are erased at runtime, preventing mion from generating validation and serialization functions.',
        },
        messages: {
            noTypeImports:
                'Type "{{typeName}}" is imported as type-only but is used in a route/linkedFn. Remove the "type" keyword from the import to allow runtime type reflection.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        let routerImportCache: MionRouterImports | null = null;
        let typeOnlyImportCache: TypeOnlyImports | null = null;

        /** Reports type-only imports used in handler, highlighting the specific type reference */
        function checkTypeReferencesWithNodes(typeRefs: TypeRefWithNode[]): void {
            if (!typeOnlyImportCache) return;

            // Track reported types to avoid duplicates
            const reportedTypes = new Set<string>();

            for (const {typeName, node} of typeRefs) {
                // Skip if already reported this type
                if (reportedTypes.has(typeName)) continue;

                const importDecl = typeOnlyImportCache.typeOnlyImports.get(typeName);
                if (importDecl) {
                    reportedTypes.add(typeName);
                    context.report({
                        node,
                        messageId: 'noTypeImports',
                        data: {typeName},
                    });
                }
            }
        }

        /** Checks a function node for type-only imports */
        function checkFunctionNode(
            funcNode: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration
        ): void {
            const paramRefs = extractParamTypeReferencesWithNodes(funcNode.params);
            const returnRefs = extractReturnTypeReferencesWithNodes(funcNode);
            const allRefs = [...paramRefs, ...returnRefs];

            checkTypeReferencesWithNodes(allRefs);
        }

        return {
            Program(node) {
                routerImportCache = buildRouterImportCache(node);
                typeOnlyImportCache = buildTypeOnlyImportCache(node);
            },

            CallExpression(node: TSESTree.CallExpression) {
                if (!routerImportCache || !typeOnlyImportCache) return;

                const routerFunctionName = getRouterFunctionName(node, routerImportCache);
                if (!routerFunctionName) return;

                // Check the first argument (handler function)
                const handler = node.arguments[0];
                if (!handler) return;

                if (
                    handler.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                    handler.type === AST_NODE_TYPES.FunctionExpression
                ) {
                    checkFunctionNode(handler);
                } else if (handler.type === AST_NODE_TYPES.Identifier) {
                    // Handler is a reference to a function - we need to find the function declaration
                    // This is handled by checking function declarations with Handler/HeaderHandler type annotations
                }
            },

            // Check functions with Handler/HeaderHandler type annotations
            VariableDeclarator(node: TSESTree.VariableDeclarator) {
                if (!routerImportCache || !typeOnlyImportCache) return;

                // Check if the variable has a Handler or HeaderHandler type annotation
                if (node.id.type === AST_NODE_TYPES.Identifier && node.id.typeAnnotation) {
                    const typeAnnotation = node.id.typeAnnotation.typeAnnotation;
                    if (
                        typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
                        typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
                        routerImportCache.handlerTypes.has(typeAnnotation.typeName.name)
                    ) {
                        // This is a handler with type annotation
                        if (
                            node.init &&
                            (node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                                node.init.type === AST_NODE_TYPES.FunctionExpression)
                        ) {
                            checkFunctionNode(node.init);
                        }
                    }
                }

                // Check for satisfies expressions
                if (
                    node.init &&
                    node.init.type === AST_NODE_TYPES.TSSatisfiesExpression &&
                    node.init.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
                    node.init.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
                    routerImportCache.handlerTypes.has(node.init.typeAnnotation.typeName.name)
                ) {
                    const expr = node.init.expression;
                    if (expr.type === AST_NODE_TYPES.ArrowFunctionExpression || expr.type === AST_NODE_TYPES.FunctionExpression) {
                        checkFunctionNode(expr);
                    }
                }
            },

            // Check function declarations with JSDoc tags
            FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
                if (!routerImportCache || !typeOnlyImportCache) return;

                // Check for JSDoc tags
                const sourceCode = context.sourceCode;
                const comments = sourceCode.getCommentsBefore(node);

                for (const comment of comments) {
                    if (
                        comment.type === 'Block' &&
                        (comment.value.includes('@mion:route') ||
                            comment.value.includes('@mion:linkedFn') ||
                            comment.value.includes('@mion:headersLinkedFn'))
                    ) {
                        checkFunctionNode(node);
                        break;
                    }
                }
            },
        };
    },
};

export default rule;
