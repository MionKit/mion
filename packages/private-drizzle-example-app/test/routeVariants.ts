// Types and drizzle route files are the builders file with the db file and name swapped; drizzle also drops return types.

import * as ts from 'typescript';

export type Dialect = 'pg' | 'mysql' | 'sqlite';
export type Variant = 'builders' | 'types' | 'drizzle';
export const DIALECTS: Dialect[] = ['pg', 'mysql', 'sqlite'];
export const VARIANTS: Variant[] = ['drizzle', 'types', 'builders'];

const cap = (text: string) => text[0].toUpperCase() + text.slice(1);

// Model and database imports must match variants.
export const dbFileOf = (dialect: Dialect, variant: Variant) => `../db/${dialect}.${variant}.ts`;

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
  const swapped = buildersSource
    .split(`'${dbFileOf(dialect, 'builders')}'`)
    .join(`'${dbFileOf(dialect, variant)}'`)
    .split(`'../db/${dialect}.builders.db.ts'`)
    .join(`'../db/${dialect}.${variant}${variant === 'drizzle' ? '' : '.db'}.ts'`)
    .split(routesName(dialect, 'builders'))
    .join(routesName(dialect, variant));
  return variant === 'drizzle' ? dropUnusedTypeImports(stripReturnTypes(swapped)) : swapped;
}

function dropUnusedTypeImports(source: string): string {
  return source.replace(/^import type \{([^}]*)\} from ('[^']+');$/gm, (_line, names: string, from: string) => {
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
