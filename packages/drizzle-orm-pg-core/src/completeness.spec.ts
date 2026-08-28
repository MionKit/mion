/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Chain-method completeness: for every pg column function and every entry
// builder, the methods drizzle exposes at runtime must be covered by the slim
// surface (recorded by the recorder AND declared on the matching kind/entry
// interface) or listed here as deliberately internal. A drizzle upgrade that
// adds a modifier fails this spec instead of silently building tables that
// drop it. The manifest gate covers new exported FUNCTIONS; this covers new
// METHODS on the builders those functions return.

import {describe, it, expect} from 'vitest';
import * as dz from 'drizzle-orm/pg-core';

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

// What the slim surface records on columns (RtColumnRecorder methods + the
// kind interfaces). Kept as an explicit list so a drizzle addition and a slim
// addition must MEET here, in one reviewable place.
const SLIM_COLUMN_METHODS = new Set([
  '$type',
  '$default',
  '$defaultFn',
  '$onUpdate',
  '$onUpdateFn',
  'notNull',
  'default',
  'defaultNow',
  'defaultRandom',
  'primaryKey',
  'unique',
  'references',
  'generatedAlwaysAs',
  'generatedAlwaysAsIdentity',
  'generatedByDefaultAsIdentity',
  'array',
  'autoincrement',
  'onUpdateNow',
]);

/** One representative raw drizzle builder per column function. */
const RAW_BUILDERS: Record<string, object> = {
  bigint: dz.bigint('c', {mode: 'number'}),
  bigserial: dz.bigserial('c', {mode: 'number'}),
  bit: dz.bit('c', {dimensions: 3}),
  boolean: dz.boolean('c'),
  char: dz.char('c', {length: 2}),
  cidr: dz.cidr('c'),
  date: dz.date('c'),
  decimal: dz.decimal('c'),
  doublePrecision: dz.doublePrecision('c'),
  geometry: dz.geometry('c'),
  halfvec: dz.halfvec('c', {dimensions: 3}),
  inet: dz.inet('c'),
  integer: dz.integer('c'),
  interval: dz.interval('c'),
  json: dz.json('c'),
  jsonb: dz.jsonb('c'),
  line: dz.line('c'),
  macaddr: dz.macaddr('c'),
  macaddr8: dz.macaddr8('c'),
  numeric: dz.numeric('c'),
  point: dz.point('c'),
  real: dz.real('c'),
  serial: dz.serial('c'),
  smallint: dz.smallint('c'),
  smallserial: dz.smallserial('c'),
  sparsevec: dz.sparsevec('c', {dimensions: 3}),
  text: dz.text('c'),
  time: dz.time('c'),
  timestamp: dz.timestamp('c'),
  uuid: dz.uuid('c'),
  varchar: dz.varchar('c', {length: 5}),
  vector: dz.vector('c', {dimensions: 3}),
};

describe('pg slim surface — chain-method completeness against drizzle', () => {
  for (const [fnName, builder] of Object.entries(RAW_BUILDERS)) {
    it(`${fnName}: every drizzle modifier is covered by the slim surface`, () => {
      const uncovered = runtimeMethods(builder).filter(
        (method) => !INTERNAL_COLUMN_METHODS.has(method) && !SLIM_COLUMN_METHODS.has(method)
      );
      expect(uncovered, `drizzle's ${fnName} builder grew modifiers the slim surface does not record`).toEqual([]);
    });
  }

  it('entry builders: index/unique/foreignKey chains are covered', () => {
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
    ]);
    const entryPrototypes: Record<string, object> = {
      indexStart: dz.index('i') as unknown as object,
      indexChain: (dz as unknown as {IndexBuilder: {prototype: object}}).IndexBuilder.prototype,
      unique: (dz as unknown as {UniqueConstraintBuilder: {prototype: object}}).UniqueConstraintBuilder.prototype,
      uniqueOn: (dz as unknown as {UniqueOnConstraintBuilder?: {prototype: object}}).UniqueOnConstraintBuilder?.prototype ?? {},
      foreignKey: (dz as unknown as {ForeignKeyBuilder: {prototype: object}}).ForeignKeyBuilder.prototype,
    };
    for (const [label, proto] of Object.entries(entryPrototypes)) {
      const uncovered = runtimeMethods(proto).filter(
        (method) => !INTERNAL_ENTRY_METHODS.has(method) && !slimEntryMethods.has(method)
      );
      expect(uncovered, `drizzle's ${label} builder grew methods the slim entries do not record`).toEqual([]);
    }
  });
});
