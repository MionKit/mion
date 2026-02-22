import { AST_NODE_TYPES } from "@typescript-eslint/utils";
function getObjectTypeProperties(node) {
  if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
    const props = [];
    for (const member of node.members) {
      if (member.type === AST_NODE_TYPES.TSPropertySignature && member.key.type === AST_NODE_TYPES.Identifier) {
        props.push({ name: member.key.name, isOptional: !!member.optional });
      }
    }
    return props;
  }
  return null;
}
function getUnionObjectTypes(unionNode) {
  const types = [];
  for (const typeNode of unionNode.types) {
    const props = getObjectTypeProperties(typeNode);
    if (props && props.length > 0) {
      types.push({ node: typeNode, properties: props });
    }
  }
  return types;
}
function getObjectLiteralPropertyNames(node) {
  const names = [];
  for (const prop of node.properties) {
    if (prop.type === AST_NODE_TYPES.Property && prop.key.type === AST_NODE_TYPES.Identifier) {
      names.push(prop.key.name);
    }
  }
  return names;
}
function getMatchingUnionTypes(objectProps, unionTypes) {
  const matchingIndices = [];
  for (let i = 0; i < unionTypes.length; i++) {
    const unionPropNames = new Set(unionTypes[i].properties.map((p) => p.name));
    if (objectProps.some((prop) => unionPropNames.has(prop))) {
      matchingIndices.push(i);
    }
  }
  return matchingIndices;
}
function getUniquePropertiesPerType(unionTypes) {
  const allProps = /* @__PURE__ */ new Map();
  for (let i = 0; i < unionTypes.length; i++) {
    for (const prop of unionTypes[i].properties) {
      const existing = allProps.get(prop.name) || [];
      existing.push(i);
      allProps.set(prop.name, existing);
    }
  }
  const uniqueProps = /* @__PURE__ */ new Map();
  for (let i = 0; i < unionTypes.length; i++) {
    const unique = /* @__PURE__ */ new Set();
    for (const prop of unionTypes[i].properties) {
      if ((allProps.get(prop.name) || []).length === 1) {
        unique.add(prop.name);
      }
    }
    uniqueProps.set(i, unique);
  }
  return uniqueProps;
}
function resolveTypeReference(node, context) {
  if (node.type !== AST_NODE_TYPES.TSTypeReference) {
    return null;
  }
  if (node.typeName.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }
  const typeName = node.typeName.name;
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
      if (statement.id.name === typeName && statement.typeAnnotation.type === AST_NODE_TYPES.TSUnionType) {
        return statement.typeAnnotation;
      }
    }
  }
  return null;
}
function getReturnTypeAnnotation(func, context) {
  const returnType = func.returnType?.typeAnnotation;
  if (!returnType) {
    return null;
  }
  if (returnType.type === AST_NODE_TYPES.TSUnionType) {
    return returnType;
  }
  if (returnType.type === AST_NODE_TYPES.TSTypeReference) {
    return resolveTypeReference(returnType, context);
  }
  return null;
}
function findReturnStatements(func) {
  const returns = [];
  if (func.type === AST_NODE_TYPES.ArrowFunctionExpression && func.expression && func.body.type !== AST_NODE_TYPES.BlockStatement) {
    returns.push(func.body);
    return returns;
  }
  if (func.body.type === AST_NODE_TYPES.BlockStatement) {
    findReturnsInBlock(func.body, returns);
  }
  return returns;
}
function findReturnsInBlock(block, returns) {
  for (const statement of block.body) {
    if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
      returns.push(statement.argument);
    } else if (statement.type === AST_NODE_TYPES.IfStatement) {
      if (statement.consequent.type === AST_NODE_TYPES.BlockStatement) {
        findReturnsInBlock(statement.consequent, returns);
      } else if (statement.consequent.type === AST_NODE_TYPES.ReturnStatement && statement.consequent.argument) {
        returns.push(statement.consequent.argument);
      }
      if (statement.alternate?.type === AST_NODE_TYPES.BlockStatement) {
        findReturnsInBlock(statement.alternate, returns);
      } else if (statement.alternate?.type === AST_NODE_TYPES.ReturnStatement && statement.alternate.argument) {
        returns.push(statement.alternate.argument);
      }
    }
  }
}
function getConflictDescription(objectProps, unionTypes, matchingIndices) {
  const uniqueProps = getUniquePropertiesPerType(unionTypes);
  const conflicts = [];
  for (const idx of matchingIndices) {
    const unique = uniqueProps.get(idx) || /* @__PURE__ */ new Set();
    const matchingProps = objectProps.filter((p) => unique.has(p));
    if (matchingProps.length > 0) {
      conflicts.push(`'${matchingProps.join("', '")}' from type ${idx + 1}`);
    }
  }
  return conflicts.join(" and ");
}
function isRouterFunction(node, context) {
  let current = node;
  while (current) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      return isRouterFunctionCall(current, context);
    }
    current = current.parent;
  }
  return false;
}
function isRouterFunctionCall(node, context) {
  const routerFunctions = ["route", "linkedFn", "headersFn"];
  if (node.callee.type !== AST_NODE_TYPES.Identifier || !routerFunctions.includes(node.callee.name)) {
    return false;
  }
  return isImportedFromMionRouter(node.callee.name, context);
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
function checkFunction(func, context) {
  if (!isRouterFunction(func, context)) return;
  const unionType = getReturnTypeAnnotation(func, context);
  if (!unionType) return;
  const unionTypes = getUnionObjectTypes(unionType);
  if (unionTypes.length < 2) return;
  const returnStatements = findReturnStatements(func);
  for (const returnNode of returnStatements) {
    if (returnNode.type !== AST_NODE_TYPES.ObjectExpression) continue;
    const objectProps = getObjectLiteralPropertyNames(returnNode);
    if (objectProps.length === 0) continue;
    const matchingIndices = getMatchingUnionTypes(objectProps, unionTypes);
    const uniqueProps = getUniquePropertiesPerType(unionTypes);
    const typesWithUniqueMatches = matchingIndices.filter((idx) => {
      const unique = uniqueProps.get(idx) || /* @__PURE__ */ new Set();
      return objectProps.some((prop) => unique.has(prop));
    });
    if (typesWithUniqueMatches.length > 1) {
      const conflicts = getConflictDescription(objectProps, unionTypes, typesWithUniqueMatches);
      context.report({ node: returnNode, messageId: "mixedUnionProperties", data: { conflicts } });
    }
  }
}
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Detect object literals with properties from multiple union types in router handlers" },
    messages: {
      mixedUnionProperties: "Object literal has properties from multiple union types: {{conflicts}}. With loose union matching, only the first matching type will be used for serialization."
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        checkFunction(node, context);
      },
      FunctionExpression(node) {
        checkFunction(node, context);
      },
      FunctionDeclaration(node) {
        checkFunction(node, context);
      }
    };
  }
};
export {
  rule as default
};
//# sourceMappingURL=no-mixed-union-properties.js.map
