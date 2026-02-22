"use strict";
const utils = require("@typescript-eslint/utils");
const ROUTER_FUNCTIONS = ["route", "linkedFn", "headersFn"];
const HANDLER_TYPES = ["Handler", "HeaderHandler"];
function buildImportCache(program) {
  const routerFunctions = /* @__PURE__ */ new Set();
  const handlerTypes = /* @__PURE__ */ new Set();
  for (const statement of program.body) {
    if (statement.type === utils.AST_NODE_TYPES.ImportDeclaration) {
      const source = statement.source.value;
      if (source === "@mionkit/router" || source === "@mionkit/router/") {
        for (const specifier of statement.specifiers) {
          if (specifier.type === utils.AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === utils.AST_NODE_TYPES.Identifier) {
            const name = specifier.imported.name;
            if (ROUTER_FUNCTIONS.includes(name)) {
              routerFunctions.add(name);
            }
            if (HANDLER_TYPES.includes(name)) {
              handlerTypes.add(name);
            }
          }
        }
      }
    }
  }
  return { routerFunctions, handlerTypes };
}
function getRouterFunctionName(node, importCache) {
  if (node.callee.type !== utils.AST_NODE_TYPES.Identifier) {
    return null;
  }
  const functionName = node.callee.name;
  if (importCache.routerFunctions.has(functionName)) {
    return functionName;
  }
  return null;
}
function buildFunctionCache(program) {
  const cache = /* @__PURE__ */ new Map();
  for (const statement of program.body) {
    if (statement.type === utils.AST_NODE_TYPES.FunctionDeclaration && statement.id?.name) {
      cache.set(statement.id.name, statement);
    }
    if (statement.type === utils.AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (declarator.id.type === utils.AST_NODE_TYPES.Identifier) {
          if (declarator.init?.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || declarator.init?.type === utils.AST_NODE_TYPES.FunctionExpression) {
            cache.set(declarator.id.name, declarator.init);
          }
        }
      }
    }
  }
  return cache;
}
function getHandlerFunction(node, functionCache) {
  const handlerIndex = 0;
  if (node.arguments.length <= handlerIndex) {
    return null;
  }
  const handlerArg = node.arguments[handlerIndex];
  if (handlerArg.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || handlerArg.type === utils.AST_NODE_TYPES.FunctionExpression) {
    return handlerArg;
  }
  if (handlerArg.type === utils.AST_NODE_TYPES.Identifier) {
    return functionCache.get(handlerArg.name) ?? null;
  }
  return null;
}
function hasExplicitReturnType(func) {
  return func.returnType !== void 0;
}
function isPrimitiveLiteral(node) {
  if (node.type === utils.AST_NODE_TYPES.Literal) {
    const value = node.value;
    if ("bigint" in node) {
      return true;
    }
    return typeof value === "boolean" || typeof value === "string" || typeof value === "number" || value === null;
  }
  if (node.type === utils.AST_NODE_TYPES.Identifier && node.name === "undefined") {
    return true;
  }
  if (node.type === utils.AST_NODE_TYPES.UnaryExpression && node.operator === "-" && node.argument.type === utils.AST_NODE_TYPES.Literal) {
    return typeof node.argument.value === "number";
  }
  return false;
}
function validateParameterTypes(func) {
  const missingTypeParams = [];
  const missingParamNodes = [];
  for (let i = 1; i < func.params.length; i++) {
    const param = func.params[i];
    if (param.type === utils.AST_NODE_TYPES.Identifier) {
      if (!param.typeAnnotation) {
        missingTypeParams.push(param.name);
        missingParamNodes.push(param);
      }
    } else if (param.type === utils.AST_NODE_TYPES.RestElement) {
      if (param.argument.type === utils.AST_NODE_TYPES.Identifier && !param.typeAnnotation) {
        missingTypeParams.push(`...${param.argument.name}`);
        missingParamNodes.push(param);
      }
    } else if (param.type === utils.AST_NODE_TYPES.ArrayPattern || param.type === utils.AST_NODE_TYPES.ObjectPattern) {
      if (!param.typeAnnotation) {
        missingTypeParams.push(`parameter ${i + 1}`);
        missingParamNodes.push(param);
      }
    } else if (param.type === utils.AST_NODE_TYPES.AssignmentPattern) {
      const hasTypeAnnotationOnPattern = param.typeAnnotation !== void 0;
      const hasTypeAnnotationOnLeft = param.left.type === utils.AST_NODE_TYPES.Identifier && param.left.typeAnnotation !== void 0;
      const hasTypeAnnotation = hasTypeAnnotationOnPattern || hasTypeAnnotationOnLeft;
      const hasPrimitiveDefault = isPrimitiveLiteral(param.right);
      if (!hasTypeAnnotation && !hasPrimitiveDefault) {
        const paramName = param.left.type === utils.AST_NODE_TYPES.Identifier ? param.left.name : `parameter ${i + 1}`;
        missingTypeParams.push(paramName);
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
  if (param.type === utils.AST_NODE_TYPES.Identifier) {
    return param.name;
  } else if (param.type === utils.AST_NODE_TYPES.RestElement && param.argument.type === utils.AST_NODE_TYPES.Identifier) {
    return `...${param.argument.name}`;
  } else if (param.type === utils.AST_NODE_TYPES.ArrayPattern) {
    return "[...]";
  } else if (param.type === utils.AST_NODE_TYPES.ObjectPattern) {
    return "{...}";
  } else if (param.type === utils.AST_NODE_TYPES.AssignmentPattern) {
    if (param.left.type === utils.AST_NODE_TYPES.Identifier) {
      return param.left.name;
    }
    return "param";
  }
  return "param";
}
function getReturnTypeReportNode(func) {
  if ((func.type === utils.AST_NODE_TYPES.FunctionDeclaration || func.type === utils.AST_NODE_TYPES.FunctionExpression) && func.id) {
    return func.id;
  }
  return func;
}
function getHandlerTypeFromAnnotation(typeAnnotation, importCache) {
  if (typeAnnotation.typeAnnotation.type === utils.AST_NODE_TYPES.TSTypeReference) {
    const typeName = typeAnnotation.typeAnnotation.typeName;
    if (typeName.type === utils.AST_NODE_TYPES.Identifier) {
      const name = typeName.name;
      if ((name === "Handler" || name === "HeaderHandler") && importCache.handlerTypes.has(name)) {
        return name;
      }
    }
  }
  return null;
}
function getHandlerTypeFromSatisfies(satisfiesExpression, importCache) {
  if (satisfiesExpression.typeAnnotation.type === utils.AST_NODE_TYPES.TSTypeReference) {
    const typeName = satisfiesExpression.typeAnnotation.typeName;
    if (typeName.type === utils.AST_NODE_TYPES.Identifier) {
      const name = typeName.name;
      if ((name === "Handler" || name === "HeaderHandler") && importCache.handlerTypes.has(name)) {
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
      if (commentText.includes("@mion:linkedFn")) {
        return "LinkedFnHandler";
      }
      if (commentText.includes("@mion:headersFn")) {
        return "HeaderHandler";
      }
    }
  }
  return null;
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
    let importCache = null;
    let functionCache = null;
    return {
      // Build caches once when we start processing the file
      Program(node) {
        importCache = buildImportCache(node);
        functionCache = buildFunctionCache(node);
      },
      CallExpression(node) {
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
        if (!importCache) return;
        if (node.id.type === utils.AST_NODE_TYPES.Identifier) {
          let handlerType = null;
          if (node.id.typeAnnotation) {
            handlerType = getHandlerTypeFromAnnotation(node.id.typeAnnotation, importCache);
          }
          if (!handlerType && node.parent?.type === utils.AST_NODE_TYPES.VariableDeclaration) {
            handlerType = getHandlerTypeFromJSDoc(node.parent, context);
          }
          if (handlerType && (node.init?.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || node.init?.type === utils.AST_NODE_TYPES.FunctionExpression)) {
            checkHandlerFunction(node.init, handlerType, context);
          }
        }
      },
      // Check satisfies expressions
      TSSatisfiesExpression(node) {
        if (!importCache) return;
        const handlerType = getHandlerTypeFromSatisfies(node, importCache);
        if (handlerType && (node.expression.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || node.expression.type === utils.AST_NODE_TYPES.FunctionExpression)) {
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
  if (handlerType === "HeaderHandler") return "headersFn";
  if (handlerType === "LinkedFnHandler") return "linkedFn";
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
module.exports = rule;
//# sourceMappingURL=strong-typed-routes.js.map
