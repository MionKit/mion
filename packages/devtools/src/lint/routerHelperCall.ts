/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, AST_NODE_TYPES} from '@typescript-eslint/utils';

// ############# Recognising a route declaration #############
// Routes and middleFns are declared through the helpers `createMionRouter` returns, never through
// bare imports from @mionjs/router (the package exports no `route`). The rules are purely syntactic
// (OXlint's jsPlugins have no type information), so a call counts as a route declaration when:
//
//   mion.route(handler)          `mion` is bound in this file by `const mion = createMionRouter(...)`
//                                (createMionRouter imported from @mionjs/router), or is imported from
//                                a RELATIVE module (`import {mion} from './mion.ts'`, the usual layout)
//   route(handler)               `route` is bound by destructuring a router in this file
//                                (`const {route} = createMionRouter(...)` / `const {route} = mion`) or is
//                                imported from a RELATIVE module (a re-exported destructure)
//
// A helper name imported from a PACKAGE never counts: `import {route} from 'express-like'` is left alone.

/** The helpers whose handlers the rules check. rawMiddleFn takes no typed params, so it is not listed. */
export const ROUTER_HELPERS = ['route', 'query', 'mutation', 'middleFn', 'headersFn'] as const;
export type RouterHelperName = (typeof ROUTER_HELPERS)[number];

export interface RouterHelperBindings {
  /** Local names bound to a router object (`createMionRouter(...)` result, or any relative import). */
  routers: Set<string>;
  /** Local names bound to a bare helper, mapped to the helper they stand for. */
  helpers: Map<string, RouterHelperName>;
}

const ROUTER_PACKAGE = '@mionjs/router';
const FACTORY_NAME = 'createMionRouter';

const bindingsByProgram = new WeakMap<TSESTree.Program, RouterHelperBindings>();

function isRouterHelperName(name: string): name is RouterHelperName {
  return (ROUTER_HELPERS as readonly string[]).includes(name);
}

function isRelativeSource(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../');
}

function unwrapDeclaration(statement: TSESTree.ProgramStatement): TSESTree.VariableDeclaration | null {
  if (statement.type === AST_NODE_TYPES.VariableDeclaration) return statement;
  if (
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration &&
    statement.declaration?.type === AST_NODE_TYPES.VariableDeclaration
  )
    return statement.declaration;
  return null;
}

function isCallTo(node: TSESTree.Expression | null | undefined, localName: string | null): node is TSESTree.CallExpression {
  if (!localName || node?.type !== AST_NODE_TYPES.CallExpression) return false;
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === localName;
}

/** Records every `helper: local` (or shorthand) property of a destructuring pattern as a bound helper. */
function collectDestructuredHelpers(pattern: TSESTree.ObjectPattern, helpers: Map<string, RouterHelperName>): void {
  for (const property of pattern.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.key.type !== AST_NODE_TYPES.Identifier) continue;
    if (property.value.type !== AST_NODE_TYPES.Identifier || !isRouterHelperName(property.key.name)) continue;
    helpers.set(property.value.name, property.key.name);
  }
}

/** Walks the program's top level once and records which local names stand for a router or a helper. */
export function collectRouterHelperBindings(program: TSESTree.Program): RouterHelperBindings {
  const cached = bindingsByProgram.get(program);
  if (cached) return cached;
  const routers = new Set<string>();
  const helpers = new Map<string, RouterHelperName>();
  let factoryLocalName: string | null = null;

  // pass 1: imports (the factory's local name, relative routers and helpers) and the factory calls
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      const source = statement.source.value;
      const fromRouterPackage = source === ROUTER_PACKAGE || source === `${ROUTER_PACKAGE}/`;
      for (const specifier of statement.specifiers) {
        if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) continue;
        const localName = specifier.local.name;
        const importedName =
          specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier
            ? specifier.imported.name
            : localName;
        if (fromRouterPackage && importedName === FACTORY_NAME) factoryLocalName = localName;
        if (!isRelativeSource(source)) continue;
        if (isRouterHelperName(importedName)) helpers.set(localName, importedName);
        else routers.add(localName);
      }
      continue;
    }
    const declaration = unwrapDeclaration(statement);
    if (!declaration) continue;
    for (const declarator of declaration.declarations) {
      if (!isCallTo(declarator.init, factoryLocalName)) continue;
      if (declarator.id.type === AST_NODE_TYPES.Identifier) routers.add(declarator.id.name);
      if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) collectDestructuredHelpers(declarator.id, helpers);
    }
  }

  // pass 2: `const {route} = mion` over a router bound above (in either order)
  for (const statement of program.body) {
    const declaration = unwrapDeclaration(statement);
    if (!declaration) continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== AST_NODE_TYPES.ObjectPattern) continue;
      if (declarator.init?.type !== AST_NODE_TYPES.Identifier || !routers.has(declarator.init.name)) continue;
      collectDestructuredHelpers(declarator.id, helpers);
    }
  }

  const bindings = {routers, helpers};
  bindingsByProgram.set(program, bindings);
  return bindings;
}

/** The helper a call declares a route through (`mion.route(...)` or a destructured `route(...)`), or null. */
export function getRouterHelperName(call: TSESTree.CallExpression, bindings: RouterHelperBindings): RouterHelperName | null {
  const callee = call.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) return bindings.helpers.get(callee.name) ?? null;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return null;
  if (callee.object.type !== AST_NODE_TYPES.Identifier || callee.property.type !== AST_NODE_TYPES.Identifier) return null;
  if (!bindings.routers.has(callee.object.name) || !isRouterHelperName(callee.property.name)) return null;
  return callee.property.name;
}

type HandlerFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

/** The helper a function is the HANDLER of: it must be the first argument of a helper call. */
export function getRouterHelperOfHandler(func: HandlerFunction, program: TSESTree.Program): RouterHelperName | null {
  const parent = func.parent;
  if (parent?.type !== AST_NODE_TYPES.CallExpression || parent.arguments[0] !== func) return null;
  return getRouterHelperName(parent, collectRouterHelperBindings(program));
}

/** How many leading handler params carry no wire data: the context, plus the headers for a headersFn. */
export function contextParamCount(helper: RouterHelperName): number {
  return helper === 'headersFn' ? 2 : 1;
}
