"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const ts = require("typescript");
const crypto = require("crypto");
const esbuild = require("esbuild");
const src_vitePlugin_constants = require("./constants.js");
const fs = require("fs");
const posix = require("path/posix");
const src_vitePlugin_mionVitePlugin = require("./mionVitePlugin.js");
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
function scanClientSource(options) {
  const include = options.include || ["**/*.ts", "**/*.tsx"];
  const exclude = options.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
  const clientSrcPath = posix.resolve(options.clientSrcPath);
  const fns = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = posix.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!src_vitePlugin_mionVitePlugin.isIncluded(fullPath + "/", include, exclude)) continue;
        scanDir(fullPath);
      } else if (stat.isFile()) {
        if (!src_vitePlugin_mionVitePlugin.isIncluded(fullPath, include, exclude)) continue;
        try {
          const code = fs.readFileSync(fullPath, "utf-8");
          if (!code.includes("pureServerFn")) continue;
          const extracted = extractPureFnsFromSource(code, fullPath);
          fns.push(...extracted);
        } catch (err) {
          console.warn(`[mion-pure-functions] Warning: Could not parse ${fullPath}: ${err.message}`);
        }
      }
    }
  }
  scanDir(clientSrcPath);
  return fns;
}
function extractPureFnsFromSource(source, filePath) {
  const results = [];
  if (!source.includes("pureServerFn")) return results;
  const jsSource = stripTypes(source);
  const sourceFile = ts__namespace.createSourceFile(filePath, jsSource, ts__namespace.ScriptTarget.Latest, true, ts__namespace.ScriptKind.JS);
  function visit(node) {
    if (ts__namespace.isCallExpression(node)) {
      const callee = node.expression;
      if (ts__namespace.isIdentifier(callee) && callee.text === "pureServerFn") {
        const extracted = extractDataFromPureFnDefAST(node, sourceFile, filePath);
        results.push(extracted);
      }
    }
    ts__namespace.forEachChild(node, visit);
  }
  visit(sourceFile);
  return results;
}
function stripTypes(code) {
  try {
    const result = esbuild.transformSync(code, {
      loader: "ts",
      target: "esnext",
      minify: false
    });
    return result.code.trim();
  } catch (err) {
    throw new PurityError(err.message || String(err), "<esbuild>", 0);
  }
}
function extractDataFromPureFnDefAST(call, sourceFile, filePath) {
  if (call.arguments.length < 1 || call.arguments.length > 2) {
    throw new PurityError(
      "pureServerFn() requires 1 or 2 arguments: a PureFnDef object and an optional bodyHash string",
      filePath,
      call.getStart(sourceFile)
    );
  }
  let objArg = call.arguments[0];
  if (ts__namespace.isIdentifier(objArg)) {
    const resolved = resolveVariableInitializer(objArg.text, sourceFile);
    if (!resolved) {
      throw new PurityError(
        `pureServerFn() argument "${objArg.text}" could not be resolved to a variable declaration in this file`,
        filePath,
        objArg.getStart(sourceFile)
      );
    }
    objArg = resolved;
  }
  if (!ts__namespace.isObjectLiteralExpression(objArg)) {
    throw new PurityError(
      "pureServerFn() first argument must be an object literal (PureFnDef) or a variable referencing one",
      filePath,
      call.arguments[0].getStart(sourceFile)
    );
  }
  return extractPureFnDefFromObjectLiteral(objArg, sourceFile, filePath);
}
function resolveVariableInitializer(name, sourceFile) {
  let result;
  function visit(node) {
    if (result) return;
    if (ts__namespace.isVariableDeclaration(node) && ts__namespace.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      result = node.initializer;
      return;
    }
    ts__namespace.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}
function transformPureServerFnCalls(source, filePath) {
  const extractedFns = extractPureFnsFromSource(source, filePath);
  if (extractedFns.length === 0) return null;
  const callPattern = new RegExp("(?<![a-zA-Z0-9_$])pureServerFn\\s*\\(", "g");
  const callPositions = [];
  let match;
  while ((match = callPattern.exec(source)) !== null) {
    const parenPos = source.indexOf("(", match.index + "pureServerFn".length);
    callPositions.push(parenPos);
  }
  const untransformedCalls = [];
  let fnIndex = 0;
  for (const openParen of callPositions) {
    const closeParen = findMatchingParen(source, openParen);
    if (closeParen === -1) continue;
    const innerContent = source.substring(openParen + 1, closeParen);
    const alreadyHasHash = /,\s*['"][a-zA-Z0-9_-]+['"]\s*$/.test(innerContent.trimEnd());
    if (alreadyHasHash) {
      fnIndex++;
      continue;
    }
    if (fnIndex < extractedFns.length) {
      untransformedCalls.push({ openParen, closeParen, fnIndex });
    }
    fnIndex++;
  }
  if (untransformedCalls.length === 0) return null;
  let result = source;
  for (let i = untransformedCalls.length - 1; i >= 0; i--) {
    const { closeParen, fnIndex: idx } = untransformedCalls[i];
    const hash = extractedFns[idx].bodyHash;
    result = result.substring(0, closeParen) + `, '${hash}'` + result.substring(closeParen);
  }
  return { code: result, extractedFns };
}
function findMatchingParen(source, openPos) {
  let depth = 1;
  let pos = openPos + 1;
  while (pos < source.length && depth > 0) {
    const ch = source[pos];
    if (ch === "'" || ch === '"') {
      pos = skipStringLiteral(source, pos);
      continue;
    }
    if (ch === "`") {
      pos = skipTemplateLiteral(source, pos);
      continue;
    }
    if (ch === "/" && pos + 1 < source.length && source[pos + 1] === "/") {
      pos = source.indexOf("\n", pos);
      if (pos === -1) return -1;
      pos++;
      continue;
    }
    if (ch === "/" && pos + 1 < source.length && source[pos + 1] === "*") {
      pos = source.indexOf("*/", pos + 2);
      if (pos === -1) return -1;
      pos += 2;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    if (depth === 0) return pos;
    pos++;
  }
  return -1;
}
function skipStringLiteral(source, startPos) {
  const quote = source[startPos];
  let pos = startPos + 1;
  while (pos < source.length) {
    if (source[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (source[pos] === quote) return pos + 1;
    pos++;
  }
  return pos;
}
function skipTemplateLiteral(source, startPos) {
  let pos = startPos + 1;
  while (pos < source.length) {
    if (source[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (source[pos] === "`") return pos + 1;
    if (source[pos] === "$" && pos + 1 < source.length && source[pos + 1] === "{") {
      pos += 2;
      let depth = 1;
      while (pos < source.length && depth > 0) {
        const ch = source[pos];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        if (depth > 0) pos++;
      }
      if (pos < source.length) pos++;
      continue;
    }
    pos++;
  }
  return pos;
}
function extractPureFnDefFromObjectLiteral(objLiteral, sourceFile, filePath) {
  let pureFn;
  let namespace = src_vitePlugin_constants.PURE_SERVER_FN_NAMESPACE;
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
  const normalizedBody = bodyText.replace(/[ \t]+/g, " ").trim();
  const bodyHash = crypto.createHash("sha256").update(namespace + normalizedBody).digest("base64url").slice(0, src_vitePlugin_constants.BODY_HASH_LENGTH);
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
    dependencies: /* @__PURE__ */ new Set(),
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
        if (!localScope.has(name) && !src_vitePlugin_constants.ALLOWED_GLOBALS.has(name)) {
          throw new PurityError(
            `Closure variable "${name}" is not allowed in pure functions. Pure functions cannot access outer scope variables.`,
            filePath,
            node.getStart(sourceFile)
          );
        }
        ts__namespace.forEachChild(node, checkNode);
        return;
      }
      if (src_vitePlugin_constants.FORBIDDEN_IDENTIFIERS.has(name)) {
        throw new PurityError(`${name} is not allowed in pure functions`, filePath, node.getStart(sourceFile));
      }
      if (!localScope.has(name) && !src_vitePlugin_constants.ALLOWED_GLOBALS.has(name)) {
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
exports.findMatchingParen = findMatchingParen;
exports.scanClientSource = scanClientSource;
exports.stripTypes = stripTypes;
exports.transformPureServerFnCalls = transformPureServerFnCalls;
//# sourceMappingURL=extractPureFn.js.map
