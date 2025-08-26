import { AST_NODE_TYPES } from '@typescript-eslint/utils';
function getRouterFunctionName(node, context) {
    const routerFunctions = ['route', 'hook', 'headersHook'];
    if (node.callee.type !== AST_NODE_TYPES.Identifier || !routerFunctions.includes(node.callee.name)) {
        return null;
    }
    const functionName = node.callee.name;
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/router' || source === '@mionkit/router/') {
                for (const specifier of statement.specifiers) {
                    if (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === functionName) {
                        return functionName;
                    }
                }
            }
        }
    }
    return null;
}
function findFunctionByName(name, context) {
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id?.name === name) {
            return statement;
        }
        if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                if (declarator.id.type === AST_NODE_TYPES.Identifier && declarator.id.name === name) {
                    if (declarator.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        declarator.init?.type === AST_NODE_TYPES.FunctionExpression) {
                        return declarator.init;
                    }
                }
            }
        }
    }
    return null;
}
function getHandlerFunction(node, functionName, context) {
    let handlerIndex = 0;
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
    if (handlerArg.type === AST_NODE_TYPES.Identifier) {
        return findFunctionByName(handlerArg.name, context);
    }
    return null;
}
function hasExplicitReturnType(func) {
    return func.returnType !== undefined;
}
function validateParameterTypes(func) {
    const missingTypeParams = [];
    for (let i = 1; i < func.params.length; i++) {
        const param = func.params[i];
        if (param.type === AST_NODE_TYPES.Identifier) {
            if (!param.typeAnnotation) {
                missingTypeParams.push(param.name);
            }
        }
        else if (param.type === AST_NODE_TYPES.RestElement) {
            if (param.argument.type === AST_NODE_TYPES.Identifier && !param.typeAnnotation) {
                missingTypeParams.push(`...${param.argument.name}`);
            }
        }
        else if (param.type === AST_NODE_TYPES.ArrayPattern || param.type === AST_NODE_TYPES.ObjectPattern) {
            if (!param.typeAnnotation) {
                missingTypeParams.push(`parameter ${i + 1}`);
            }
        }
        else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
            if (!param.typeAnnotation) {
                missingTypeParams.push(`parameter ${i + 1}`);
            }
        }
        else if (!('typeAnnotation' in param) || !param.typeAnnotation) {
            missingTypeParams.push(`parameter ${i + 1}`);
        }
    }
    return {
        valid: missingTypeParams.length === 0,
        missingTypeParams,
    };
}
function getHandlerTypeFromAnnotation(typeAnnotation, context) {
    if (typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
            const name = typeName.name;
            if ((name === 'Handler' || name === 'HeaderHandler') && isImportedFromMionRouter(name, context)) {
                return name;
            }
        }
    }
    return null;
}
function getHandlerTypeFromSatisfies(satisfiesExpression, context) {
    if (satisfiesExpression.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = satisfiesExpression.typeAnnotation.typeName;
        if (typeName.type === AST_NODE_TYPES.Identifier) {
            const name = typeName.name;
            if ((name === 'Handler' || name === 'HeaderHandler') && isImportedFromMionRouter(name, context)) {
                return name;
            }
        }
    }
    return null;
}
function getHandlerTypeFromJSDoc(node, context) {
    const sourceCode = context.sourceCode;
    const comments = sourceCode.getCommentsBefore(node);
    for (const comment of comments) {
        if (comment.type === 'Block') {
            const commentText = comment.value;
            if (commentText.includes('@mion:route') || commentText.includes('@mion:hook')) {
                return 'Handler';
            }
            if (commentText.includes('@mion:headersHook')) {
                return 'HeaderHandler';
            }
        }
    }
    return null;
}
function isImportedFromMionRouter(name, context) {
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/router' || source === '@mionkit/router/') {
                for (const specifier of statement.specifiers) {
                    if (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === name) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce explicit parameters and return type annotations for router handler functions',
        },
        messages: {
            missingReturnType: 'Mion {{handlerType}} must have explicit return type annotations.',
            missingParamTypes: 'Mion {{handlerType}} must have explicit parameters type annotations.',
            missingBothTypes: 'Mion {{handlerType}} must have explicit parameters and return type annotations.',
            missingReturnTypeRouter: 'Mion {{routerFunction}}() handler must have explicit return type annotations.',
            missingParamTypesRouter: 'Mion {{routerFunction}}() handler must have explicit parameters type annotations.',
            missingBothTypesRouter: 'Mion {{routerFunction}}() handler must have explicit parameters and return type annotations.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
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
                if (!hasReturnType && !paramValidation.valid) {
                    context.report({
                        node: handlerFunc,
                        messageId: 'missingBothTypesRouter',
                        data: {
                            routerFunction: functionName,
                        },
                    });
                }
                else if (!hasReturnType) {
                    context.report({
                        node: handlerFunc,
                        messageId: 'missingReturnTypeRouter',
                        data: {
                            routerFunction: functionName,
                        },
                    });
                }
                else if (!paramValidation.valid) {
                    context.report({
                        node: handlerFunc,
                        messageId: 'missingParamTypesRouter',
                        data: {
                            routerFunction: functionName,
                        },
                    });
                }
            },
            VariableDeclarator(node) {
                if (node.id.type === AST_NODE_TYPES.Identifier) {
                    let handlerType = null;
                    if (node.id.typeAnnotation) {
                        handlerType = getHandlerTypeFromAnnotation(node.id.typeAnnotation, context);
                    }
                    if (!handlerType && node.parent?.type === AST_NODE_TYPES.VariableDeclaration) {
                        handlerType = getHandlerTypeFromJSDoc(node.parent, context);
                    }
                    if (handlerType &&
                        (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                            node.init?.type === AST_NODE_TYPES.FunctionExpression)) {
                        checkHandlerFunction(node.init, handlerType, context);
                    }
                }
            },
            TSSatisfiesExpression(node) {
                const handlerType = getHandlerTypeFromSatisfies(node, context);
                if (handlerType &&
                    (node.expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        node.expression.type === AST_NODE_TYPES.FunctionExpression)) {
                    checkHandlerFunction(node.expression, handlerType, context);
                }
            },
            FunctionDeclaration(node) {
                const handlerType = getHandlerTypeFromJSDoc(node, context);
                if (handlerType) {
                    checkHandlerFunction(node, handlerType, context);
                }
            },
            ArrowFunctionExpression(node) {
                const handlerType = getHandlerTypeFromJSDoc(node, context);
                if (handlerType) {
                    checkHandlerFunction(node, handlerType, context);
                }
            },
            FunctionExpression(node) {
                const handlerType = getHandlerTypeFromJSDoc(node, context);
                if (handlerType) {
                    checkHandlerFunction(node, handlerType, context);
                }
            },
        };
    },
};
function checkHandlerFunction(func, handlerType, context) {
    const hasReturnType = hasExplicitReturnType(func);
    const paramValidation = validateParameterTypes(func);
    if (!hasReturnType && !paramValidation.valid) {
        context.report({
            node: func,
            messageId: 'missingBothTypes',
            data: {
                handlerType,
            },
        });
    }
    else if (!hasReturnType) {
        context.report({
            node: func,
            messageId: 'missingReturnType',
            data: {
                handlerType,
            },
        });
    }
    else if (!paramValidation.valid) {
        context.report({
            node: func,
            messageId: 'missingParamTypes',
            data: {
                handlerType,
            },
        });
    }
}
export default rule;
//# sourceMappingURL=strong-typed-routes.js.map