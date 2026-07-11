/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

// List of router functions that should have strongly typed handlers
const ROUTER_FUNCTIONS = ['route', 'middleFn', 'headersFn'] as const;
// List of handler types that can be used with type annotations
const HANDLER_TYPES = ['Handler', 'HeaderHandler'] as const;

/**
 * Cache for imports from @mionjs/router - computed once per file
 */
interface MionRouterImports {
    /** Set of function names imported from @mionjs/router (route, middleFn, headersFn) */
    routerFunctions: Set<string>;
    /** Set of type names imported from @mionjs/router (Handler, HeaderHandler) */
    handlerTypes: Set<string>;
}

/**
 * Builds a cache of all imports from @mionjs/router
 * This is called once per file in the Program visitor
 */
function buildImportCache(program: TSESTree.Program): MionRouterImports {
    const routerFunctions = new Set<string>();
    const handlerTypes = new Set<string>();

    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            // Check for @mionjs/router package
            if (source === '@mionjs/router' || source === '@mionjs/router/') {
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

/**
 * Checks if a call expression is calling router functions from @mionjs/router
 * Uses the cached import information for performance
 */
function getRouterFunctionName(node: TSESTree.CallExpression, importCache: MionRouterImports): string | null {
    // Check if the callee is an identifier with one of the router function names
    if (node.callee.type !== AST_NODE_TYPES.Identifier) {
        return null;
    }

    const functionName = node.callee.name;

    // Check if this function is imported from @mionjs/router
    if (importCache.routerFunctions.has(functionName)) {
        return functionName;
    }

    return null;
}

/**
 * Cache for top-level function declarations and variable function expressions
 * This avoids iterating through the program body for each function reference
 */
type FunctionCache = Map<string, TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration>;

/**
 * Builds a cache of all top-level function declarations and function variable assignments
 * This is called once per file in the Program visitor
 */
function buildFunctionCache(program: TSESTree.Program): FunctionCache {
    const cache: FunctionCache = new Map();

    for (const statement of program.body) {
        // Check function declarations
        if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id?.name) {
            cache.set(statement.id.name, statement);
        }

        // Check variable declarations
        if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                if (declarator.id.type === AST_NODE_TYPES.Identifier) {
                    if (
                        declarator.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        declarator.init?.type === AST_NODE_TYPES.FunctionExpression
                    ) {
                        cache.set(declarator.id.name, declarator.init);
                    }
                }
            }
        }
    }

    return cache;
}

/**
 * Gets the handler function from a router function call
 * Uses the cached function information for performance
 */
function getHandlerFunction(
    node: TSESTree.CallExpression,
    functionCache: FunctionCache
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration | null {
    // Handler is always the first parameter for route, middleFn, and headersFn
    const handlerIndex = 0;

    if (node.arguments.length <= handlerIndex) {
        return null;
    }

    const handlerArg = node.arguments[handlerIndex];

    // Handle inline function expressions/arrow functions
    if (handlerArg.type === AST_NODE_TYPES.ArrowFunctionExpression || handlerArg.type === AST_NODE_TYPES.FunctionExpression) {
        return handlerArg;
    }

    // Handle function references (identifiers) - use cached function lookup
    if (handlerArg.type === AST_NODE_TYPES.Identifier) {
        return functionCache.get(handlerArg.name) ?? null;
    }

    return null;
}

/**
 * Checks if a function has an explicit return type annotation
 * @param func The function node
 * @returns True if it has explicit return type, false otherwise
 */
function hasExplicitReturnType(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration
): boolean {
    return func.returnType !== undefined;
}

/**
 * Checks if a node represents a primitive literal value
 * @param node The node to check
 * @returns True if the node is a primitive literal (boolean, string, number, null, undefined, bigint)
 */
function isPrimitiveLiteral(node: TSESTree.Node): boolean {
    // Check for boolean, string, number, null, or bigint literals
    if (node.type === AST_NODE_TYPES.Literal) {
        const value = node.value;
        // BigInt literals have a 'bigint' property and value is null
        if ('bigint' in node) {
            return true;
        }
        return typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' || value === null;
    }
    // Check for undefined identifier
    if (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') {
        return true;
    }
    // Check for negative numbers (UnaryExpression with -)
    if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '-' && node.argument.type === AST_NODE_TYPES.Literal) {
        return typeof node.argument.value === 'number';
    }
    return false;
}

/**
 * Checks if all parameters (except the first) have explicit type annotations
 * @param func The function node
 * @returns Object with validation results including the actual parameter nodes
 */
function validateParameterTypes(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration
): {
    valid: boolean;
    missingTypeParams: string[];
    missingParamNodes: TSESTree.Parameter[];
} {
    const missingTypeParams: string[] = [];
    const missingParamNodes: TSESTree.Parameter[] = [];

    // Skip the first parameter (context), check all others
    for (let i = 1; i < func.params.length; i++) {
        const param = func.params[i];

        if (param.type === AST_NODE_TYPES.Identifier) {
            if (!param.typeAnnotation) {
                missingTypeParams.push(param.name);
                missingParamNodes.push(param);
            }
        } else if (param.type === AST_NODE_TYPES.RestElement) {
            if (param.argument.type === AST_NODE_TYPES.Identifier && !param.typeAnnotation) {
                missingTypeParams.push(`...${param.argument.name}`);
                missingParamNodes.push(param);
            }
        } else if (param.type === AST_NODE_TYPES.ArrayPattern || param.type === AST_NODE_TYPES.ObjectPattern) {
            // For destructuring patterns, check if they have type annotations
            if (!param.typeAnnotation) {
                missingTypeParams.push(`parameter ${i + 1}`);
                missingParamNodes.push(param);
            }
        } else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
            // For default parameters (e.g., `name = 'default'` or `name: string = 'default'`), check if:
            // 1. There's an explicit type annotation on the AssignmentPattern itself, OR
            // 2. There's an explicit type annotation on the left side (for `name: Type = value` pattern), OR
            // 3. The default value is a primitive literal (type can be inferred)
            const hasTypeAnnotationOnPattern = param.typeAnnotation !== undefined;
            const hasTypeAnnotationOnLeft =
                param.left.type === AST_NODE_TYPES.Identifier && param.left.typeAnnotation !== undefined;
            const hasTypeAnnotation = hasTypeAnnotationOnPattern || hasTypeAnnotationOnLeft;
            const hasPrimitiveDefault = isPrimitiveLiteral(param.right);

            if (!hasTypeAnnotation && !hasPrimitiveDefault) {
                // Need explicit type annotation since type cannot be inferred from default value
                const paramName = param.left.type === AST_NODE_TYPES.Identifier ? param.left.name : `parameter ${i + 1}`;
                missingTypeParams.push(paramName);
                missingParamNodes.push(param);
            }
        }
        // For other parameter types, we assume they need type annotations too
        else if (!('typeAnnotation' in param) || !param.typeAnnotation) {
            missingTypeParams.push(`parameter ${i + 1}`);
            missingParamNodes.push(param);
        }
    }

    return {
        valid: missingTypeParams.length === 0,
        missingTypeParams,
        missingParamNodes,
    };
}

/**
 * Extracts a readable parameter name from a parameter node
 */
function getParameterName(param: TSESTree.Parameter): string {
    if (param.type === AST_NODE_TYPES.Identifier) {
        return param.name;
    } else if (param.type === AST_NODE_TYPES.RestElement && param.argument.type === AST_NODE_TYPES.Identifier) {
        return `...${param.argument.name}`;
    } else if (param.type === AST_NODE_TYPES.ArrayPattern) {
        return '[...]';
    } else if (param.type === AST_NODE_TYPES.ObjectPattern) {
        return '{...}';
    } else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        if (param.left.type === AST_NODE_TYPES.Identifier) {
            return param.left.name;
        }
        return 'param';
    }
    return 'param';
}

/**
 * Gets the node to report for missing return type
 * For arrow functions, this is the arrow token area; for regular functions, the function keyword
 */
function getReturnTypeReportNode(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration
): TSESTree.Node {
    // For function declarations/expressions with an id, report on the id
    if ((func.type === AST_NODE_TYPES.FunctionDeclaration || func.type === AST_NODE_TYPES.FunctionExpression) && func.id) {
        return func.id;
    }
    // Otherwise report on the function itself (will highlight just the signature area)
    return func;
}

/**
 * Checks if a type annotation references Handler or HeaderHandler from @mionjs/router
 * Uses the cached import information for performance
 */
function getHandlerTypeFromAnnotation(
    typeAnnotation: TSESTree.TSTypeAnnotation,
    importCache: MionRouterImports
): 'Handler' | 'HeaderHandler' | null {
    if (typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
            const name = typeName.name;
            if ((name === 'Handler' || name === 'HeaderHandler') && importCache.handlerTypes.has(name)) {
                return name as 'Handler' | 'HeaderHandler';
            }
        }
    }
    return null;
}

/**
 * Checks if a satisfies expression references Handler or HeaderHandler from @mionjs/router
 * Uses the cached import information for performance
 */
function getHandlerTypeFromSatisfies(
    satisfiesExpression: TSESTree.TSSatisfiesExpression,
    importCache: MionRouterImports
): 'Handler' | 'HeaderHandler' | null {
    if (satisfiesExpression.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = satisfiesExpression.typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
            const name = typeName.name;
            if ((name === 'Handler' || name === 'HeaderHandler') && importCache.handlerTypes.has(name)) {
                return name as 'Handler' | 'HeaderHandler';
            }
        }
    }
    return null;
}

/**
 * Checks if a function has JSDoc tags indicating it should be type-checked
 * @param node The node to check for JSDoc comments
 * @param context The ESLint context
 * @returns The handler type if JSDoc tag is found, null otherwise
 */
function getHandlerTypeFromJSDoc(
    node:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration
        | TSESTree.VariableDeclaration,
    context: TSESLint.RuleContext<any, any>
): 'Handler' | 'HeaderHandler' | 'MiddleFnHandler' | null {
    const sourceCode = context.sourceCode;
    const comments = sourceCode.getCommentsBefore(node);

    for (const comment of comments) {
        if (comment.type === 'Block') {
            const commentText = comment.value;
            if (commentText.includes('@mion:route')) {
                return 'Handler';
            }
            if (commentText.includes('@mion:middleFn')) {
                return 'MiddleFnHandler';
            }
            if (commentText.includes('@mion:headersFn')) {
                return 'HeaderHandler';
            }
        }
    }
    return null;
}

const rule: TSESLint.RuleModule<
    'missingReturnType' | 'missingParamTypes' | 'missingReturnTypeRouter' | 'missingParamTypesRouter',
    []
> = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce explicit parameters and return type annotations for router handler functions',
        },
        messages: {
            missingReturnType: 'mion {{handlerType}}() handler must define a return type.',
            missingParamTypes: 'mion parameter "{{paramName}}" must have an explicit type definition.',
            missingReturnTypeRouter: 'mion {{routerFunction}}() handler must define a return type.',
            missingParamTypesRouter: 'mion parameter "{{paramName}}" must have an explicit type definition.',
        },
        schema: [], // No options
    },
    defaultOptions: [],
    create(context) {
        // Caches built once per file for performance
        let importCache: MionRouterImports | null = null;
        let functionCache: FunctionCache | null = null;

        return {
            // Build caches once when we start processing the file
            Program(node: TSESTree.Program) {
                importCache = buildImportCache(node);
                functionCache = buildFunctionCache(node);
            },
            CallExpression(node: TSESTree.CallExpression) {
                if (!importCache || !functionCache) return;

                const functionName = getRouterFunctionName(node, importCache);
                if (!functionName) {
                    return;
                }

                const handlerFunc = getHandlerFunction(node, functionCache);
                if (!handlerFunc) {
                    return;
                }

                const hasReturnType = hasExplicitReturnType(handlerFunc);
                const paramValidation = validateParameterTypes(handlerFunc);

                // Report errors on specific nodes for better highlighting
                if (!hasReturnType) {
                    context.report({
                        node: getReturnTypeReportNode(handlerFunc),
                        messageId: 'missingReturnTypeRouter',
                        data: {
                            routerFunction: functionName,
                        },
                    });
                }

                // Report each missing parameter type separately
                for (const paramNode of paramValidation.missingParamNodes) {
                    context.report({
                        node: paramNode,
                        messageId: 'missingParamTypesRouter',
                        data: {
                            paramName: getParameterName(paramNode),
                        },
                    });
                }
            },
            // Check variable declarations with type annotations or JSDoc tags
            VariableDeclarator(node: TSESTree.VariableDeclarator) {
                if (!importCache) return;

                if (node.id.type === AST_NODE_TYPES.Identifier) {
                    let handlerType: 'Handler' | 'HeaderHandler' | 'MiddleFnHandler' | null = null;

                    // Check for type annotation
                    if (node.id.typeAnnotation) {
                        handlerType = getHandlerTypeFromAnnotation(node.id.typeAnnotation, importCache);
                    }

                    // Check for JSDoc tags on the variable declaration
                    if (!handlerType && node.parent?.type === AST_NODE_TYPES.VariableDeclaration) {
                        handlerType = getHandlerTypeFromJSDoc(node.parent, context);
                    }

                    if (
                        handlerType &&
                        (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                            node.init?.type === AST_NODE_TYPES.FunctionExpression)
                    ) {
                        checkHandlerFunction(node.init, handlerType, context);
                    }
                }
            },
            // Check satisfies expressions
            TSSatisfiesExpression(node: TSESTree.TSSatisfiesExpression) {
                if (!importCache) return;

                const handlerType = getHandlerTypeFromSatisfies(node, importCache);
                if (
                    handlerType &&
                    (node.expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        node.expression.type === AST_NODE_TYPES.FunctionExpression)
                ) {
                    checkHandlerFunction(node.expression, handlerType, context);
                }
            },
            // Check function declarations with JSDoc tags
            FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
                const handlerType = getHandlerTypeFromJSDoc(node, context);
                if (handlerType) {
                    checkHandlerFunction(node, handlerType, context);
                }
            },
            // Check arrow functions and function expressions with JSDoc tags
            ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
                const handlerType = getHandlerTypeFromJSDoc(node, context);
                if (handlerType) {
                    checkHandlerFunction(node, handlerType, context);
                }
            },
            FunctionExpression(node: TSESTree.FunctionExpression) {
                const handlerType = getHandlerTypeFromJSDoc(node, context);
                if (handlerType) {
                    checkHandlerFunction(node, handlerType, context);
                }
            },
        };
    },
};

/**
 * Maps Handler/HeaderHandler/MiddleFnHandler type names to their corresponding router function names
 */
function handlerTypeToFunctionName(handlerType: 'Handler' | 'HeaderHandler' | 'MiddleFnHandler'): string {
    if (handlerType === 'HeaderHandler') return 'headersFn';
    if (handlerType === 'MiddleFnHandler') return 'middleFn';
    return 'route';
}

/**
 * Helper function to check a handler function for type annotations
 * @param func The function node to check
 * @param handlerType The expected handler type
 * @param context The ESLint context
 */
function checkHandlerFunction(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
    handlerType: 'Handler' | 'HeaderHandler' | 'MiddleFnHandler',
    context: TSESLint.RuleContext<any, any>
) {
    const hasReturnType = hasExplicitReturnType(func);
    const paramValidation = validateParameterTypes(func);
    const functionName = handlerTypeToFunctionName(handlerType);

    // Report errors on specific nodes for better highlighting
    if (!hasReturnType) {
        context.report({
            node: getReturnTypeReportNode(func),
            messageId: 'missingReturnType',
            data: {
                handlerType: functionName,
            },
        });
    }

    // Report each missing parameter type separately
    for (const paramNode of paramValidation.missingParamNodes) {
        context.report({
            node: paramNode,
            messageId: 'missingParamTypes',
            data: {
                paramName: getParameterName(paramNode),
            },
        });
    }
}

export default rule;
