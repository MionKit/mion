import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { PURE_FN_SOURCE_PACKAGES, FORBIDDEN_IDENTIFIERS, ALLOWED_GLOBALS } from "../../pureFns/purityRules.js";
function buildPureFnImportCache(program) {
  const pureFnNames = /* @__PURE__ */ new Map();
  for (const statement of program.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;
    const source = statement.source.value;
    if (!PURE_FN_SOURCE_PACKAGES.includes(source)) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier) {
        const importedName = specifier.imported.name;
        if (importedName === "pureServerFn" || importedName === "registerPureFnFactory") {
          pureFnNames.set(specifier.local.name, importedName);
        }
      }
    }
  }
  return { pureFnNames };
}
function collectBindingNames(node, scope) {
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      scope.add(node.name);
      break;
    case AST_NODE_TYPES.ObjectPattern:
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          collectBindingNames(prop.value, scope);
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          collectBindingNames(prop.argument, scope);
        }
      }
      break;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of node.elements) {
        if (element) collectBindingNames(element, scope);
      }
      break;
    case AST_NODE_TYPES.RestElement:
      collectBindingNames(node.argument, scope);
      break;
    case AST_NODE_TYPES.AssignmentPattern:
      collectBindingNames(node.left, scope);
      break;
  }
}
function collectLocalDeclarations(node, scope) {
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    collectBindingNames(node.id, scope);
  }
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id) {
    scope.add(node.id.name);
  }
  if (node.type === AST_NODE_TYPES.FunctionExpression && node.id) {
    scope.add(node.id.name);
    for (const param of node.params) collectBindingNames(param, scope);
    return;
  }
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    for (const param of node.params) collectBindingNames(param, scope);
    return;
  }
  if ((node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement) && node.left.type === AST_NODE_TYPES.VariableDeclaration) {
    for (const decl of node.left.declarations) {
      collectBindingNames(decl.id, scope);
    }
  }
  if (node.type === AST_NODE_TYPES.CatchClause && node.param) {
    collectBindingNames(node.param, scope);
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (child && typeof child === "object") {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            collectLocalDeclarations(item, scope);
          }
        }
      } else if ("type" in child) {
        collectLocalDeclarations(child, scope);
      }
    }
  }
}
function collectLocalScope(fnNode) {
  const scope = /* @__PURE__ */ new Set();
  for (const param of fnNode.params) {
    collectBindingNames(param, scope);
  }
  if (fnNode.type === AST_NODE_TYPES.FunctionExpression && fnNode.id) {
    scope.add(fnNode.id.name);
  }
  collectLocalDeclarations(fnNode.body, scope);
  return scope;
}
function checkPurityViolations(body, localScope, fnTypeLabel, context) {
  const forbiddenSet = FORBIDDEN_IDENTIFIERS;
  function visit(node) {
    if (node.type === AST_NODE_TYPES.ThisExpression) {
      context.report({ node, messageId: "purityThis", data: { fnType: fnTypeLabel } });
    }
    if (node.type === AST_NODE_TYPES.AwaitExpression) {
      context.report({ node, messageId: "purityAwait", data: { fnType: fnTypeLabel } });
    }
    if (node.type === AST_NODE_TYPES.YieldExpression) {
      context.report({ node, messageId: "purityYield", data: { fnType: fnTypeLabel } });
    }
    if (node.type === AST_NODE_TYPES.ImportExpression) {
      context.report({ node, messageId: "purityDynamicImport", data: { fnType: fnTypeLabel } });
    }
    if (node.type === AST_NODE_TYPES.Identifier) {
      const name = node.name;
      if (node.parent?.type === AST_NODE_TYPES.MemberExpression && node.parent.property === node && !node.parent.computed) {
        return;
      }
      if (node.parent?.type === AST_NODE_TYPES.Property && node.parent.key === node && !node.parent.computed && !node.parent.shorthand) {
        return;
      }
      if (forbiddenSet.has(name)) {
        context.report({
          node,
          messageId: "purityForbiddenIdentifier",
          data: { name, fnType: fnTypeLabel }
        });
        return;
      }
      if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
        context.report({
          node,
          messageId: "purityClosureVariable",
          data: { name, fnType: fnTypeLabel }
        });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (child && typeof child === "object") {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && "type" in item) {
              visit(item);
            }
          }
        } else if ("type" in child) {
          visit(child);
        }
      }
    }
  }
  visit(body);
}
function resolveVariableInitializer(name, program) {
  for (const statement of program.body) {
    if (statement.type !== AST_NODE_TYPES.VariableDeclaration) continue;
    for (const decl of statement.declarations) {
      if (decl.id.type === AST_NODE_TYPES.Identifier && decl.id.name === name && decl.init) {
        return decl.init;
      }
    }
  }
  return null;
}
function resolveToExpression(node, program) {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return resolveVariableInitializer(node.name, program);
  }
  return node;
}
function extractFromObjectExpression(obj, program) {
  let fnNode = null;
  let isFactory = false;
  for (const prop of obj.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;
    if (prop.key.name === "pureFn") {
      const resolved = resolveToExpression(prop.value, program);
      if (resolved && (resolved.type === AST_NODE_TYPES.FunctionExpression || resolved.type === AST_NODE_TYPES.ArrowFunctionExpression)) {
        fnNode = resolved;
      }
    }
    if (prop.key.name === "isFactory") {
      if (prop.value.type === AST_NODE_TYPES.Literal && prop.value.value === true) {
        isFactory = true;
      }
    }
  }
  if (fnNode) return { fnNode, isFactory };
  return null;
}
function extractPureServerFnTarget(node, program) {
  const arg = node.arguments[0];
  if (!arg) return null;
  const resolved = resolveToExpression(arg, program);
  if (!resolved) return null;
  if (resolved.type === AST_NODE_TYPES.FunctionExpression || resolved.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return { fnNode: resolved, isFactory: false };
  }
  if (resolved.type === AST_NODE_TYPES.ObjectExpression) {
    return extractFromObjectExpression(resolved, program);
  }
  return null;
}
function extractFactoryFnTarget(node, program) {
  const fnArg = node.arguments[2];
  if (!fnArg) return null;
  const resolved = resolveToExpression(fnArg, program);
  if (!resolved) return null;
  if (resolved.type === AST_NODE_TYPES.FunctionExpression || resolved.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return { fnNode: resolved, isFactory: true };
  }
  return null;
}
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Validate that functions passed to pureServerFn() and registerPureFnFactory() are pure and do not use forbidden identifiers, closures, or side effects."
    },
    messages: {
      purityThis: "'this' is not allowed in {{fnType}}",
      purityAwait: "async/await is not allowed in {{fnType}}",
      purityYield: "generators are not allowed in {{fnType}}",
      purityDynamicImport: "Dynamic import() is not allowed in {{fnType}}",
      purityForbiddenIdentifier: '"{{name}}" is not allowed in {{fnType}}',
      purityClosureVariable: 'Closure variable "{{name}}" is not allowed in {{fnType}}. Pure functions cannot access outer scope variables.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let importCache = null;
    let programNode = null;
    return {
      Program(node) {
        programNode = node;
        importCache = buildPureFnImportCache(node);
      },
      CallExpression(node) {
        if (!importCache || !programNode || importCache.pureFnNames.size === 0) return;
        if (node.callee.type !== AST_NODE_TYPES.Identifier) return;
        const importedName = importCache.pureFnNames.get(node.callee.name);
        if (!importedName) return;
        let target = null;
        if (importedName === "pureServerFn") {
          target = extractPureServerFnTarget(node, programNode);
        } else if (importedName === "registerPureFnFactory") {
          target = extractFactoryFnTarget(node, programNode);
        }
        if (!target) return;
        const fnTypeLabel = target.isFactory ? "factory functions" : "pure functions";
        const localScope = collectLocalScope(target.fnNode);
        checkPurityViolations(target.fnNode.body, localScope, fnTypeLabel, context);
      }
    };
  }
};
export {
  rule as default
};
//# sourceMappingURL=pure-functions.js.map
