"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const ts = require("typescript");
const pureFnUtils = require("./pureFnUtils.cjs");
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
  if (!source.includes("pureServerFn") && !source.includes("pureServerFnGroup")) return results;
  const jsSource = stripTypes(source);
  const sourceFile = ts__namespace.createSourceFile(filePath, jsSource, ts__namespace.ScriptTarget.Latest, true, ts__namespace.ScriptKind.JS);
  function visit(node) {
    if (ts__namespace.isCallExpression(node)) {
      const callee = node.expression;
      if (ts__namespace.isIdentifier(callee)) {
        if (callee.text === "pureServerFn") {
          const extracted = extractDataFromPureFnDefAST(node, sourceFile, filePath);
          results.push(extracted);
        } else if (callee.text === "pureServerFnGroup") {
          const extracted = extractDataFromPureFnDefListAST(node, sourceFile, filePath);
          results.push(...extracted);
        }
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
      removeComments: true,
      importHelpers: false,
      newLine: ts__namespace.NewLineKind.LineFeed
    },
    // Disable deepkit type compiler transformations
    transformers: {}
  });
  return result.outputText.trim();
}
function extractDataFromPureFnDefAST(call, sourceFile, filePath) {
  if (call.arguments.length !== 1) {
    throw new PurityError(
      "pureServerFn() requires exactly 1 argument: a PureFnDef object",
      filePath,
      call.getStart(sourceFile)
    );
  }
  const objArg = call.arguments[0];
  if (!ts__namespace.isObjectLiteralExpression(objArg)) {
    throw new PurityError(
      "pureServerFn() argument must be an object literal (PureFnDef)",
      filePath,
      objArg.getStart(sourceFile)
    );
  }
  return extractPureFnDefFromObjectLiteral(objArg, sourceFile, filePath);
}
function extractDataFromPureFnDefListAST(call, sourceFile, filePath) {
  if (call.arguments.length !== 1) {
    throw new PurityError(
      "pureServerFnGroup() requires exactly 1 argument: an array of PureFnDef objects",
      filePath,
      call.getStart(sourceFile)
    );
  }
  const arrayArg = call.arguments[0];
  if (!ts__namespace.isArrayLiteralExpression(arrayArg)) {
    throw new PurityError(
      "pureServerFnGroup() argument must be an array literal (tuple), not a dynamic array",
      filePath,
      arrayArg.getStart(sourceFile)
    );
  }
  const fns = [];
  for (const element of arrayArg.elements) {
    if (!ts__namespace.isObjectLiteralExpression(element)) {
      throw new PurityError(
        "pureServerFnGroup() array elements must be object literals (PureFnDef)",
        filePath,
        element.getStart(sourceFile)
      );
    }
    fns.push(extractPureFnDefFromObjectLiteral(element, sourceFile, filePath));
  }
  const allKeys = fns.map((fn) => `${fn.namespace}::${fn.fnName}`);
  for (const fn of fns) {
    const ownKey = `${fn.namespace}::${fn.fnName}`;
    fn.dependencies = allKeys.filter((key) => key !== ownKey);
  }
  return fns;
}
function extractPureFnDefFromObjectLiteral(objLiteral, sourceFile, filePath) {
  let pureFn;
  let namespace = pureFnUtils.PURE_SERVER_FN_NAMESPACE;
  let fnName;
  let isFactory = false;
  for (const prop of objLiteral.properties) {
    if (!ts__namespace.isPropertyAssignment(prop)) continue;
    const propName = ts__namespace.isIdentifier(prop.name) ? prop.name.text : void 0;
    if (!propName) continue;
    switch (propName) {
      case "pureFn": {
        const initializer = prop.initializer;
        if (ts__namespace.isFunctionExpression(initializer) || ts__namespace.isArrowFunction(initializer)) {
          pureFn = initializer;
        } else {
          throw new PurityError(
            "pureFn property must be a function expression or arrow function",
            filePath,
            prop.initializer.getStart(sourceFile)
          );
        }
        break;
      }
      case "namespace":
        if (ts__namespace.isStringLiteral(prop.initializer)) {
          namespace = prop.initializer.text;
        } else {
          throw new PurityError(
            "namespace property must be a string literal",
            filePath,
            prop.initializer.getStart(sourceFile)
          );
        }
        break;
      case "fnName":
        if (ts__namespace.isStringLiteral(prop.initializer)) {
          fnName = prop.initializer.text;
        } else {
          throw new PurityError(
            "fnName property must be a string literal",
            filePath,
            prop.initializer.getStart(sourceFile)
          );
        }
        break;
      case "isFactory":
        if (prop.initializer.kind === ts__namespace.SyntaxKind.TrueKeyword) {
          isFactory = true;
        } else if (prop.initializer.kind === ts__namespace.SyntaxKind.FalseKeyword) {
          isFactory = false;
        } else {
          throw new PurityError(
            "isFactory property must be a boolean literal",
            filePath,
            prop.initializer.getStart(sourceFile)
          );
        }
        break;
    }
  }
  if (!pureFn) {
    throw new PurityError("PureFnDef must have a pureFn property", filePath, objLiteral.getStart(sourceFile));
  }
  const paramNames = pureFn.parameters.map((param) => {
    if (!ts__namespace.isIdentifier(param.name)) {
      throw new PurityError(
        "Pure function parameters must be simple identifiers (no destructuring)",
        filePath,
        param.getStart(sourceFile)
      );
    }
    return param.name.text;
  });
  const bodyNode = pureFn.body;
  if (!isFactory) {
    validatePurity(bodyNode, new Set(paramNames), fnName, sourceFile, filePath);
  } else {
    validateFactoryPurity(bodyNode, new Set(paramNames), fnName, sourceFile, filePath);
  }
  const bodyText = getBodyText(bodyNode, sourceFile);
  const normalizedBody = pureFnUtils.normalizePureFnBody(bodyText);
  const bodyHash = pureFnUtils.createUniqueHash(namespace + normalizedBody, pureFnUtils.pureFnHashLength);
  if (!fnName) {
    if (ts__namespace.isFunctionExpression(pureFn) && pureFn.name) {
      fnName = pureFn.name.text;
    } else {
      fnName = bodyHash;
    }
  }
  return {
    namespace,
    fnName,
    paramNames,
    code: bodyText,
    bodyHash,
    dependencies: [],
    sourceFile: filePath,
    isFactory
  };
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
function validateFactoryPurity(body, localScope, fnName, sourceFile, filePath) {
  collectLocalDeclarations(body, localScope);
  if (fnName) localScope.add(fnName);
  function checkNode(node) {
    if (node.kind === ts__namespace.SyntaxKind.ThisKeyword) {
      throw new PurityError("'this' is not allowed in factory functions", filePath, node.getStart(sourceFile));
    }
    if (ts__namespace.isAwaitExpression(node)) {
      throw new PurityError("async/await is not allowed in factory functions", filePath, node.getStart(sourceFile));
    }
    if (node.kind === ts__namespace.SyntaxKind.YieldKeyword) {
      throw new PurityError("generators are not allowed in factory functions", filePath, node.getStart(sourceFile));
    }
    if (ts__namespace.isCallExpression(node) && node.expression.kind === ts__namespace.SyntaxKind.ImportKeyword) {
      throw new PurityError("Dynamic import() is not allowed in factory functions", filePath, node.getStart(sourceFile));
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
        ts__namespace.forEachChild(node, checkNode);
        return;
      }
      const factoryForbidden = /* @__PURE__ */ new Set(["eval", "Function", "fetch", "XMLHttpRequest", "WebSocket"]);
      if (factoryForbidden.has(name)) {
        throw new PurityError(`${name} is not allowed in factory functions`, filePath, node.getStart(sourceFile));
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
