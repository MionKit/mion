import * as ts from "typescript";
import { createHash } from "crypto";
import { transformSync } from "esbuild";
import { BODY_HASH_LENGTH, PURE_SERVER_FN_NAMESPACE } from "./constants.js";
import { ALLOWED_GLOBALS, FORBIDDEN_IDENTIFIERS } from "../pureFns/purityRules.js";
import { readdirSync, statSync, readFileSync } from "fs";
import { resolve, join } from "path/posix";
import { isIncluded } from "./mionVitePlugin.js";
const CLOSE_TAG_RE = /<\/script\s*>/i;
function extractVueScriptContent(source) {
  const openRegex = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let combined = "";
  let lang = "js";
  let found = false;
  let openMatch;
  while ((openMatch = openRegex.exec(source)) !== null) {
    const attrs = openMatch[1];
    const contentStart = openMatch.index + openMatch[0].length;
    const closeMatch = CLOSE_TAG_RE.exec(source.slice(contentStart));
    if (!closeMatch) break;
    const closeIdx = contentStart + closeMatch.index;
    found = true;
    combined += source.slice(contentStart, closeIdx) + "\n";
    openRegex.lastIndex = closeIdx + closeMatch[0].length;
    const langMatch = attrs.match(/lang=["'](\w+)["']/);
    if (langMatch) lang = langMatch[1];
  }
  return found ? { content: combined.trim(), lang } : null;
}
function scanClientSource(options) {
  const include = options.include || ["**/*.ts", "**/*.tsx", "**/*.vue"];
  const exclude = options.exclude || ["../node_modules/**", "**/.dist/**", "**/dist/**"];
  const clientSrcPath = resolve(options.clientSrcPath);
  const fns = [];
  function scanDir(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (!isIncluded(fullPath + "/", include, exclude)) continue;
        scanDir(fullPath);
      } else if (stat.isFile()) {
        if (!isIncluded(fullPath, include, exclude)) continue;
        try {
          let code = readFileSync(fullPath, "utf-8");
          let effectivePath = fullPath;
          if (fullPath.endsWith(".vue")) {
            const scriptBlock = extractVueScriptContent(code);
            if (!scriptBlock) continue;
            code = scriptBlock.content;
            effectivePath = `${fullPath}.${scriptBlock.lang}`;
          }
          const hasPureFn = code.includes("pureServerFn");
          const hasMapFrom = code.includes("serverMapFrom");
          if (!hasPureFn && !hasMapFrom) continue;
          if (hasPureFn) {
            const extracted = extractPureFnsFromSource(code, effectivePath, "pureServerFn", options.noViteClient);
            fns.push(...extracted);
          }
          if (hasMapFrom) {
            const extracted = extractPureFnsFromSource(code, effectivePath, "serverMapFrom", options.noViteClient);
            fns.push(...extracted);
          }
        } catch (err) {
          console.warn(`[mion-pure-functions] Warning: Could not parse ${fullPath}: ${err.message}`);
        }
      }
    }
  }
  scanDir(clientSrcPath);
  return fns;
}
function extractPureFnsFromSource(source, filePath, fnName = "pureServerFn", noViteClient = false) {
  const results = [];
  if (!source.includes(fnName)) return results;
  const jsSource = stripTypes(source, filePath);
  const sourceFile = ts.createSourceFile(filePath, jsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === fnName) {
        if (fnName === "registerPureFnFactory") {
          const extracted = extractDataFromRegisterPureFnFactoryAST(node, sourceFile, filePath);
          results.push(extracted);
        } else if (fnName === "serverMapFrom") {
          const extracted = extractDataFromMapFromCallAST(node, sourceFile, filePath, noViteClient);
          results.push(extracted);
        } else {
          const extracted = extractDataFromPureFnDefAST(node, sourceFile, filePath, noViteClient);
          results.push(extracted);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return results;
}
function stripTypes(code, filePath) {
  try {
    let loader = "ts";
    if (filePath) {
      if (filePath.endsWith(".tsx")) loader = "tsx";
      else if (filePath.endsWith(".jsx")) loader = "jsx";
      else if (filePath.endsWith(".js")) loader = "js";
    }
    const result = transformSync(code, {
      loader,
      target: "esnext",
      minify: false
    });
    return result.code.trim();
  } catch (err) {
    throw new PurityError(err.message || String(err), "<esbuild>", 0);
  }
}
function extractDataFromPureFnDefAST(call, sourceFile, filePath, noViteClient = false) {
  if (call.arguments.length < 1 || call.arguments.length > 2) {
    throw new PurityError(
      "pureServerFn() requires 1 or 2 arguments: a function/PureFnDef and an optional name/bodyHash string",
      filePath,
      call.getStart(sourceFile)
    );
  }
  let userProvidedName;
  if (call.arguments.length === 2) {
    const nameArg = call.arguments[1];
    if (!ts.isStringLiteral(nameArg)) {
      throw new PurityError(
        "pureServerFn() second argument (name/bodyHash) must be a string literal",
        filePath,
        nameArg.getStart(sourceFile)
      );
    }
    if (nameArg.text.length === 0) {
      throw new PurityError(
        "pureServerFn() second argument (name/bodyHash) must not be an empty string",
        filePath,
        nameArg.getStart(sourceFile)
      );
    }
    userProvidedName = nameArg.text;
  } else if (noViteClient) {
    throw new PurityError(
      "pureServerFn() requires a name as the second argument (string literal) when noViteClient is enabled",
      filePath,
      call.getStart(sourceFile)
    );
  }
  let arg = call.arguments[0];
  if (ts.isIdentifier(arg)) {
    const resolved = resolveVariableInitializer(arg.text, sourceFile);
    if (!resolved) {
      if (isImportedIdentifier(arg.text, sourceFile)) {
        throw new PurityError(
          `pureServerFn() argument "${arg.text}" is imported from another module. Pure functions must be defined inline or as a variable in the same file`,
          filePath,
          arg.getStart(sourceFile)
        );
      }
      throw new PurityError(
        `pureServerFn() argument "${arg.text}" could not be resolved to a variable declaration in this file. Pure functions must be defined inline or as a variable in the same file`,
        filePath,
        arg.getStart(sourceFile)
      );
    }
    arg = resolved;
  }
  if (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg)) {
    return buildExtractedPureFn(arg, PURE_SERVER_FN_NAMESPACE, void 0, false, sourceFile, filePath, userProvidedName);
  }
  if (ts.isObjectLiteralExpression(arg)) {
    return extractPureFnDefFromObjectLiteral(arg, sourceFile, filePath, userProvidedName);
  }
  throw new PurityError(
    "pureServerFn() first argument must be a function, an object literal (PureFnDef), or a variable referencing one",
    filePath,
    call.arguments[0].getStart(sourceFile)
  );
}
function extractDataFromMapFromCallAST(call, sourceFile, filePath, noViteClient = false) {
  if (call.arguments.length < 2 || call.arguments.length > 3) {
    throw new PurityError(
      "serverMapFrom() requires 2 or 3 arguments: a SubRequest source, a mapper function, and an optional name/bodyHash string",
      filePath,
      call.getStart(sourceFile)
    );
  }
  let userProvidedName;
  if (call.arguments.length === 3) {
    const nameArg = call.arguments[2];
    if (!ts.isStringLiteral(nameArg)) {
      throw new PurityError(
        "serverMapFrom() third argument (name/bodyHash) must be a string literal",
        filePath,
        nameArg.getStart(sourceFile)
      );
    }
    if (nameArg.text.length === 0) {
      throw new PurityError(
        "serverMapFrom() third argument (name/bodyHash) must not be an empty string",
        filePath,
        nameArg.getStart(sourceFile)
      );
    }
    userProvidedName = nameArg.text;
  } else if (noViteClient) {
    throw new PurityError(
      "serverMapFrom() requires a name as the third argument (string literal) when noViteClient is enabled",
      filePath,
      call.getStart(sourceFile)
    );
  }
  let arg = call.arguments[1];
  if (ts.isIdentifier(arg)) {
    const resolved = resolveVariableInitializer(arg.text, sourceFile);
    if (!resolved) {
      if (isImportedIdentifier(arg.text, sourceFile)) {
        throw new PurityError(
          `serverMapFrom() mapper argument "${arg.text}" is imported from another module. Pure functions must be defined inline or as a variable in the same file`,
          filePath,
          arg.getStart(sourceFile)
        );
      }
      throw new PurityError(
        `serverMapFrom() mapper argument "${arg.text}" could not be resolved to a variable declaration in this file. Pure functions must be defined inline or as a variable in the same file`,
        filePath,
        arg.getStart(sourceFile)
      );
    }
    arg = resolved;
  }
  if (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg)) {
    return buildExtractedPureFn(arg, PURE_SERVER_FN_NAMESPACE, void 0, false, sourceFile, filePath, userProvidedName);
  }
  throw new PurityError(
    "serverMapFrom() second argument (mapper) must be a function expression or arrow function",
    filePath,
    call.arguments[1].getStart(sourceFile)
  );
}
function extractDataFromRegisterPureFnFactoryAST(call, sourceFile, filePath) {
  if (call.arguments.length < 3 || call.arguments.length > 4) {
    throw new PurityError(
      "registerPureFnFactory() requires 3 or 4 arguments: namespace, functionID, factoryFn, and optional parsedFn",
      filePath,
      call.getStart(sourceFile)
    );
  }
  const nsArg = call.arguments[0];
  if (!ts.isStringLiteral(nsArg)) {
    throw new PurityError(
      "registerPureFnFactory() first argument (namespace) must be a string literal",
      filePath,
      nsArg.getStart(sourceFile)
    );
  }
  const namespace = nsArg.text;
  const idArg = call.arguments[1];
  if (!ts.isStringLiteral(idArg)) {
    throw new PurityError(
      "registerPureFnFactory() second argument (functionID) must be a string literal",
      filePath,
      idArg.getStart(sourceFile)
    );
  }
  const fnName = idArg.text;
  const fnArg = call.arguments[2];
  if (ts.isIdentifier(fnArg)) {
    if (isImportedIdentifier(fnArg.text, sourceFile)) {
      throw new PurityError(
        `registerPureFnFactory() third argument "${fnArg.text}" is imported from another module. The factory function must be defined inline`,
        filePath,
        fnArg.getStart(sourceFile)
      );
    }
    throw new PurityError(
      `registerPureFnFactory() third argument "${fnArg.text}" could not be resolved. The factory function must be defined inline as a function expression or arrow function`,
      filePath,
      fnArg.getStart(sourceFile)
    );
  }
  if (!ts.isFunctionExpression(fnArg) && !ts.isArrowFunction(fnArg)) {
    throw new PurityError(
      "registerPureFnFactory() third argument (factoryFn) must be a function expression or arrow function",
      filePath,
      fnArg.getStart(sourceFile)
    );
  }
  const paramNames = fnArg.parameters.map((param) => {
    if (!ts.isIdentifier(param.name)) {
      throw new PurityError(
        "Factory function parameters must be simple identifiers (no destructuring)",
        filePath,
        param.getStart(sourceFile)
      );
    }
    return param.name.text;
  });
  const bodyNode = fnArg.body;
  const bodyText = getBodyText(bodyNode, sourceFile);
  const normalizedBody = bodyText.replace(/[ \t]+/g, " ").trim();
  const bodyHash = createHash("sha256").update(namespace + fnName + normalizedBody).digest("base64url").slice(0, BODY_HASH_LENGTH);
  return {
    namespace,
    fnName,
    paramNames,
    fnBody: bodyText,
    bodyHash,
    dependencies: /* @__PURE__ */ new Set(),
    sourceFile: filePath,
    isFactory: true
    // registerPureFnFactory always registers factory functions
  };
}
function isImportedIdentifier(name, sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const clause = statement.importClause;
    if (clause.name && clause.name.text === name) return true;
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings) && clause.namedBindings.name.text === name) return true;
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.name.text === name) return true;
        }
      }
    }
  }
  return false;
}
function resolveVariableInitializer(name, sourceFile) {
  let result;
  function visit(node) {
    if (result) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      result = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}
function extractPureFnDefFromObjectLiteral(objLiteral, sourceFile, filePath, userProvidedName) {
  let pureFn;
  let namespace = PURE_SERVER_FN_NAMESPACE;
  let fnName;
  let isFactory = false;
  for (const prop of objLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const propName = ts.isIdentifier(prop.name) ? prop.name.text : void 0;
    if (!propName) continue;
    switch (propName) {
      case "pureFn": {
        const initializer = prop.initializer;
        if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
          pureFn = initializer;
        } else if (ts.isIdentifier(initializer)) {
          if (isImportedIdentifier(initializer.text, sourceFile)) {
            throw new PurityError(
              `pureFn property "${initializer.text}" is imported from another module. Pure functions must be defined inline or as a variable in the same file`,
              filePath,
              prop.initializer.getStart(sourceFile)
            );
          }
          throw new PurityError(
            `pureFn property "${initializer.text}" could not be resolved. Pure functions must be defined inline or as a variable in the same file`,
            filePath,
            prop.initializer.getStart(sourceFile)
          );
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
        if (ts.isStringLiteral(prop.initializer)) {
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
        if (ts.isStringLiteral(prop.initializer)) {
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
        if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          isFactory = true;
        } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
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
  const explicitFnName = fnName ?? (ts.isFunctionExpression(pureFn) && pureFn.name ? pureFn.name.text : void 0);
  return buildExtractedPureFn(pureFn, namespace, explicitFnName, isFactory, sourceFile, filePath, userProvidedName);
}
function buildExtractedPureFn(fnNode, namespace, explicitFnName, isFactory, sourceFile, filePath, userProvidedName) {
  const paramNames = fnNode.parameters.map((param) => {
    if (!ts.isIdentifier(param.name)) {
      throw new PurityError(
        "Pure function parameters must be simple identifiers (no destructuring)",
        filePath,
        param.getStart(sourceFile)
      );
    }
    return param.name.text;
  });
  const bodyNode = fnNode.body;
  const fnTypeLabel = isFactory ? "factory functions" : "pure functions";
  validatePurity(bodyNode, new Set(paramNames), explicitFnName, sourceFile, filePath, fnTypeLabel);
  const bodyText = getBodyText(bodyNode, sourceFile);
  if (userProvidedName) {
    return {
      namespace,
      fnName: userProvidedName,
      paramNames,
      fnBody: bodyText,
      bodyHash: userProvidedName,
      dependencies: /* @__PURE__ */ new Set(),
      sourceFile: filePath,
      isFactory
    };
  }
  const normalizedBody = bodyText.replace(/[ \t]+/g, " ").trim();
  const bodyHash = createHash("sha256").update(namespace + normalizedBody).digest("base64url").slice(0, BODY_HASH_LENGTH);
  const fnName = explicitFnName || bodyHash;
  return {
    namespace,
    fnName,
    paramNames,
    fnBody: bodyText,
    bodyHash,
    dependencies: /* @__PURE__ */ new Set(),
    sourceFile: filePath,
    isFactory
  };
}
function getBodyText(body, sourceFile) {
  if (ts.isBlock(body)) {
    const fullText = body.getText(sourceFile);
    return fullText.slice(1, -1).trim();
  } else {
    return `return ${body.getText(sourceFile)}`;
  }
}
function validatePurity(body, localScope, fnName, sourceFile, filePath, fnTypeLabel = "pure functions") {
  collectLocalDeclarations(body, localScope);
  if (fnName) localScope.add(fnName);
  function checkNode(node) {
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      throw new PurityError(`'this' is not allowed in ${fnTypeLabel}`, filePath, node.getStart(sourceFile));
    }
    if (ts.isAwaitExpression(node)) {
      throw new PurityError(`async/await is not allowed in ${fnTypeLabel}`, filePath, node.getStart(sourceFile));
    }
    if (node.kind === ts.SyntaxKind.YieldKeyword) {
      throw new PurityError(`generators are not allowed in ${fnTypeLabel}`, filePath, node.getStart(sourceFile));
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new PurityError(`Dynamic import() is not allowed in ${fnTypeLabel}`, filePath, node.getStart(sourceFile));
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
            `Closure variable "${name}" is not allowed in ${fnTypeLabel}. ${fnTypeLabel[0].toUpperCase() + fnTypeLabel.slice(1)} cannot access outer scope variables.`,
            filePath,
            node.getStart(sourceFile)
          );
        }
        ts.forEachChild(node, checkNode);
        return;
      }
      if (FORBIDDEN_IDENTIFIERS.has(name)) {
        throw new PurityError(`${name} is not allowed in ${fnTypeLabel}`, filePath, node.getStart(sourceFile));
      }
      if (!localScope.has(name) && !ALLOWED_GLOBALS.has(name)) {
        throw new PurityError(
          `Closure variable "${name}" is not allowed in ${fnTypeLabel}. ${fnTypeLabel[0].toUpperCase() + fnTypeLabel.slice(1)} cannot access outer scope variables.`,
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
  extractVueScriptContent,
  scanClientSource,
  stripTypes
};
//# sourceMappingURL=extractPureFn.js.map
