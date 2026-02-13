import * as ts from "typescript";
import { normalizePureFnBody, createUniqueHash, PURE_SERVER_FN_NAMESPACE, pureFnHashLength } from "@mionkit/core";
import { ALLOWED_GLOBALS, FORBIDDEN_IDENTIFIERS } from "./constants.js";
function extractPureFnsFromSource(source, filePath) {
  const results = [];
  if (!source.includes("pureServerFn")) return results;
  const jsSource = stripTypes(source);
  const sourceFile = ts.createSourceFile(filePath, jsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === "pureServerFn") {
        const extracted = extractPureFnFromCall(node, sourceFile, filePath);
        results.push(extracted);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return results;
}
function stripTypes(code) {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      // Remove comments to get cleaner output
      removeComments: true,
      // Don't emit helpers
      importHelpers: false,
      // Preserve newlines for readability
      newLine: ts.NewLineKind.LineFeed
    }
  });
  return result.outputText.trim();
}
function extractPureFnFromCall(call, sourceFile, filePath) {
  if (call.arguments.length !== 1) {
    throw new PurityError("pureServerFn() requires exactly one function argument", filePath, call.getStart(sourceFile));
  }
  const arg = call.arguments[0];
  if (!ts.isFunctionExpression(arg) && !ts.isArrowFunction(arg)) {
    throw new PurityError(
      "pureServerFn() argument must be a function expression or arrow function",
      filePath,
      arg.getStart(sourceFile)
    );
  }
  let fnName;
  if (ts.isFunctionExpression(arg) && arg.name) {
    fnName = arg.name.text;
  } else if (ts.isArrowFunction(arg)) {
    fnName = tryGetArrowFunctionName(arg);
  }
  const paramNames = arg.parameters.map((param) => {
    if (!ts.isIdentifier(param.name)) {
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
  const normalizedBody = normalizePureFnBody(bodyText);
  const bodyHash = createUniqueHash(PURE_SERVER_FN_NAMESPACE + normalizedBody, pureFnHashLength);
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
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    parent = parent.parent;
  }
  return void 0;
}
function getBodyText(body, sourceFile) {
  if (ts.isBlock(body)) {
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
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      throw new PurityError("'this' is not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (ts.isAwaitExpression(node)) {
      throw new PurityError("async/await is not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (node.kind === ts.SyntaxKind.YieldKeyword) {
      throw new PurityError("generators are not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new PurityError("Dynamic import() is not allowed in pure functions", filePath, node.getStart(sourceFile));
    }
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
        ts.forEachChild(node, checkNode);
        return;
      }
      if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) {
        ts.forEachChild(node, checkNode);
        return;
      }
      if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
        if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
          throw new PurityError(
            `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
            filePath,
            node.getStart(sourceFile)
          );
        }
        ts.forEachChild(node, checkNode);
        return;
      }
      if (FORBIDDEN_IDENTIFIERS.has(name)) {
        throw new PurityError(`${name} is not allowed in pure functions`, filePath, node.getStart(sourceFile));
      }
      if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
        throw new PurityError(
          `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
          filePath,
          node.getStart(sourceFile)
        );
      }
    }
    ts.forEachChild(node, checkNode);
  }
  checkNode(body);
}
function collectLocalDeclarations(node, scope) {
  function visit(n) {
    if (ts.isVariableDeclaration(n)) {
      collectBindingNames(n.name, scope);
    }
    if (ts.isFunctionDeclaration(n) && n.name) {
      scope.add(n.name.text);
      return;
    }
    if (ts.isFunctionExpression(n) && n.name) {
      scope.add(n.name.text);
      n.parameters.forEach((p) => collectBindingNames(p.name, scope));
      return;
    }
    if (ts.isArrowFunction(n)) {
      n.parameters.forEach((p) => collectBindingNames(p.name, scope));
      return;
    }
    if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {
      if (ts.isVariableDeclarationList(n.initializer)) {
        n.initializer.declarations.forEach((d) => collectBindingNames(d.name, scope));
      }
    }
    if (ts.isCatchClause(n) && n.variableDeclaration) {
      collectBindingNames(n.variableDeclaration.name, scope);
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
}
function collectBindingNames(name, scope) {
  if (ts.isIdentifier(name)) {
    scope.add(name.text);
  } else if (ts.isObjectBindingPattern(name)) {
    name.elements.forEach((el) => collectBindingNames(el.name, scope));
  } else if (ts.isArrayBindingPattern(name)) {
    name.elements.forEach((el) => {
      if (ts.isBindingElement(el)) {
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
export {
  PurityError,
  extractPureFnsFromSource,
  stripTypes
};
//# sourceMappingURL=extractPureFn.js.map
