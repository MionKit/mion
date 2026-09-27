/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Unit specs of the type-road bridge over SYNTHETIC reflected graphs (no
// resolver, no drizzle): the walker's rebuild order, arg shapes and every
// error path. Real-graph and real-drizzle equality live in the dialect
// packages (typeTables.spec.ts). The dev-only @mionjs/run-types import here
// pins the local kind constants; the bridge itself never imports core.

import {describe, it, expect} from 'vitest';
import {RunTypeKind} from '@mionjs/run-types';
import type {DrizzleContext, ReflectedNode} from '../src/types.ts';
import {buildRtTableFromGraph, reflectedKinds} from '../src/fromType.ts';
import {materializeRtTable} from '../src/table.ts';

// ── tiny node builders ───────────────────────────────────────────────────────

let nextId = 0;
const id = () => `n${nextId++}`;
const lit = (value: unknown): ReflectedNode => ({id: id(), kind: reflectedKinds.literal, literal: value});
const undef = (): ReflectedNode => ({id: id(), kind: reflectedKinds.undefined});
const obj = (members: Record<string, ReflectedNode>): ReflectedNode => ({
  id: id(),
  kind: reflectedKinds.objectLiteral,
  children: Object.entries(members).map(([name, child]) => ({id: id(), kind: 32, name, child})),
});
const tuple = (...items: ReflectedNode[]): ReflectedNode => ({
  id: id(),
  kind: reflectedKinds.tuple,
  children: items.map((child) => ({id: id(), kind: 27, child})),
});

/** A column: ONE spec whose config holds the config keys and the modifier calls together, in authored order. */
function colNode(fn: string, props: Record<string, ReflectedNode> = {}): ReflectedNode {
  return obj({'þ@rtColSpecKey': obj({fn: lit(fn), config: obj(props), data: obj({}), base: undef()})});
}

/** A table: db names that differ from the record key ride its `names` member. */
function tableNode(name: string, columns: Record<string, ReflectedNode>, names: Record<string, string> = {}): ReflectedNode {
  // The graph IS the meta: the brand marks it a table, the rest are its members.
  const namesNode = obj(Object.fromEntries(Object.entries(names).map(([key, dbName]) => [key, lit(dbName)])));
  return obj({'þ@rtTableBrand': lit('pg'), name: lit(name), columns: obj(columns), names: namesNode});
}

// ── fake replay surface (same pattern as recorder.spec.ts) ───────────────────

function makeFake() {
  const calls: unknown[][] = [];
  const chain = (label: string) => {
    const proxy: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
      get: (_obj, prop) => {
        return (...args: unknown[]) => {
          calls.push([label, prop, ...args]);
          return proxy;
        };
      },
    });
    return proxy as never;
  };
  const ns = new Proxy({} as Record<string, (...args: never[]) => unknown>, {
    get:
      (_obj, fnName) =>
      (...args: unknown[]) => {
        calls.push(['ns', fnName, ...args]);
        return chain(`ns.${String(fnName)}`);
      },
  });
  const context: DrizzleContext = {ns, sqlNs: (() => undefined) as never};
  const buildTable = (buildContext: DrizzleContext, name: string, builders: Record<string, unknown>) => {
    void buildContext;
    calls.push(['buildTable', name, Object.keys(builders)]);
    return {tableName: name};
  };
  return {calls, context, buildTable};
}

describe('buildRtTableFromGraph', () => {
  it('local kind constants match RunTypeKind (the wire contract)', () => {
    expect(reflectedKinds.undefined).toBe(RunTypeKind.undefined);
    expect(reflectedKinds.literal).toBe(RunTypeKind.literal);
    expect(reflectedKinds.tuple).toBe(RunTypeKind.tuple);
    expect(reflectedKinds.objectLiteral).toBe(RunTypeKind.objectLiteral);
  });

  it('rebuilds init args and replays modifiers (flags and args tuples) in order', () => {
    const fake = makeFake();
    const graph = tableNode(
      'users',
      {bio: colNode('varchar', {length: lit(500), notNull: lit(true), default: tuple(lit(21))})},
      {bio: 'bio_text'}
    );
    const slim = buildRtTableFromGraph(graph, fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'varchar', 'bio_text', {length: 500}],
      ['ns.varchar', 'notNull'],
      ['ns.varchar', 'default', 21],
      ['buildTable', 'users', ['bio']],
    ]);
  });

  it('a column with no names entry and an empty config replays the builder with its key as the db name', () => {
    const fake = makeFake();
    const slim = buildRtTableFromGraph(tableNode('t', {note: colNode('varchar')}), fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'varchar', 'note'],
      ['buildTable', 't', ['note']],
    ]);
  });

  it('a config-only column passes its key as the db name, then the config', () => {
    const fake = makeFake();
    const slim = buildRtTableFromGraph(tableNode('t', {note: colNode('varchar', {length: lit(5)})}), fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls[0]).toEqual(['ns', 'varchar', 'note', {length: 5}]);
  });

  it('replays a runtime-callback marker with the options.runtime callback, in props order', () => {
    const fake = makeFake();
    const callback = () => 'generated';
    const graph = tableNode('users', {slug: colNode('varchar', {notNull: lit(true), $defaultFn: lit(true), unique: tuple()})});
    const slim = buildRtTableFromGraph(graph, fake.buildTable, {runtime: {slug: {$defaultFn: callback}}});
    materializeRtTable(slim, fake.context);
    // mapReplayArgs wraps top-level function args, so assert the wrapper forwards to the options callback.
    expect(fake.calls).toEqual([
      ['ns', 'varchar', 'slug'],
      ['ns.varchar', 'notNull'],
      ['ns.varchar', '$defaultFn', expect.any(Function)],
      ['ns.varchar', 'unique'],
      ['buildTable', 'users', ['slug']],
    ]);
    const replayed = fake.calls[2][2] as () => unknown;
    expect(replayed()).toBe('generated');
  });

  it('replays each runtime method under its own name ($default vs $onUpdateFn)', () => {
    const fake = makeFake();
    const onUpdate = () => 0;
    const graph = tableNode('t', {c: colNode('integer', {$default: lit(true), $onUpdateFn: lit(true)})});
    const slim = buildRtTableFromGraph(graph, fake.buildTable, {runtime: {c: {$default: onUpdate, $onUpdateFn: onUpdate}}});
    materializeRtTable(slim, fake.context);
    expect(fake.calls.map((call) => call[1])).toEqual(['integer', '$default', '$onUpdateFn', 't']);
  });

  it('rejects a runtime marker without its options.runtime callback, naming column and method', () => {
    const graph = tableNode('t', {c: colNode('uuid', {$defaultFn: lit(true)})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/column "c" carries the \$defaultFn marker/);
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable, {runtime: {c: {$onUpdate: () => 1}}})).toThrowError(
      /column "c" carries the \$defaultFn marker/
    );
  });

  it('rejects an options.runtime callback with no matching marker (and unknown columns)', () => {
    const graph = tableNode('t', {c: colNode('uuid', {$defaultFn: lit(true)})});
    const runtime = {c: {$defaultFn: () => 1, $onUpdate: () => 2}};
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable, {runtime})).toThrowError(
      /options\.runtime\.c\.\$onUpdate has no matching/
    );
    expect(() =>
      buildRtTableFromGraph(graph, makeFake().buildTable, {runtime: {c: {$defaultFn: () => 1}, ghost: {$default: () => 2}}})
    ).toThrowError(/options\.runtime\.ghost\.\$default has no matching/);
  });

  it('rejects a graph that is not a table', () => {
    expect(() => buildRtTableFromGraph(obj({a: lit(1)}), makeFake().buildTable)).toThrowError(/not a table/);
  });

  it('rejects a column without a spec', () => {
    const graph = tableNode('t', {plain: obj({})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/no column spec/);
  });

  it('an unrecognised props key rides into the builder call, it is never replayed', () => {
    // At runtime a typo'd modifier looks like a config key (the props bags reject it at compile time); never call it.
    const fake = makeFake();
    const graph = tableNode('t', {c: colNode('uuid', {frobnicate: lit(true), notNull: lit(true)})});
    const slim = buildRtTableFromGraph(graph, fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'uuid', 'c', {frobnicate: true}],
      ['ns.uuid', 'notNull'],
      ['buildTable', 't', ['c']],
    ]);
  });

  it('rejects a modifier value that is neither a flag nor an args tuple', () => {
    const graph = tableNode('t', {c: colNode('uuid', {default: lit(21)})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/neither a flag nor an args tuple/);
  });

  it('rejects a non-literal config member', () => {
    const fnTyped: ReflectedNode = {id: id(), kind: 17};
    const graph = tableNode('t', {c: colNode('varchar', {length: fnTyped})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/not a literal type/);
  });

  // The brand is what says "table" at all: a bare {name, columns} object is not
  // one, which is the whole reason the metadata carries a sentinel of its own.
  it('rejects a graph with no table brand', () => {
    const graph = obj({name: lit('t'), columns: obj({c: colNode('varchar')})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/is not a table/);
  });

  // And the dialect it carries must match the bridge rebuilding it, or the
  // rebuilt table would replay a pg call through another dialect's namespace.
  it('rejects a table of another dialect', () => {
    const graph = tableNode('t', {c: colNode('varchar')});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable, undefined, 'mysql')).toThrowError(
      /is a pg table, rebuilt through the mysql package/
    );
  });

  it('accepts the dialect it was recorded with', () => {
    const graph = tableNode('t', {c: colNode('varchar')});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable, undefined, 'pg')).not.toThrow();
  });
});
