"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const ts = require("typescript");
const core = require("@mionkit/core");
const constants = require("./constants.cjs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const ts__namespace = /* @__PURE__ */ _interopNamespaceDefault(ts);
function extractPureFnsFromSource(source, filePath) {
  const results = [];
  if (!source.includes("pureServerFn")) return results;
  const jsSource = stripTypes(source);
  const sourceFile = ts__namespace.createSourceFile(filePath, jsSource, ts__namespace.ScriptTarget.Latest, true, ts__namespace.ScriptKind.JS);
  function visit(node) {
    if (ts__namespace.isCallExpression(node)) {
      const callee = node.expression;
      if (ts__namespace.isIdentifier(callee) && callee.text === "pureServerFn") {
        const extracted = extractPureFnFromCall(node, sourceFile, filePath);
        results.push(extracted);
      }
    }
    ts__namespace.forEachChild(node, visit);
  }
  visit(sourceFile);
  return results;
}
function stripTypes(code) {
  const result = ts__namespace.transpileModule(code, {
    compilerOptions: {
      target: ts__namespace.ScriptTarget.ESNext,
      module: ts__namespace.ModuleKind.ESNext,
      // Remove comments to get cleaner output
      removeComments: true,
      // Don't emit helpers
      importHelpers: false,
      // Preserve newlines for readability
      newLine: ts__namespace.NewLineKind.LineFeed
    }
  });
  return result.outputText.trim();
}
function extractPureFnFromCall(call, sourceFile, filePath) {
  if (call.arguments.length !== 1) {
    throw new PurityError("pureServerFn() requires exactly one function argument", filePath, call.getStart(sourceFile));
  }
  const arg = call.arguments[0];
  if (!ts__namespace.isFunctionExpression(arg) && !ts__namespace.isArrowFunction(arg)) {
    throw new PurityError(
      "pureServerFn() argument must be a function expression or arrow function",
      filePath,
      arg.getStart(sourceFile)
    );
  }
  let fnName;
  if (ts__namespace.isFunctionExpression(arg) && arg.name) {
    fnName = arg.name.text;
  } else if (ts__namespace.isArrowFunction(arg)) {
    fnName = tryGetArrowFunctionName(arg);
  }
  const paramNames = arg.parameters.map((param) => {
    if (!ts__namespace.isIdentifier(param.name)) {
      throw new PurityError(
        "Pure function parameters must be simple identifiers (no destructuring)",
        filePath,
        param.getStart(sourceFile)
      );
    }
    return param.name.text;
  });
  const bodyNode = arg.body;
  validatePurity(bodyNode, new Set(paramNames), fnName, sourceFile, filePath);
  const bodyText = getBodyText(bodyNode, sourceFile);
  const normalizedBody = core.normalizePureFnBody(bodyText);
  const bodyHash = core.createUniqueHash(core.PURE_SERVER_FN_NAMESPACE + normalizedBody, core.pureFnHashLength);
  return {
    fnName,
    // Optional - for debugging purposes
    paramNames,
    code: bodyText,
    bodyHash,
    dependencies: [],
    sourceFile: filePath
  };
}
function tryGetArrowFunctionName(arrow) {
  let parent = arrow.parent;
  while (parent) {
    if (ts__namespace.isVariableDeclaration(parent) && ts__namespace.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts__namespace.isPropertyAssignment(parent) && ts__namespace.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    parent = parent.parent;
  }
  return void 0;
}
function getBodyText(body, sourceFile) {
  if (ts__namespace.isBlock(body)) {
    const fullText = body.getText(sourceFile);
    return fullText.slice(1, -1).trim();
  } else {
    return `return ${body.getText(sourceFile)}`;
  }
}
function validatePurity(body, localScope, fnName, sourceFile, filePath) {
  collectLocalDeclarations(body, localScope);
  if (fnName) localScope.add(fnName);
  function checkNode(node) {
    if (node.kind === ts__namespace.SyntaxKind.ThisKeyword) {
      throw new PurityError("'this' is not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (ts__namespace.isAwaitExpression(node)) {
      throw new PurityError("async/await is not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (node.kind === ts__namespace.SyntaxKind.YieldKeyword) {
      throw new PurityError("generators are not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (ts__namespace.isCallExpression(node) && node.expression.kind === ts__namespace.SyntaxKind.ImportKeyword) {
      throw new PurityError("Dynamic import() is not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (ts__namespace.isIdentifier(node)) {
      const name = node.text;
      if (ts__namespace.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
        ts__namespace.forEachChild(node, checkNode);
        return;
      }
      if (ts__namespace.isPropertyAssignment(node.parent) && node.parent.name === node) {
        ts__namespace.forEachChild(node, checkNode);
        return;
      }
      if (ts__namespace.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
        if (!localScope.has(name) && !constants.ALLOWED_GLOBALS.has(name)) {
          throw new PurityError(
            `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
            filePath,
            node.getStart(sourceFile)
          );
        }
        ts__namespace.forEachChild(node, checkNode);
        return;
      }
      if (constants.FORBIDDEN_IDENTIFIERS.has(name)) {
        throw new PurityError(`${name} is not allowed in pure functions`, filePath, node.getStart(sourceFile));
      }
      if (!localScope.has(name) && !constants.ALLOWED_GLOBALS.has(name)) {
        throw new PurityError(
          `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
          filePath,
          node.getStart(sourceFile)
        );
      }
    }
    ts__namespace.forEachChild(node, checkNode);
  }
  checkNode(body);
}
function collectLocalDeclarations(node, scope) {
  function visit(n) {
    if (ts__namespace.isVariableDeclaration(n)) {
      collectBindingNames(n.name, scope);
    }
    if (ts__namespace.isFunctionDeclaration(n) && n.name) {
      scope.add(n.name.text);
      return;
    }
    if (ts__namespace.isFunctionExpression(n) && n.name) {
      scope.add(n.name.text);
      n.parameters.forEach((p) => collectBindingNames(p.name, scope));
      return;
    }
    if (ts__namespace.isArrowFunction(n)) {
      n.parameters.forEach((p) => collectBindingNames(p.name, scope));
      return;
    }
    if (ts__namespace.isForOfStatement(n) || ts__namespace.isForInStatement(n)) {
      if (ts__namespace.isVariableDeclarationList(n.initializer)) {
        n.initializer.declarations.forEach((d) => collectBindingNames(d.name, scope));
      }
    }
    if (ts__namespace.isCatchClause(n) && n.variableDeclaration) {
      collectBindingNames(n.variableDeclaration.name, scope);
    }
    ts__namespace.forEachChild(n, visit);
  }
  visit(node);
}
function collectBindingNames(name, scope) {
  if (ts__namespace.isIdentifier(name)) {
    scope.add(name.text);
  } else if (ts__namespace.isObjectBindingPattern(name)) {
    name.elements.forEach((el) => collectBindingNames(el.name, scope));
  } else if (ts__namespace.isArrayBindingPattern(name)) {
    name.elements.forEach((el) => {
      if (ts__namespace.isBindingElement(el)) {
        collectBindingNames(el.name, scope);
      }
    });
  }
}
class PurityError extends Error {
  constructor(message, filePath, position) {
    super(`${message} (in ${filePath} at position ${position})`);
    this.filePath = filePath;
    this.position = position;
    this.name = "PurityError";
  }
}
exports.PurityError = PurityError;
exports.extractPureFnsFromSource = extractPureFnsFromSource;
exports.stripTypes = stripTypes;
//# sourceMappingURL=extractPureFn.cjs.map
