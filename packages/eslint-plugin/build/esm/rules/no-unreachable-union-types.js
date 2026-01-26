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
function isSupersetOf(typeAProps, typeBProps) {
  const typeARequired = typeAProps.filter((p) => !p.isOptional);
  const typeBRequired = typeBProps.filter((p) => !p.isOptional);
  if (typeARequired.length < typeBRequired.length) return false;
  const isMoreSpecific = typeAProps.length > typeBProps.length || typeAProps.length === typeBProps.length && typeARequired.length > typeBRequired.length;
  if (!isMoreSpecific) return false;
  for (const propB of typeBProps) {
    const propA = typeAProps.find((p) => p.name === propB.name);
    if (!propA) return false;
  }
  return true;
}
function findUnreachableTypes(unionNode) {
  const issues = [];
  const typesWithProps = [];
  for (const typeNode of unionNode.types) {
    const props = getObjectTypeProperties(typeNode);
    if (props && props.length > 0) {
      typesWithProps.push({ node: typeNode, props });
    }
  }
  for (let i = 0; i < typesWithProps.length; i++) {
    for (let j = i + 1; j < typesWithProps.length; j++) {
      const typeA = typesWithProps[i];
      const typeB = typesWithProps[j];
      if (isSupersetOf(typeB.props, typeA.props)) {
        issues.push({ unreachable: typeB.node, blocker: typeA.node });
      }
    }
  }
  return issues;
}
function getTypeDescription(node) {
  if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
    const props = getObjectTypeProperties(node);
    if (props) {
      return `{${props.map((p) => p.isOptional ? `${p.name}?` : p.name).join(", ")}}`;
    }
  }
  return "object type";
}
function getRouterFunctionName(func, context) {
  const parent = func.parent;
  if ((parent == null ? void 0 : parent.type) === AST_NODE_TYPES.CallExpression) {
    if (parent.callee.type === AST_NODE_TYPES.Identifier) {
      const functionName = parent.callee.name;
      if (["route", "linkedFn", "headersLinkedFn"].includes(functionName) && isImportedFromMionRouter(functionName, context)) {
        return functionName;
      }
    }
  }
  return null;
}
function isInCheckableParameter(node, func, routerFunctionName) {
  let current = node.parent;
  while (current && current !== func) {
    if (current.type === AST_NODE_TYPES.Identifier || current.type === AST_NODE_TYPES.ArrayPattern || current.type === AST_NODE_TYPES.ObjectPattern) {
      const paramIndex = func.params.indexOf(current);
      if (paramIndex !== -1) {
        if ((routerFunctionName === "route" || routerFunctionName === "linkedFn") && paramIndex >= 1) {
          return true;
        }
        if (routerFunctionName === "headersLinkedFn" && paramIndex >= 2) {
          return true;
        }
        return false;
      }
    }
    current = current.parent;
  }
  return false;
}
function isRouterUnionType(node, context) {
  var _a, _b;
  let current = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.ArrowFunctionExpression || current.type === AST_NODE_TYPES.FunctionExpression || current.type === AST_NODE_TYPES.FunctionDeclaration) {
      const routerFunctionName = getRouterFunctionName(current, context);
      if (routerFunctionName) {
        if (((_a = current.returnType) == null ? void 0 : _a.typeAnnotation) === node || isDescendantOf(node, (_b = current.returnType) == null ? void 0 : _b.typeAnnotation)) {
          return true;
        }
        if (isInCheckableParameter(node, current, routerFunctionName)) {
          return true;
        }
      }
    }
    if (current.type === AST_NODE_TYPES.TSTypeAnnotation) {
      const typeAnnotationParent = current.parent;
      if ((typeAnnotationParent == null ? void 0 : typeAnnotationParent.type) === AST_NODE_TYPES.Identifier) {
        const declarator = typeAnnotationParent.parent;
        if ((declarator == null ? void 0 : declarator.type) === AST_NODE_TYPES.VariableDeclarator) {
          if (current.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
            const typeName = current.typeAnnotation.typeName;
            if (typeName.type === AST_NODE_TYPES.Identifier) {
              if ((typeName.name === "Handler" || typeName.name === "HeaderHandler") && isImportedFromMionRouter(typeName.name, context)) {
                return true;
              }
            }
          }
        }
      }
    }
    current = current.parent;
  }
  return false;
}
function isDescendantOf(node, ancestor) {
  if (!node || !ancestor) return false;
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
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
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Detect union types where one interface is unreachable at runtime when using isType function because a subset type comes before it"
    },
    messages: {
      unreachableUnionType: "Union type {{unreachableType}} is unreachable at runtime when doing type checking because {{blockerType}} will always match first. To fix this move the more specific type {{unreachableType}} first within the union, ie: {{unreachableType}} | {{blockerType}} "
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      TSUnionType(node) {
        if (!isRouterUnionType(node, context)) {
          return;
        }
        const issues = findUnreachableTypes(node);
        for (const issue of issues) {
          context.report({
            node,
            messageId: "unreachableUnionType",
            data: {
              unreachableType: getTypeDescription(issue.unreachable),
              blockerType: getTypeDescription(issue.blocker)
            }
          });
        }
      },
      TSTypeReference(node) {
        const unionType = resolveTypeReference(node, context);
        if (!unionType) {
          return;
        }
        if (!isRouterUnionType(node, context)) {
          return;
        }
        const issues = findUnreachableTypes(unionType);
        for (const issue of issues) {
          context.report({
            node,
            messageId: "unreachableUnionType",
            data: {
              unreachableType: getTypeDescription(issue.unreachable),
              blockerType: getTypeDescription(issue.blocker)
            }
          });
        }
      }
    };
  }
};
export {
  rule as default
};
//# sourceMappingURL=no-unreachable-union-types.js.map
