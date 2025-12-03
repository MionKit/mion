/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

/**
 * Checks if a call expression is calling router functions from @mionkit/router
 * @param node The call expression node
 * @param context The ESLint context
 * @returns The function name if it's a router function from @mionkit/router, null otherwise
 */
function getRouterFunctionName(node: TSESTree.CallExpression, context: TSESLint.RuleContext<any, any>): string | null {
    // List of router functions that should have strongly typed handlers
    const routerFunctions = ['route', 'hook', 'headersHook'];

    // Check if the callee is an identifier with one of the router function names
    if (node.callee.type !== AST_NODE_TYPES.Identifier || !routerFunctions.includes(node.callee.name)) {
        return null;
    }

    const functionName = node.callee.name;

    // Get the source code to check imports
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;

    // Look for import statements that import router functions from @mionkit/router
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            // Check for @mionkit/router package
            if (source === '@mionkit/router' || source === '@mionkit/router/') {
                // Check if the function is imported
                for (const specifier of statement.specifiers) {
                    if (
                        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === functionName
                    ) {
                        return functionName;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Finds a function declaration or variable assignment with function expression by name
 * @param name The function name to search for
 * @param context The ESLint context
 * @returns The function node or null
 */
function findFunctionByName(
    name: string,
    context: TSESLint.RuleContext<any, any>
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration | null {
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;

    // Search through all top-level statements
    for (const statement of program.body) {
        // Check function declarations
        if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id?.name === name) {
            return statement;
        }

        // Check variable declarations
        if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                if (declarator.id.type === AST_NODE_TYPES.Identifier && declarator.id.name === name) {
                    if (
                        declarator.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        declarator.init?.type === AST_NODE_TYPES.FunctionExpression
                    ) {
                        return declarator.init;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Gets the handler function from a router function call
 * @param node The call expression node
 * @param functionName The name of the router function
 * @param context The ESLint context
 * @returns The handler function node or null
 */
function getHandlerFunction(
    node: TSESTree.CallExpression,
    _functionName: string, // kept for future use if different handler functions have different signatures
    context: TSESLint.RuleContext<any, any>
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration | null {
    // Handler is always the first parameter for route, hook, and headersHook
    const handlerIndex = 0;

    if (node.arguments.length <= handlerIndex) {
        return null;
    }

    const handlerArg = node.arguments[handlerIndex];

    // Handle inline function expressions/arrow functions
    if (handlerArg.type === AST_NODE_TYPES.ArrowFunctionExpression || handlerArg.type === AST_NODE_TYPES.FunctionExpression) {
        return handlerArg;
    }

    // Handle function references (identifiers)
    if (handlerArg.type === AST_NODE_TYPES.Identifier) {
        return findFunctionByName(handlerArg.name, context);
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
            // For default parameters, check the left side
            if (!param.typeAnnotation) {
                missingTypeParams.push(`parameter ${i + 1}`);
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
 * Checks if a type annotation references Handler or HeaderHandler from @mionkit/router
 * @param typeAnnotation The type annotation node
 * @param context The ESLint context
 * @returns The handler type if it matches, null otherwise
 */
function getHandlerTypeFromAnnotation(
    typeAnnotation: TSESTree.TSTypeAnnotation,
    context: TSESLint.RuleContext<any, any>
): 'Handler' | 'HeaderHandler' | null {
    if (typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
            const name = typeName.name;
            if ((name === 'Handler' || name === 'HeaderHandler') && isImportedFromMionRouter(name, context)) {
                return name as 'Handler' | 'HeaderHandler';
            }
        }
    }
    return null;
}

/**
 * Checks if a satisfies expression references Handler or HeaderHandler from @mionkit/router
 * @param satisfiesExpression The satisfies expression node
 * @param context The ESLint context
 * @returns The handler type if it matches, null otherwise
 */
function getHandlerTypeFromSatisfies(
    satisfiesExpression: TSESTree.TSSatisfiesExpression,
    context: TSESLint.RuleContext<any, any>
): 'Handler' | 'HeaderHandler' | null {
    if (satisfiesExpression.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = satisfiesExpression.typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
            const name = typeName.name;
            if ((name === 'Handler' || name === 'HeaderHandler') && isImportedFromMionRouter(name, context)) {
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
): 'Handler' | 'HeaderHandler' | 'HookHandler' | null {
    const sourceCode = context.sourceCode;
    const comments = sourceCode.getCommentsBefore(node);

    for (const comment of comments) {
        if (comment.type === 'Block') {
            const commentText = comment.value;
            if (commentText.includes('@mion:route')) {
                return 'Handler';
            }
            if (commentText.includes('@mion:hook')) {
                return 'HookHandler';
            }
            if (commentText.includes('@mion:headersHook')) {
                return 'HeaderHandler';
            }
        }
    }
    return null;
}

/**
 * Checks if a name is imported from @mionkit/router
 * @param name The identifier name to check
 * @param context The ESLint context
 * @returns True if imported from @mionkit/router
 */
function isImportedFromMionRouter(name: string, context: TSESLint.RuleContext<any, any>): boolean {
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;

    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/router' || source === '@mionkit/router/') {
                for (const specifier of statement.specifiers) {
                    if (
                        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === name
                    ) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
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
        return {
            CallExpression(node: TSESTree.CallExpression) {
                const functionName = getRouterFunctionName(node, context);
                if (!functionName) {
                    return;
                }

                const handlerFunc = getHandlerFunction(node, functionName, context);
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
                if (node.id.type === AST_NODE_TYPES.Identifier) {
                    let handlerType: 'Handler' | 'HeaderHandler' | 'HookHandler' | null = null;

                    // Check for type annotation
                    if (node.id.typeAnnotation) {
                        handlerType = getHandlerTypeFromAnnotation(node.id.typeAnnotation, context);
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
                const handlerType = getHandlerTypeFromSatisfies(node, context);
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
 * Maps Handler/HeaderHandler/HookHandler type names to their corresponding router function names
 */
function handlerTypeToFunctionName(handlerType: 'Handler' | 'HeaderHandler' | 'HookHandler'): string {
    if (handlerType === 'HeaderHandler') return 'headersHook';
    if (handlerType === 'HookHandler') return 'hook';
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
    handlerType: 'Handler' | 'HeaderHandler' | 'HookHandler',
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
