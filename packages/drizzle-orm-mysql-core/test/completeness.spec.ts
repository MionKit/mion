/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every mysql column function's runtime modifiers must equal its props keys, both ways, so a drizzle upgrade adding one
// fails here. Entry, table and view builders are held to drizzle's method lists; the manifest gate covers new exported
// FUNCTIONS, this covers new METHODS on what they return.

import {describe, it, expect} from 'vitest';
import * as dzMy from 'drizzle-orm/mysql-core';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Methods on the prototype chain plus own functions: drizzle defines the $default/$onUpdate aliases as own arrows. */
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

// Called by drizzle itself while assembling the table, never part of the authoring surface.
const INTERNAL_COLUMN_METHODS = new Set(['build', 'buildExtraConfigColumn', 'buildForeignKeys', 'setName']);
const INTERNAL_ENTRY_METHODS = new Set(['build']);

const sourceOf = (file: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', file), 'utf8');
const columnsSource = sourceOf('columns.ts');
const typesSource = sourceOf('types.ts');
const helpersSource = sourceOf('helpers.ts');

/** The keys an exported interface declares, its `extends` parents' included. */
function interfaceKeys(source: string, name: string): Set<string> {
  const declared = new RegExp(`export interface ${name}(?: extends ([\\w, ]+))? \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!declared) throw new Error(`no interface ${name} in the source`);
  const keys = new Set([...declared[2].matchAll(/^ {2}([\w$]+)\??[:(]/gm)].map((match) => match[1]));
  for (const parent of declared[1]?.split(',') ?? []) for (const key of interfaceKeys(source, parent.trim())) keys.add(key);
  return keys;
}

/** Each builder's props interface, off its `const C extends Only<C, ... & XIn>` overloads; mysqlEnum lives in helpers. */
const propsInterfaceOf = new Map(
  [columnsSource, helpersSource].flatMap((source) =>
    [...source.matchAll(/export function (\w+)<[^;{]*?const C extends Only<C, (?:[\w<>'| ]+ & )?(\w+In)>/g)].map(
      (match) => [match[1], match[2]] as const
    )
  )
);
/** One representative raw drizzle builder per column function. */
const RAW_BUILDERS: Record<string, object> = {
  bigint: dzMy.bigint('c', {mode: 'number'}),
  binary: dzMy.binary('c'),
  boolean: dzMy.boolean('c'),
  char: dzMy.char('c'),
  date: dzMy.date('c'),
  datetime: dzMy.datetime('c'),
  decimal: dzMy.decimal('c'),
  double: dzMy.double('c'),
  float: dzMy.float('c'),
  int: dzMy.int('c'),
  json: dzMy.json('c'),
  longtext: dzMy.longtext('c'),
  mediumint: dzMy.mediumint('c'),
  mediumtext: dzMy.mediumtext('c'),
  mysqlEnum: dzMy.mysqlEnum('c', ['a']),
  real: dzMy.real('c'),
  serial: dzMy.serial('c'),
  smallint: dzMy.smallint('c'),
  text: dzMy.text('c'),
  time: dzMy.time('c'),
  timestamp: dzMy.timestamp('c'),
  tinyint: dzMy.tinyint('c'),
  tinytext: dzMy.tinytext('c'),
  varbinary: dzMy.varbinary('c', {length: 4}),
  varchar: dzMy.varchar('c', {length: 4}),
  year: dzMy.year('c'),
};

describe('mysql slim surface: modifier completeness against drizzle', () => {
  for (const [fnName, builder] of Object.entries(RAW_BUILDERS)) {
    it(`${fnName}: the props object takes exactly drizzle's modifiers`, () => {
      const propsInterface = propsInterfaceOf.get(fnName);
      expect(propsInterface, `no props interface found for ${fnName}`).toBeDefined();
      const propsKeys = interfaceKeys(typesSource, propsInterface!);
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
    const start = runtimeMethods(dzMy.index('i') as unknown as object).filter((method) => !INTERNAL_ENTRY_METHODS.has(method));
    const options = runtimeMethods((dzMy as unknown as {IndexBuilder: {prototype: object}}).IndexBuilder.prototype).filter(
      (method) => !INTERNAL_ENTRY_METHODS.has(method)
    );
    expect([...interfaceKeys(helpersSource, 'RtMyIndexBuilderOn')].sort()).toEqual(start);
    expect([...interfaceKeys(helpersSource + typesSource, 'RtMyIndexEntry')].sort()).toEqual(options);
  });

  it('entry builders: every entry chain drizzle has is covered', () => {
    const slimEntryMethods = new Set(['on', 'using', 'algorithm', 'lock', 'onDelete', 'onUpdate']);
    const entryPrototypes: Record<string, object> = {
      indexStart: dzMy.index('i') as unknown as object,
      indexChain: (dzMy as unknown as {IndexBuilder: {prototype: object}}).IndexBuilder.prototype,
      unique: (dzMy as unknown as {UniqueConstraintBuilder: {prototype: object}}).UniqueConstraintBuilder.prototype,
      uniqueOn: (dzMy as unknown as {UniqueOnConstraintBuilder?: {prototype: object}}).UniqueOnConstraintBuilder?.prototype ?? {},
      foreignKey: (dzMy as unknown as {ForeignKeyBuilder: {prototype: object}}).ForeignKeyBuilder.prototype,
      primaryKey: (dzMy as unknown as {PrimaryKeyBuilder: {prototype: object}}).PrimaryKeyBuilder.prototype,
      check: (dzMy as unknown as {CheckBuilder: {prototype: object}}).CheckBuilder.prototype,
    };
    for (const [label, proto] of Object.entries(entryPrototypes)) {
      const uncovered = runtimeMethods(proto).filter(
        (method) => !INTERNAL_ENTRY_METHODS.has(method) && !slimEntryMethods.has(method)
      );
      expect(uncovered, `drizzle's ${label} builder grew methods the slim entries do not record`).toEqual([]);
    }
  });

  it('the table itself: every authoring method drizzle adds is covered', () => {
    const table = dzMy.mysqlTable('t', {id: dzMy.int('id')});
    const uncovered = Object.getOwnPropertyNames(table).filter(
      (name) => typeof (table as unknown as Record<string, unknown>)[name] === 'function'
    );
    expect(uncovered, "drizzle's table grew authoring methods the slim table does not carry").toEqual([]);
  });

  it('view builders: the manual-column chains are covered', () => {
    const slimViewMethods = new Set(['as', 'existing', 'algorithm', 'sqlSecurity', 'withCheckOption']);
    const uncovered = runtimeMethods(dzMy.mysqlView('v', {id: dzMy.int('id')}) as unknown as object).filter(
      (method) => !INTERNAL_ENTRY_METHODS.has(method) && !slimViewMethods.has(method)
    );
    expect(uncovered, "drizzle's view builder grew methods the slim views do not record").toEqual([]);
  });
});
