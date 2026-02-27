"use strict";
const utils = require("@typescript-eslint/utils");
const ROUTER_FUNCTIONS = ["route", "middleFn", "headersFn"];
const HANDLER_TYPES = ["Handler", "HeaderHandler"];
function buildRouterImportCache(program) {
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
function buildTypeOnlyImportCache(program) {
  const typeOnlyImports = /* @__PURE__ */ new Map();
  for (const statement of program.body) {
    if (statement.type === utils.AST_NODE_TYPES.ImportDeclaration) {
      const isTypeOnlyImport = statement.importKind === "type";
      for (const specifier of statement.specifiers) {
        if (specifier.type === utils.AST_NODE_TYPES.ImportSpecifier) {
          const isTypeOnlySpecifier = specifier.importKind === "type";
          if (isTypeOnlyImport || isTypeOnlySpecifier) {
            const localName = specifier.local.name;
            typeOnlyImports.set(localName, statement);
          }
        }
      }
    }
  }
  return { typeOnlyImports };
}
function getRouterFunctionName(node, importCache) {
  if (node.callee.type !== utils.AST_NODE_TYPES.Identifier) return null;
  const functionName = node.callee.name;
  if (importCache.routerFunctions.has(functionName)) return functionName;
  return null;
}
function extractTypeReferencesWithNodes(typeNode) {
  if (!typeNode) return [];
  const references = [];
  switch (typeNode.type) {
    case utils.AST_NODE_TYPES.TSTypeReference:
      if (typeNode.typeName.type === utils.AST_NODE_TYPES.Identifier) {
        references.push({ typeName: typeNode.typeName.name, node: typeNode });
      }
      if (typeNode.typeArguments) {
        for (const param of typeNode.typeArguments.params) {
          references.push(...extractTypeReferencesWithNodes(param));
        }
      }
      break;
    case utils.AST_NODE_TYPES.TSUnionType:
    case utils.AST_NODE_TYPES.TSIntersectionType:
      for (const member of typeNode.types) {
        references.push(...extractTypeReferencesWithNodes(member));
      }
      break;
    case utils.AST_NODE_TYPES.TSArrayType:
      references.push(...extractTypeReferencesWithNodes(typeNode.elementType));
      break;
    case utils.AST_NODE_TYPES.TSTupleType:
      for (const element of typeNode.elementTypes) {
        references.push(...extractTypeReferencesWithNodes(element));
      }
      break;
    case utils.AST_NODE_TYPES.TSTypeLiteral:
      for (const member of typeNode.members) {
        if (member.type === utils.AST_NODE_TYPES.TSPropertySignature && member.typeAnnotation) {
          references.push(...extractTypeReferencesWithNodes(member.typeAnnotation.typeAnnotation));
        }
      }
      break;
    case utils.AST_NODE_TYPES.TSConditionalType:
      references.push(...extractTypeReferencesWithNodes(typeNode.checkType));
      references.push(...extractTypeReferencesWithNodes(typeNode.extendsType));
      references.push(...extractTypeReferencesWithNodes(typeNode.trueType));
      references.push(...extractTypeReferencesWithNodes(typeNode.falseType));
      break;
    case utils.AST_NODE_TYPES.TSMappedType:
      references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
      break;
    case utils.AST_NODE_TYPES.TSIndexedAccessType:
      references.push(...extractTypeReferencesWithNodes(typeNode.objectType));
      references.push(...extractTypeReferencesWithNodes(typeNode.indexType));
      break;
    case utils.AST_NODE_TYPES.TSTypeOperator:
      references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
      break;
    case utils.AST_NODE_TYPES.TSRestType:
      references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
      break;
    case utils.AST_NODE_TYPES.TSOptionalType:
      references.push(...extractTypeReferencesWithNodes(typeNode.typeAnnotation));
      break;
    case utils.AST_NODE_TYPES.TSFunctionType:
    case utils.AST_NODE_TYPES.TSConstructorType:
      for (const param of typeNode.params) {
        if ("typeAnnotation" in param && param.typeAnnotation) {
          references.push(...extractTypeReferencesWithNodes(param.typeAnnotation.typeAnnotation));
        }
      }
      if (typeNode.returnType) {
        references.push(...extractTypeReferencesWithNodes(typeNode.returnType.typeAnnotation));
      }
      break;
  }
  return references;
}
function getParamTypeAnnotation(param) {
  if (param.type === utils.AST_NODE_TYPES.Identifier && param.typeAnnotation) {
    return param.typeAnnotation.typeAnnotation;
  }
  if (param.type === utils.AST_NODE_TYPES.RestElement && param.typeAnnotation) {
    return param.typeAnnotation.typeAnnotation;
  }
  if (param.type === utils.AST_NODE_TYPES.ArrayPattern && param.typeAnnotation) {
    return param.typeAnnotation.typeAnnotation;
  }
  if (param.type === utils.AST_NODE_TYPES.ObjectPattern && param.typeAnnotation) {
    return param.typeAnnotation.typeAnnotation;
  }
  if (param.type === utils.AST_NODE_TYPES.AssignmentPattern) {
    if (param.typeAnnotation) {
      return param.typeAnnotation.typeAnnotation;
    }
    if (param.left.type === utils.AST_NODE_TYPES.Identifier && param.left.typeAnnotation) {
      return param.left.typeAnnotation.typeAnnotation;
    }
  }
  return null;
}
function extractParamTypeReferencesWithNodes(params) {
  const references = [];
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
function extractReturnTypeReferencesWithNodes(node) {
  if (node.returnType) {
    return extractTypeReferencesWithNodes(node.returnType.typeAnnotation);
  }
  return [];
}
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow type-only imports for types used in route/middleFn parameters or return types. Type-only imports are erased at runtime, preventing mion from generating validation and serialization functions."
    },
    messages: {
      noTypeImports: 'Type "{{typeName}}" is imported as type-only but is used in a route/middleFn. Remove the "type" keyword from the import to allow runtime type reflection.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let routerImportCache = null;
    let typeOnlyImportCache = null;
    function checkTypeReferencesWithNodes(typeRefs) {
      if (!typeOnlyImportCache) return;
      const reportedTypes = /* @__PURE__ */ new Set();
      for (const { typeName, node } of typeRefs) {
        if (reportedTypes.has(typeName)) continue;
        const importDecl = typeOnlyImportCache.typeOnlyImports.get(typeName);
        if (importDecl) {
          reportedTypes.add(typeName);
          context.report({
            node,
            messageId: "noTypeImports",
            data: { typeName }
          });
        }
      }
    }
    function checkFunctionNode(funcNode) {
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
      CallExpression(node) {
        if (!routerImportCache || !typeOnlyImportCache) return;
        const routerFunctionName = getRouterFunctionName(node, routerImportCache);
        if (!routerFunctionName) return;
        const handler = node.arguments[0];
        if (!handler) return;
        if (handler.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || handler.type === utils.AST_NODE_TYPES.FunctionExpression) {
          checkFunctionNode(handler);
        } else if (handler.type === utils.AST_NODE_TYPES.Identifier) ;
      },
      // Check functions with Handler/HeaderHandler type annotations
      VariableDeclarator(node) {
        if (!routerImportCache || !typeOnlyImportCache) return;
        if (node.id.type === utils.AST_NODE_TYPES.Identifier && node.id.typeAnnotation) {
          const typeAnnotation = node.id.typeAnnotation.typeAnnotation;
          if (typeAnnotation.type === utils.AST_NODE_TYPES.TSTypeReference && typeAnnotation.typeName.type === utils.AST_NODE_TYPES.Identifier && routerImportCache.handlerTypes.has(typeAnnotation.typeName.name)) {
            if (node.init && (node.init.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || node.init.type === utils.AST_NODE_TYPES.FunctionExpression)) {
              checkFunctionNode(node.init);
            }
          }
        }
        if (node.init && node.init.type === utils.AST_NODE_TYPES.TSSatisfiesExpression && node.init.typeAnnotation.type === utils.AST_NODE_TYPES.TSTypeReference && node.init.typeAnnotation.typeName.type === utils.AST_NODE_TYPES.Identifier && routerImportCache.handlerTypes.has(node.init.typeAnnotation.typeName.name)) {
          const expr = node.init.expression;
          if (expr.type === utils.AST_NODE_TYPES.ArrowFunctionExpression || expr.type === utils.AST_NODE_TYPES.FunctionExpression) {
            checkFunctionNode(expr);
          }
        }
      },
      // Check function declarations with JSDoc tags
      FunctionDeclaration(node) {
        if (!routerImportCache || !typeOnlyImportCache) return;
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getCommentsBefore(node);
        for (const comment of comments) {
          if (comment.type === "Block" && (comment.value.includes("@mion:route") || comment.value.includes("@mion:middleFn") || comment.value.includes("@mion:headersFn"))) {
            checkFunctionNode(node);
            break;
          }
        }
      }
    };
  }
};
module.exports = rule;
//# sourceMappingURL=no-type-imports.cjs.map
