"use strict";
const utils = require("@typescript-eslint/utils");
const purityRules = require("../../pureFns/purityRules.js");
function buildPureFnImportCache(program) {
  const pureFnNames = /* @__PURE__ */ new Map();
  for (const statement of program.body) {
    if (statement.type !== utils.AST_NODE_TYPES.ImportDeclaration) continue;
    const source = statement.source.value;
    if (!purityRules.PURE_FN_SOURCE_PACKAGES.includes(source)) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === utils.AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === utils.AST_NODE_TYPES.Identifier) {
        const importedName = specifier.imported.name;
        if (importedName === "pureServerFn" || importedName === "registerPureFnFactory" || importedName === "mapFrom") {
          pureFnNames.set(specifier.local.name, importedName);
        }
      }
    }
  }
  return { pureFnNames };
}
function collectBindingNames(node, scope) {
  switch (node.type) {
    case utils.AST_NODE_TYPES.Identifier:
      scope.add(node.name);
      break;
    case utils.AST_NODE_TYPES.ObjectPattern:
      for (const prop of node.properties) {
        if (prop.type === utils.AST_NODE_TYPES.Property) {
          collectBindingNames(prop.value, scope);
        } else if (prop.type === utils.AST_NODE_TYPES.RestElement) {
          collectBindingNames(prop.argument, scope);
        }
      }
      break;
    case utils.AST_NODE_TYPES.ArrayPattern:
      for (const element of node.elements) {
        if (element) collectBindingNames(element, scope);
      }
      break;
    case utils.AST_NODE_TYPES.RestElement:
      collectBindingNames(node.argument, scope);
      break;
    case utils.AST_NODE_TYPES.AssignmentPattern:
      collectBindingNames(node.left, scope);
      break;
  }
}
function collectLocalDeclarations(node, scope) {
  if (node.type === utils.AST_NODE_TYPES.VariableDeclarator) {
    collectBindingNames(node.id, scope);
  }
  if (node.type === utils.AST_NODE_TYPES.FunctionDeclaration) {
    if (node.id) scope.add(node.id.name);
    for (const param of node.params) collectBindingNames(param, scope);
  }
  if (node.type === utils.AST_NODE_TYPES.FunctionExpression) {
    if (node.id) scope.add(node.id.name);
    for (const param of node.params) collectBindingNames(param, scope);
  }
  if (node.type === utils.AST_NODE_TYPES.ArrowFunctionExpression) {
    for (const param of node.params) collectBindingNames(param, scope);
  }
  if ((node.type === utils.AST_NODE_TYPES.ForOfStatement || node.type === utils.AST_NODE_TYPES.ForInStatement) && node.left.type === utils.AST_NODE_TYPES.VariableDeclaration) {
    for (const decl of node.left.declarations) {
      collectBindingNames(decl.id, scope);
    }
  }
  if (node.type === utils.AST_NODE_TYPES.CatchClause && node.param) {
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
  if (fnNode.type === utils.AST_NODE_TYPES.FunctionExpression && fnNode.id) {
    scope.add(fnNode.id.name);
  }
  collectLocalDeclarations(fnNode.body, scope);
  return scope;
}
function checkPurityViolations(body, localScope, fnTypeLabel, context) {
  const forbiddenSet = purityRules.FORBIDDEN_IDENTIFIERS;
  function visit(node) {
    if (node.type === utils.AST_NODE_TYPES.ThisExpression) {
      context.report({ node, messageId: "purityThis", data: { fnType: fnTypeLabel } });
    }
    if (node.type === utils.AST_NODE_TYPES.AwaitExpression) {
      context.report({ node, messageId: "purityAwait", data: { fnType: fnTypeLabel } });
    }
    if (node.type === utils.AST_NODE_TYPES.YieldExpression) {
      context.report({ node, messageId: "purityYield", data: { fnType: fnTypeLabel } });
    }
    if (node.type === utils.AST_NODE_TYPES.ImportExpression) {
      context.report({ node, messageId: "purityDynamicImport", data: { fnType: fnTypeLabel } });
    }
    if (node.type === utils.AST_NODE_TYPES.Identifier) {
      const name = node.name;
      if (node.parent?.type === utils.AST_NODE_TYPES.MemberExpression && node.parent.property === node && !node.parent.computed) {
        return;
      }
      if (node.parent?.type === utils.AST_NODE_TYPES.Property && node.parent.key === node && !node.parent.computed && !node.parent.shorthand) {
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
      if (!localScope.has(name) && !purityRules.ALLOWED_GLOBALS.has(name)) {
        context.report({
          node,
          messageId: "purityClosureVariable",
          data: { name, fnType: fnTypeLabel }
        });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "typeAnnotation" || key === "returnType" || key === "typeParameters" || key === "typeArguments")
        continue;
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
  function search(node) {
    if (node.type === utils.AST_NODE_TYPES.VariableDeclarator) {
      if (node.id.type === utils.AST_NODE_TYPES.Identifier && node.id.name === name && node.init) {
        return node.init;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (child && typeof child === "object") {
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && "type" in item) {
              const result = search(item);
              if (result) return result;
            }
          }
        } else if ("type" in child) {
          const result = search(child);
          if (result) return result;
        }
      }
    }
    return null;
  }
  return search(program);
}
function resolveToExpression(node, program) {
  if (node.type === utils.AST_NODE_TYPES.Identifier) {
    return resolveVariableInitializer(node.name, program);
  }
  return node;
}
function isImportedIdentifier(name, program) {
  for (const statement of program.body) {
    if (statement.type !== utils.AST_NODE_TYPES.ImportDeclaration) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.local.name === name) return true;
    }
  }
  return false;
}
function findUnresolvedIdentifier(arg, program) {
  if (arg.type === utils.AST_NODE_TYPES.Identifier) {
    const resolved = resolveVariableInitializer(arg.name, program);
    if (!resolved) return { name: arg.name, node: arg };
    if (resolved.type === utils.AST_NODE_TYPES.ObjectExpression) {
      return findUnresolvedPureFnInObject(resolved, program);
    }
    return { name: arg.name, node: arg };
  }
  if (arg.type === utils.AST_NODE_TYPES.ObjectExpression) {
    return findUnresolvedPureFnInObject(arg, program);
  }
  return null;
}
function findUnresolvedPureFnInObject(obj, program) {
  for (const prop of obj.properties) {
    if (prop.type !== utils.AST_NODE_TYPES.Property) continue;
    if (prop.key.type !== utils.AST_NODE_TYPES.Identifier || prop.key.name !== "pureFn") continue;
    if (prop.value.type === utils.AST_NODE_TYPES.Identifier) {
      const resolved = resolveToExpression(prop.value, program);
      if (!resolved || resolved.type !== utils.AST_NODE_TYPES.FunctionExpression && resolved.type !== utils.AST_NODE_TYPES.ArrowFunctionExpression) {
        return { name: prop.value.name, node: prop.value };
      }
    }
  }
  return null;
}
function reportUnresolvedArgument(node, callee, program, context) {
  const argIndex = callee === "registerPureFnFactory" ? 2 : callee === "mapFrom" ? 1 : 0;
  const arg = node.arguments[argIndex];
  if (!arg) return;
  const identifierToCheck = findUnresolvedIdentifier(arg, program);
  if (!identifierToCheck) return;
  const name = identifierToCheck.name;
  const reportNode = identifierToCheck.node;
  if (isImportedIdentifier(name, program)) {
    context.report({ node: reportNode, messageId: "importedArgument", data: { callee, name } });
  } else {
    context.report({ node: reportNode, messageId: "unresolvedArgument", data: { callee, name } });
  }
}
function extractFromObjectExpression(obj, program) {
  let fnNode = null;
  let isFactory = false;
  for (const prop of obj.properties) {
    if (prop.type !== utils.AST_NODE_TYPES.Property) continue;
    if (prop.key.type !== utils.AST_NODE_TYPES.Identifier) continue;
    if (prop.key.name === "pureFn") {
      const resolved = resolveToExpression(prop.value, program);
      if (resolved && (resolved.type === utils.AST_NODE_TYPES.FunctionExpression || resolved.type === utils.AST_NODE_TYPES.ArrowFunctionExpression)) {
        fnNode = resolved;
      }
    }
    if (prop.key.name === "isFactory") {
      if (prop.value.type === utils.AST_NODE_TYPES.Literal && prop.value.value === true) {
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
  if (resolved.type === utils.AST_NODE_TYPES.FunctionExpression || resolved.type === utils.AST_NODE_TYPES.ArrowFunctionExpression) {
    return { fnNode: resolved, isFactory: false };
  }
  if (resolved.type === utils.AST_NODE_TYPES.ObjectExpression) {
    return extractFromObjectExpression(resolved, program);
  }
  return null;
}
function extractFactoryFnTarget(node, program) {
  const fnArg = node.arguments[2];
  if (!fnArg) return null;
  const resolved = resolveToExpression(fnArg, program);
  if (!resolved) return null;
  if (resolved.type === utils.AST_NODE_TYPES.FunctionExpression || resolved.type === utils.AST_NODE_TYPES.ArrowFunctionExpression) {
    return { fnNode: resolved, isFactory: true };
  }
  return null;
}
function extractMapFromMapperTarget(node, program) {
  const mapperArg = node.arguments[1];
  if (!mapperArg) return null;
  const resolved = resolveToExpression(mapperArg, program);
  if (!resolved) return null;
  if (resolved.type === utils.AST_NODE_TYPES.FunctionExpression || resolved.type === utils.AST_NODE_TYPES.ArrowFunctionExpression) {
    return { fnNode: resolved, isFactory: false };
  }
  return null;
}
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Validate that functions passed to pureServerFn(), registerPureFnFactory(), and mapFrom() are pure and do not use forbidden identifiers, closures, or side effects."
    },
    messages: {
      purityThis: "'this' is not allowed in {{fnType}}",
      purityAwait: "async/await is not allowed in {{fnType}}",
      purityYield: "generators are not allowed in {{fnType}}",
      purityDynamicImport: "Dynamic import() is not allowed in {{fnType}}",
      purityForbiddenIdentifier: '"{{name}}" is not allowed in {{fnType}}',
      purityClosureVariable: 'Closure variable "{{name}}" is not allowed in {{fnType}}. Pure functions cannot access outer scope variables.',
      importedArgument: '{{callee}}() argument "{{name}}" is imported from another module. Pure functions must be defined inline or as a variable in the same file.',
      unresolvedArgument: '{{callee}}() argument "{{name}}" could not be resolved to a variable declaration in this file. Pure functions must be defined inline or as a variable in the same file.'
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
        if (node.callee.type !== utils.AST_NODE_TYPES.Identifier) return;
        const importedName = importCache.pureFnNames.get(node.callee.name);
        if (!importedName) return;
        let target = null;
        if (importedName === "pureServerFn") {
          target = extractPureServerFnTarget(node, programNode);
        } else if (importedName === "registerPureFnFactory") {
          target = extractFactoryFnTarget(node, programNode);
        } else if (importedName === "mapFrom") {
          target = extractMapFromMapperTarget(node, programNode);
        }
        if (!target) {
          reportUnresolvedArgument(node, importedName, programNode, context);
          return;
        }
        const fnTypeLabel = target.isFactory ? "factory functions" : "pure functions";
        const localScope = collectLocalScope(target.fnNode);
        checkPurityViolations(target.fnNode.body, localScope, fnTypeLabel, context);
      }
    };
  }
};
module.exports = rule;
//# sourceMappingURL=pure-functions.js.map
