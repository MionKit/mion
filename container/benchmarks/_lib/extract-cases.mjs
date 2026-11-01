// Shared AST extraction for the per-competitor benchmark suites. Both
// typecost/typecost.mjs (type-instantiation cost) and compiletime/compiletime.mjs
// (wall-clock build cost) read each competitor's case map the SAME way, so this is
// the single source of truth for "given a competitor cases.ts, pull each case's
// type/schema text + the local declarations it references".
//
// `typescript` is resolved by the CALLER, not here: it lives in each competitor's
// node_modules + the typecost dir's node_modules, never at /bench/_lib. So the
// module exports a `makeExtractors(ts)` factory the caller seeds with its own
// TypeScript instance; everything below closes over that `ts`.

import fs from 'node:fs';

// typia's lane installs TypeScript 7, which ships no JavaScript parser API.
export const hasParserApi = (tsModule) => typeof (tsModule?.default ?? tsModule)?.createSourceFile === 'function';

export function makeExtractors(ts) {
  const read = (f) => fs.readFileSync(f, 'utf8');
  const sf = (f) => ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  /** Strip `as const` / `satisfies X` / parentheses to reach the wrapped node. */
  function unwrapExpr(node) {
    while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) {
      node = node.expression;
    }
    return node;
  }

  /** The `export const cases|schemaCases: CompetitorCases = { … }` object literal. */
  function findMapObject(source, mapName) {
    let found = null;
    source.forEachChild((n) => {
      if (!ts.isVariableStatement(n)) return;
      for (const decl of n.declarationList.declarations) {
        if (decl.name.getText(source) !== mapName) continue;
        const init = unwrapExpr(decl.initializer);
        if (init && ts.isObjectLiteralExpression(init)) found = init;
      }
    });
    return found;
  }

  /** A competitor file's preamble: bare (non-relative) imports + every top-level
   *  declaration that ISN'T the cases map — helper consts + local type aliases the
   *  ts-go map authors at file scope (e.g. `const slug` / `type Slug`). Relative
   *  imports (realworld interfaces) are KEPT verbatim and resolve from the probe's
   *  competitor directory. */
  function extractPreamble(source, mapName) {
    const preamble = [];
    source.forEachChild((n) => {
      if (ts.isImportDeclaration(n)) {
        preamble.push(n.getText(source)); // bare AND relative imports kept verbatim
        return;
      }
      if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isEnumDeclaration(n)) {
        preamble.push(n.getText(source));
        return;
      }
      if (ts.isVariableStatement(n)) {
        const isMap = n.declarationList.declarations.some((d) => d.name.getText(source) === mapName);
        if (!isMap) preamble.push(n.getText(source));
      }
    });
    return preamble;
  }

  /** Unwrap a LAZY entry thunk `() => EXPR` | `() => { …decls; return EXPR; }`,
   *  returning {locals, expr}: the inline declarations authored before the return
   *  (enum/interface/type/class/const/function — kept verbatim so EXPR resolves)
   *  and the returned expression node. Returns null when the entry is not a thunk
   *  (e.g. the bare `NOT_SUPPORTED` identifier). */
  function unwrapThunk(node) {
    if (!node || !ts.isArrowFunction(node)) return null;
    let body = node.body;
    const locals = [];
    if (ts.isBlock(body)) {
      let expr = null;
      for (const stmt of body.statements) {
        if (ts.isReturnStatement(stmt)) {
          expr = stmt.expression ?? null;
          break;
        }
        locals.push(stmt); // declaration the returned call references
      }
      body = expr;
    }
    return body ? {locals, expr: body} : null;
  }

  /** ts-go cases.ts / schemaCases.ts → {preamble, entries:{key:{locals, arg}}, keys}.
   *  `arg` is `{kind:'type', text}` for `createValidateFn<T>()` or `{kind:'schema',
   *  text}` for `createValidateFn(EXPR)`. Entries that are NOT_SUPPORTED are skipped,
   *  but `keys` lists EVERY map key in file order (drives the table + row order). */
  function extractTsGo(file, mapName, want) {
    const source = sf(file);
    const obj = findMapObject(source, mapName);
    const entries = {};
    const keys = [];
    if (obj) {
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.getText(source).replace(/['"]/g, '');
        keys.push(key);
        const thunk = unwrapThunk(prop.initializer);
        if (!thunk) continue; // NOT_SUPPORTED
        const call = unwrapExpr(thunk.expr);
        if (!call || !ts.isCallExpression(call) || call.expression.getText(source) !== 'createValidateFn') continue;
        const localsText = thunk.locals.map((s) => s.getText(source));
        if (want === 'type') {
          if (call.typeArguments?.length) entries[key] = {locals: localsText, arg: {kind: 'type', text: call.typeArguments[0].getText(source)}};
        } else if (call.arguments.length) {
          entries[key] = {locals: localsText, arg: {kind: 'schema', text: call.arguments[0].getText(source)}};
        }
      }
    }
    return {preamble: extractPreamble(source, mapName), entries, keys};
  }

  /** From a zod/typebox `build`/`buildErrors` thunk `() => { …locals; const schema =
   *  EXPR; …; return validator; }`, return {locals, exprText}: the declarations
   *  authored before `const schema` (shared sub-schemas EXPR references) and the
   *  schema's initializer text. The trailing statements (typebox's `TypeCompiler.
   *  Compile`, the returned validator) are runtime-only and irrelevant to type cost,
   *  so they're dropped. Returns null when the thunk has no `const schema = …`. */
  function extractSchemaFromThunk(node, source) {
    const arrow = unwrapExpr(node);
    if (!arrow || !ts.isArrowFunction(arrow) || !ts.isBlock(arrow.body)) return null;
    const locals = [];
    for (const stmt of arrow.body.statements) {
      if (ts.isVariableStatement(stmt)) {
        const decl = stmt.declarationList.declarations.find((d) => d.name.getText(source) === 'schema');
        if (decl?.initializer) return {locals, exprText: decl.initializer.getText(source)};
      }
      locals.push(stmt.getText(source)); // a sub-schema / helper the schema references
    }
    return null;
  }

  /** zod / typebox cases.ts → {preamble, entries:{key:{locals, exprText}}}; both thunks build the same `schema`. */
  function extractSchemaCompetitor(file, mapName) {
    const source = sf(file);
    const obj = findMapObject(source, mapName);
    const entries = {};
    if (obj) {
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.getText(source).replace(/['"]/g, '');
        const init = unwrapExpr(prop.initializer);
        if (!init || !ts.isObjectLiteralExpression(init)) continue; // NOT_SUPPORTED
        const thunk = ['build', 'buildErrors']
          .map((name) => init.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === name))
          .find(Boolean);
        if (!thunk) continue;
        const extracted = extractSchemaFromThunk(thunk.initializer, source);
        if (extracted) entries[key] = extracted;
      }
    }
    return {preamble: extractPreamble(source, mapName), entries};
  }

  /** DFS for the first `callNames` call with a type argument; `allowUntyped` also takes a builder-form call. */
  function findTypedCall(node, callNames, source, {allowUntyped = false} = {}) {
    let found = null;
    const visit = (n) => {
      if (found || !n) return;
      if (
        ts.isCallExpression(n) &&
        callNames.includes(n.expression.getText(source)) &&
        (n.typeArguments?.length || (allowUntyped && n.arguments.length))
      ) {
        found = n;
        return;
      }
      n.forEachChild(visit);
    };
    visit(node);
    return found;
  }

  /** Type-form cases.ts (ts-go, typia); `keys` keeps every map key, NOT_SUPPORTED too, as it drives row order. */
  function extractTypeForm(file, mapName, callNames, opts = {}) {
    const source = sf(file);
    const obj = findMapObject(source, mapName);
    const entries = {};
    const keys = [];
    if (obj) {
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.getText(source).replace(/['"]/g, '');
        keys.push(key);
        // Optional IIFE wrapper: ts-go declares the case's local types there.
        const init = unwrapExpr(prop.initializer);
        const locals = [];
        let objLiteral = init;
        if (ts.isCallExpression(init)) {
          const fn = unwrapExpr(init.expression);
          if (!ts.isArrowFunction(fn) || !ts.isBlock(fn.body)) continue;
          objLiteral = null;
          for (const stmt of fn.body.statements) {
            if (ts.isReturnStatement(stmt)) {
              objLiteral = stmt.expression ? unwrapExpr(stmt.expression) : null;
              break;
            }
            locals.push(stmt.getText(source)); // decl the returned `<T>` references
          }
        }
        if (!objLiteral || !ts.isObjectLiteralExpression(objLiteral)) continue; // NOT_SUPPORTED
        const build = objLiteral.properties.find(
          (p) => ts.isPropertyAssignment(p) && p.name.getText(source) === 'build'
        );
        if (!build) continue;
        const call = findTypedCall(build.initializer, callNames, source, opts);
        if (!call) continue;
        // typia declares the type's locals inside the build block: keep them, minus the return and the runtime call.
        const buildArrow = build.initializer;
        if (ts.isArrowFunction(buildArrow) && ts.isBlock(buildArrow.body)) {
          for (const stmt of buildArrow.body.statements) {
            if (ts.isReturnStatement(stmt) || findTypedCall(stmt, callNames, source, opts)) continue;
            locals.push(stmt.getText(source));
          }
        }
        entries[key] = {
          locals,
          typeText: call.typeArguments?.length ? call.typeArguments[0].getText(source) : null,
          callText: call.getText(source),
        };
      }
    }
    return {preamble: extractPreamble(source, mapName), entries, keys};
  }

  return {
    read,
    sf,
    unwrapExpr,
    findMapObject,
    extractPreamble,
    unwrapThunk,
    extractTsGo,
    extractSchemaFromThunk,
    extractSchemaCompetitor,
    findTypedCall,
    extractTypeForm,
  };
}
