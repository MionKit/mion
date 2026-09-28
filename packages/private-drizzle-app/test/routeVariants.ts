// A dialect's three route files are ONE set of routes: types and drizzle are the builders file with other imports,
// and drizzle also leaves every return type to drizzle.

import * as ts from 'typescript';

export type Dialect = 'pg' | 'mysql' | 'sqlite';
export type Variant = 'builders' | 'types' | 'drizzle';
export const DIALECTS: Dialect[] = ['pg', 'mysql', 'sqlite'];
export const VARIANTS: Variant[] = ['drizzle', 'types', 'builders'];

const cap = (text: string) => text[0].toUpperCase() + text.slice(1);

export function importsOf(dialect: Dialect, variant: Variant): {db: string; models: string} {
  if (variant === 'builders') return {db: `../db/${dialect}.db.ts`, models: `../db/${dialect}.schema.ts`};
  if (variant === 'types') return {db: `../db/${dialect}.types.db.ts`, models: `../db/${dialect}.types.schema.ts`};
  return {db: `../db/${dialect}.plain.db.ts`, models: `../db/${dialect}.plain.db.ts`};
}

export const routesName = (dialect: Dialect, variant: Variant) => `${dialect}${cap(variant)}Routes`;

export function stripReturnTypes(source: string): string {
  const file = ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true);
  const cuts: [number, number][] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'mion.route') {
      const handler = node.arguments[0];
      if (handler && ts.isArrowFunction(handler) && handler.type) {
        cuts.push([source.lastIndexOf(':', handler.type.getStart(file)), handler.type.end]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return cuts.reduceRight((text, [start, end]) => text.slice(0, start) + text.slice(end), source);
}

export function deriveVariant(buildersSource: string, dialect: Dialect, variant: Variant): string {
  const from = importsOf(dialect, 'builders');
  const to = importsOf(dialect, variant);
  const swapped = buildersSource
    .split(`'${from.db}'`)
    .join(`'${to.db}'`)
    .split(`'${from.models}'`)
    .join(`'${to.models}'`)
    .split(routesName(dialect, 'builders'))
    .join(routesName(dialect, variant));
  return variant === 'drizzle' ? dropUnusedTypeImports(stripReturnTypes(swapped)) : swapped;
}

/** Drops `import type` names the rest of the file no longer uses. */
function dropUnusedTypeImports(source: string): string {
  return source.replace(/^import type \{([^}]*)\} from ('[^']+');$/m, (_line, names: string, from: string) => {
    const rest = source.replace(_line, '');
    const used = names
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && new RegExp(`\\b${name}\\b`).test(rest));
    return `import type {${used.join(', ')}} from ${from};`;
  });
}

/** Comments and layout dropped, so two files compare on what they do. */
export function codeOf(source: string): string {
  const file = ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true);
  return ts.createPrinter({removeComments: true}).printFile(file);
}
