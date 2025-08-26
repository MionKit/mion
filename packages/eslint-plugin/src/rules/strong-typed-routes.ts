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
 * Gets the handler function from a router function call
 * @param node The call expression node
 * @param functionName The name of the router function
 * @returns The handler function node or null
 */
function getHandlerFunction(
    node: TSESTree.CallExpression,
    functionName: string
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
    let handlerIndex = 0;

    // For headersHook, the handler is the second parameter
    if (functionName === 'headersHook') {
        handlerIndex = 1;
    }

    if (node.arguments.length <= handlerIndex) {
        return null;
    }

    const handlerArg = node.arguments[handlerIndex];

    if (handlerArg.type === AST_NODE_TYPES.ArrowFunctionExpression || handlerArg.type === AST_NODE_TYPES.FunctionExpression) {
        return handlerArg;
    }

    return null;
}

/**
 * Checks if a function has an explicit return type annotation
 * @param func The function node
 * @returns True if it has explicit return type, false otherwise
 */
function hasExplicitReturnType(func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
    return func.returnType !== undefined;
}

/**
 * Checks if all parameters (except the first) have explicit type annotations
 * @param func The function node
 * @returns Object with validation results
 */
function validateParameterTypes(func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): {
    valid: boolean;
    missingTypeParams: string[];
} {
    const missingTypeParams: string[] = [];

    // Skip the first parameter (context), check all others
    for (let i = 1; i < func.params.length; i++) {
        const param = func.params[i];

        if (param.type === AST_NODE_TYPES.Identifier) {
            if (!param.typeAnnotation) {
                missingTypeParams.push(param.name);
            }
        } else if (param.type === AST_NODE_TYPES.RestElement) {
            if (param.argument.type === AST_NODE_TYPES.Identifier && !param.typeAnnotation) {
                missingTypeParams.push(`...${param.argument.name}`);
            }
        } else if (param.type === AST_NODE_TYPES.ArrayPattern || param.type === AST_NODE_TYPES.ObjectPattern) {
            // For destructuring patterns, check if they have type annotations
            if (!param.typeAnnotation) {
                missingTypeParams.push(`parameter ${i + 1}`);
            }
        } else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
            // For default parameters, check the left side
            if (!param.typeAnnotation) {
                missingTypeParams.push(`parameter ${i + 1}`);
            }
        }
        // For other parameter types, we assume they need type annotations too
        else if (!('typeAnnotation' in param) || !param.typeAnnotation) {
            missingTypeParams.push(`parameter ${i + 1}`);
        }
    }

    return {
        valid: missingTypeParams.length === 0,
        missingTypeParams,
    };
}

const rule: TSESLint.RuleModule<'missingReturnType' | 'missingParamTypes' | 'missingBothTypes', []> = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce explicit parameter and return type annotations for router handler functions',
        },
        messages: {
            missingReturnType: 'Handler function for `{{functionName}}()` must have an explicit return type annotation.',
            missingParamTypes:
                'Handler function for `{{functionName}}()` must have explicit type annotations for parameters: {{params}}.',
            missingBothTypes:
                'Handler function for `{{functionName}}()` must have explicit return type and parameter type annotations for: {{params}}.',
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

                const handlerFunc = getHandlerFunction(node, functionName);
                if (!handlerFunc) {
                    return;
                }

                const hasReturnType = hasExplicitReturnType(handlerFunc);
                const paramValidation = validateParameterTypes(handlerFunc);

                // Report errors based on what's missing
                if (!hasReturnType && !paramValidation.valid) {
                    context.report({
                        node: handlerFunc,
                        messageId: 'missingBothTypes',
                        data: {
                            functionName,
                            params: paramValidation.missingTypeParams.join(', '),
                        },
                    });
                } else if (!hasReturnType) {
                    context.report({
                        node: handlerFunc,
                        messageId: 'missingReturnType',
                        data: {
                            functionName,
                        },
                    });
                } else if (!paramValidation.valid) {
                    context.report({
                        node: handlerFunc,
                        messageId: 'missingParamTypes',
                        data: {
                            functionName,
                            params: paramValidation.missingTypeParams.join(', '),
                        },
                    });
                }
            },
        };
    },
};

export default rule;
