import { AST_NODE_TYPES } from "@typescript-eslint/utils";
function getRouterFunctionName(node, context) {
  const routerFunctions = ["route", "hook", "headersHook"];
  if (node.callee.type !== AST_NODE_TYPES.Identifier || !routerFunctions.includes(node.callee.name)) {
    return null;
  }
  const functionName = node.callee.name;
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      const source = statement.source.value;
      if (source === "@mionkit/router" || source === "@mionkit/router/") {
        for (const specifier of statement.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier && specifier.imported.name === functionName) {
            return functionName;
          }
        }
      }
    }
  }
  return null;
}
function findFunctionByName(name, context) {
  var _a, _b, _c;
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.FunctionDeclaration && ((_a = statement.id) == null ? void 0 : _a.name) === name) {
      return statement;
    }
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (declarator.id.type === AST_NODE_TYPES.Identifier && declarator.id.name === name) {
          if (((_b = declarator.init) == null ? void 0 : _b.type) === AST_NODE_TYPES.ArrowFunctionExpression || ((_c = declarator.init) == null ? void 0 : _c.type) === AST_NODE_TYPES.FunctionExpression) {
            return declarator.init;
          }
        }
      }
    }
  }
  return null;
}
function getHandlerFunction(node, _functionName, context) {
  const handlerIndex = 0;
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
  return func.returnType !== void 0;
}
function validateParameterTypes(func) {
  const missingTypeParams = [];
  const missingParamNodes = [];
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
      if (!param.typeAnnotation) {
        missingTypeParams.push(`parameter ${i + 1}`);
        missingParamNodes.push(param);
      }
    } else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
      if (!param.typeAnnotation) {
        missingTypeParams.push(`parameter ${i + 1}`);
        missingParamNodes.push(param);
      }
    } else if (!("typeAnnotation" in param) || !param.typeAnnotation) {
      missingTypeParams.push(`parameter ${i + 1}`);
      missingParamNodes.push(param);
    }
  }
  return {
    valid: missingTypeParams.length === 0,
    missingTypeParams,
    missingParamNodes
  };
}
function getParameterName(param) {
  if (param.type === AST_NODE_TYPES.Identifier) {
    return param.name;
  } else if (param.type === AST_NODE_TYPES.RestElement && param.argument.type === AST_NODE_TYPES.Identifier) {
    return `...${param.argument.name}`;
  } else if (param.type === AST_NODE_TYPES.ArrayPattern) {
    return "[...]";
  } else if (param.type === AST_NODE_TYPES.ObjectPattern) {
    return "{...}";
  } else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
    if (param.left.type === AST_NODE_TYPES.Identifier) {
      return param.left.name;
    }
    return "param";
  }
  return "param";
}
function getReturnTypeReportNode(func) {
  if ((func.type === AST_NODE_TYPES.FunctionDeclaration || func.type === AST_NODE_TYPES.FunctionExpression) && func.id) {
    return func.id;
  }
  return func;
}
function getHandlerTypeFromAnnotation(typeAnnotation, context) {
  if (typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = typeAnnotation.typeAnnotation.typeName;
    if (typeName.type === AST_NODE_TYPES.Identifier) {
      const name = typeName.name;
      if ((name === "Handler" || name === "HeaderHandler") && isImportedFromMionRouter(name, context)) {
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
      if ((name === "Handler" || name === "HeaderHandler") && isImportedFromMionRouter(name, context)) {
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
    if (comment.type === "Block") {
      const commentText = comment.value;
      if (commentText.includes("@mion:route")) {
        return "Handler";
      }
      if (commentText.includes("@mion:hook")) {
        return "HookHandler";
      }
      if (commentText.includes("@mion:headersHook")) {
        return "HeaderHandler";
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
      if (source === "@mionkit/router" || source === "@mionkit/router/") {
        for (const specifier of statement.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier && specifier.imported.name === name) {
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
    type: "problem",
    docs: {
      description: "Enforce explicit parameters and return type annotations for router handler functions"
    },
    messages: {
      missingReturnType: "mion {{handlerType}}() handler must define a return type.",
      missingParamTypes: 'mion parameter "{{paramName}}" must have an explicit type definition.',
      missingReturnTypeRouter: "mion {{routerFunction}}() handler must define a return type.",
      missingParamTypesRouter: 'mion parameter "{{paramName}}" must have an explicit type definition.'
    },
    schema: []
    // No options
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
        if (!hasReturnType) {
          context.report({
            node: getReturnTypeReportNode(handlerFunc),
            messageId: "missingReturnTypeRouter",
            data: {
              routerFunction: functionName
            }
          });
        }
        for (const paramNode of paramValidation.missingParamNodes) {
          context.report({
            node: paramNode,
            messageId: "missingParamTypesRouter",
            data: {
              paramName: getParameterName(paramNode)
            }
          });
        }
      },
      // Check variable declarations with type annotations or JSDoc tags
      VariableDeclarator(node) {
        var _a, _b, _c;
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          let handlerType = null;
          if (node.id.typeAnnotation) {
            handlerType = getHandlerTypeFromAnnotation(node.id.typeAnnotation, context);
          }
          if (!handlerType && ((_a = node.parent) == null ? void 0 : _a.type) === AST_NODE_TYPES.VariableDeclaration) {
            handlerType = getHandlerTypeFromJSDoc(node.parent, context);
          }
          if (handlerType && (((_b = node.init) == null ? void 0 : _b.type) === AST_NODE_TYPES.ArrowFunctionExpression || ((_c = node.init) == null ? void 0 : _c.type) === AST_NODE_TYPES.FunctionExpression)) {
            checkHandlerFunction(node.init, handlerType, context);
          }
        }
      },
      // Check satisfies expressions
      TSSatisfiesExpression(node) {
        const handlerType = getHandlerTypeFromSatisfies(node, context);
        if (handlerType && (node.expression.type === AST_NODE_TYPES.ArrowFunctionExpression || node.expression.type === AST_NODE_TYPES.FunctionExpression)) {
          checkHandlerFunction(node.expression, handlerType, context);
        }
      },
      // Check function declarations with JSDoc tags
      FunctionDeclaration(node) {
        const handlerType = getHandlerTypeFromJSDoc(node, context);
        if (handlerType) {
          checkHandlerFunction(node, handlerType, context);
        }
      },
      // Check arrow functions and function expressions with JSDoc tags
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
      }
    };
  }
};
function handlerTypeToFunctionName(handlerType) {
  if (handlerType === "HeaderHandler") return "headersHook";
  if (handlerType === "HookHandler") return "hook";
  return "route";
}
function checkHandlerFunction(func, handlerType, context) {
  const hasReturnType = hasExplicitReturnType(func);
  const paramValidation = validateParameterTypes(func);
  const functionName = handlerTypeToFunctionName(handlerType);
  if (!hasReturnType) {
    context.report({
      node: getReturnTypeReportNode(func),
      messageId: "missingReturnType",
      data: {
        handlerType: functionName
      }
    });
  }
  for (const paramNode of paramValidation.missingParamNodes) {
    context.report({
      node: paramNode,
      messageId: "missingParamTypes",
      data: {
        paramName: getParameterName(paramNode)
      }
    });
  }
}
export {
  rule as default
};
