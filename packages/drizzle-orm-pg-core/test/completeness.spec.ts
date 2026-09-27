/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Modifier completeness: for every pg column function, the modifiers drizzle exposes at runtime must be exactly the
// modifier keys that builder's props object takes (read off src/columns.ts), in both directions. A drizzle upgrade
// that adds a modifier fails here instead of silently building tables that drop it; a props key drizzle's builder
// lacks fails too. Entry builders, the table's own methods and view builders are held to drizzle's method lists.
// The manifest gate covers new exported FUNCTIONS; this covers new METHODS on what they return.

import {describe, it, expect} from 'vitest';
import * as dzPg from 'drizzle-orm/pg-core';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/** All method names reachable through the prototype chain plus own function
 *  properties (drizzle defines the $default/$onUpdate aliases as own arrows). */
function runtimeMethods(value: object): string[] {
  const names = new Set<string>();
  for (const name of Object.getOwnPropertyNames(value)) {
    if (name !== 'constructor' && typeof (value as Record<string, unknown>)[name] === 'function') names.add(name);
  }
  let proto = Object.getPrototypeOf(value);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name !== 'constructor' && typeof proto[name] === 'function') names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names].sort();
}

// Internal drizzle machinery, never part of the authoring surface: called by
// drizzle itself while assembling the table.
const INTERNAL_COLUMN_METHODS = new Set(['build', 'buildExtraConfigColumn', 'buildForeignKeys', 'setName']);
const INTERNAL_ENTRY_METHODS = new Set(['build']);

const sourceOf = (file: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', file), 'utf8');
const columnsSource = sourceOf('columns.ts');

/** The keys an exported interface declares, its `extends` parents' included. */
function interfaceKeys(source: string, name: string): Set<string> {
  const declared = new RegExp(`export interface ${name}(?: extends ([\\w, ]+))? \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!declared) throw new Error(`no interface ${name} in the source`);
  const keys = new Set([...declared[2].matchAll(/^ {2}([\w$]+)\??[:(]/gm)].map((match) => match[1]));
  for (const parent of declared[1]?.split(',') ?? []) for (const key of interfaceKeys(source, parent.trim())) keys.add(key);
  return keys;
}

/** Each builder's props interface, off its `const C extends Only<C, ... & XIn>` overloads. */
const propsInterfaceOf = new Map(
  [...columnsSource.matchAll(/export function (\w+)<[^>]*?const C extends Only<C, (?:[\w<>'| ]+ & )?(\w+In)>/g)].map((match) => [
    match[1],
    match[2],
  ])
);
/** One representative raw drizzle builder per column function. */
const RAW_BUILDERS: Record<string, object> = {
  bigint: dzPg.bigint('c', {mode: 'number'}),
  bigserial: dzPg.bigserial('c', {mode: 'number'}),
  bit: dzPg.bit('c', {dimensions: 3}),
  boolean: dzPg.boolean('c'),
  char: dzPg.char('c', {length: 2}),
  cidr: dzPg.cidr('c'),
  date: dzPg.date('c'),
  decimal: dzPg.decimal('c'),
  doublePrecision: dzPg.doublePrecision('c'),
  geometry: dzPg.geometry('c'),
  halfvec: dzPg.halfvec('c', {dimensions: 3}),
  inet: dzPg.inet('c'),
  integer: dzPg.integer('c'),
  interval: dzPg.interval('c'),
  json: dzPg.json('c'),
  jsonb: dzPg.jsonb('c'),
  line: dzPg.line('c'),
  macaddr: dzPg.macaddr('c'),
  macaddr8: dzPg.macaddr8('c'),
  numeric: dzPg.numeric('c'),
  point: dzPg.point('c'),
  real: dzPg.real('c'),
  serial: dzPg.serial('c'),
  smallint: dzPg.smallint('c'),
  smallserial: dzPg.smallserial('c'),
  sparsevec: dzPg.sparsevec('c', {dimensions: 3}),
  text: dzPg.text('c'),
  time: dzPg.time('c'),
  timestamp: dzPg.timestamp('c'),
  uuid: dzPg.uuid('c'),
  varchar: dzPg.varchar('c', {length: 5}),
  vector: dzPg.vector('c', {dimensions: 3}),
};

describe('pg slim surface: modifier completeness against drizzle', () => {
  for (const [fnName, builder] of Object.entries(RAW_BUILDERS)) {
    it(`${fnName}: the props object takes exactly drizzle's modifiers`, () => {
      const propsInterface = propsInterfaceOf.get(fnName);
      expect(propsInterface, `no props interface found for ${fnName}`).toBeDefined();
      const propsKeys = interfaceKeys(columnsSource, propsInterface!);
      const modifiers = runtimeMethods(builder).filter((method) => !INTERNAL_COLUMN_METHODS.has(method));
      expect(
        modifiers.filter((method) => !propsKeys.has(method)),
        `drizzle's ${fnName} grew modifiers the props lack`
      ).toEqual([]);
      expect(
        [...propsKeys].filter((key) => !modifiers.includes(key)),
        `${fnName} props offer modifiers drizzle lacks`
      ).toEqual([]);
    });
  }

  it("indexes take drizzle's two steps: the columns, then the options", () => {
    const helpersSource = sourceOf('helpers.ts');
    const start = runtimeMethods(dzPg.index('i') as unknown as object).filter((method) => !INTERNAL_ENTRY_METHODS.has(method));
    const options = runtimeMethods((dzPg as unknown as {IndexBuilder: {prototype: object}}).IndexBuilder.prototype).filter(
      (method) => !INTERNAL_ENTRY_METHODS.has(method)
    );
    expect([...interfaceKeys(helpersSource, 'RtIndexBuilderOn')].sort()).toEqual(start);
    expect([...interfaceKeys(helpersSource, 'RtIndexEntry')].sort()).toEqual(options);
  });

  it('entry builders: every entry chain drizzle has is covered', () => {
    const slimEntryMethods = new Set([
      'on',
      'onOnly',
      'using',
      'concurrently',
      'where',
      'with',
      'nullsNotDistinct',
      'onDelete',
      'onUpdate',
      'link',
    ]);
    const entryPrototypes: Record<string, object> = {
      indexStart: dzPg.index('i') as unknown as object,
      indexChain: (dzPg as unknown as {IndexBuilder: {prototype: object}}).IndexBuilder.prototype,
      unique: (dzPg as unknown as {UniqueConstraintBuilder: {prototype: object}}).UniqueConstraintBuilder.prototype,
      uniqueOn: (dzPg as unknown as {UniqueOnConstraintBuilder?: {prototype: object}}).UniqueOnConstraintBuilder?.prototype ?? {},
      foreignKey: (dzPg as unknown as {ForeignKeyBuilder: {prototype: object}}).ForeignKeyBuilder.prototype,
      policy: dzPg.pgPolicy('p') as unknown as object,
    };
    for (const [label, proto] of Object.entries(entryPrototypes)) {
      const uncovered = runtimeMethods(proto).filter(
        (method) => !INTERNAL_ENTRY_METHODS.has(method) && !slimEntryMethods.has(method)
      );
      expect(uncovered, `drizzle's ${label} builder grew methods the slim entries do not record`).toEqual([]);
    }
  });

  it('only pg: role handles: the pgRole chain methods are covered', () => {
    const slimRoleMethods = new Set(['existing']);
    const uncovered = runtimeMethods(dzPg.pgRole('r') as unknown as object).filter(
      (method) => !INTERNAL_ENTRY_METHODS.has(method) && !slimRoleMethods.has(method)
    );
    expect(uncovered, "drizzle's pgRole grew methods the slim role handle does not record").toEqual([]);
  });

  it('the table itself: every authoring method drizzle adds is covered', () => {
    const slimTableMethods = new Set(['enableRLS']);
    const table = dzPg.pgTable('t', {id: dzPg.integer('id')});
    const uncovered = Object.getOwnPropertyNames(table)
      .filter((name) => typeof (table as unknown as Record<string, unknown>)[name] === 'function')
      .filter((method) => !slimTableMethods.has(method));
    expect(uncovered, "drizzle's table grew authoring methods the slim table does not carry").toEqual([]);
  });

  it('view builders: the manual-column chains are covered', () => {
    const slimViewMethods = new Set(['as', 'existing', 'with', 'using', 'tablespace', 'withNoData']);
    const viewBuilders: Record<string, object> = {
      view: dzPg.pgView('v', {id: dzPg.integer('id')}) as unknown as object,
      materializedView: dzPg.pgMaterializedView('mv', {id: dzPg.integer('id')}) as unknown as object,
    };
    for (const [label, builder] of Object.entries(viewBuilders)) {
      const uncovered = runtimeMethods(builder).filter(
        (method) => !INTERNAL_ENTRY_METHODS.has(method) && !slimViewMethods.has(method)
      );
      expect(uncovered, `drizzle's ${label} builder grew methods the slim views do not record`).toEqual([]);
    }
  });
});
