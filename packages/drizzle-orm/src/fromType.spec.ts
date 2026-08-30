/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Unit specs of the type-road bridge over SYNTHETIC reflected graphs (no
// resolver, no drizzle): the walker's rebuild order, arg shapes and every
// error path. Real-graph and real-drizzle equality live in the dialect
// packages (typeTables.spec.ts). The dev-only @ts-runtypes/core import here
// pins the local kind constants; the bridge itself never imports core.

import {describe, it, expect} from 'vitest';
import {RunTypeKind} from '@ts-runtypes/core';
import type {DrizzleContext} from './recorder.ts';
import {buildRtTableFromGraph, reflectedKinds, type ReflectedNode} from './fromType.ts';
import {materializeRtTable} from './table.ts';

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

function colNode(spec: {fn: string; name?: string; config?: ReflectedNode}, mods?: Record<string, ReflectedNode>): ReflectedNode {
  const members: Record<string, ReflectedNode> = {
    'þ@rtColSpecKey': obj({
      fn: lit(spec.fn),
      name: spec.name === undefined ? undef() : lit(spec.name),
      config: spec.config ?? obj({}),
      data: obj({}),
    }),
  };
  if (mods) members['þ@rtColModsKey'] = obj(mods);
  return obj(members);
}

function tableNode(name: string, columns: Record<string, ReflectedNode>): ReflectedNode {
  return obj({'þ@rtTableKey': obj({name: lit(name), columns: obj(columns)})});
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
    const graph = tableNode('users', {
      bio: colNode({fn: 'varchar', name: 'bio', config: obj({length: lit(500)})}, {notNull: lit(true), default: tuple(lit(21))}),
    });
    const slim = buildRtTableFromGraph(graph, fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'varchar', 'bio', {length: 500}],
      ['ns.varchar', 'notNull'],
      ['ns.varchar', 'default', 21],
      ['buildTable', 'users', ['bio']],
    ]);
  });

  it('a nameless column with an empty config replays a no-arg builder call', () => {
    const fake = makeFake();
    const slim = buildRtTableFromGraph(tableNode('t', {note: colNode({fn: 'varchar'})}), fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'varchar'],
      ['buildTable', 't', ['note']],
    ]);
  });

  it('a config-only column keeps the config as the single builder arg', () => {
    const fake = makeFake();
    const slim = buildRtTableFromGraph(
      tableNode('t', {note: colNode({fn: 'varchar', config: obj({length: lit(5)})})}),
      fake.buildTable
    );
    materializeRtTable(slim, fake.context);
    expect(fake.calls[0]).toEqual(['ns', 'varchar', {length: 5}]);
  });

  it('replays a runtime-callback marker with the options.runtime callback, in mods order', () => {
    const fake = makeFake();
    const callback = () => 'generated';
    const graph = tableNode('users', {
      slug: colNode({fn: 'varchar', name: 'slug'}, {notNull: lit(true), $defaultFn: lit(true), unique: tuple()}),
    });
    const slim = buildRtTableFromGraph(graph, fake.buildTable, {runtime: {slug: {$defaultFn: callback}}});
    materializeRtTable(slim, fake.context);
    // the replay wraps top-level function args lazily (mapReplayArgs), so the
    // replayed arg is a wrapper: assert it forwards to the options callback.
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
    const graph = tableNode('t', {c: colNode({fn: 'integer'}, {$default: lit(true), $onUpdateFn: lit(true)})});
    const slim = buildRtTableFromGraph(graph, fake.buildTable, {runtime: {c: {$default: onUpdate, $onUpdateFn: onUpdate}}});
    materializeRtTable(slim, fake.context);
    expect(fake.calls.map((call) => call[1])).toEqual(['integer', '$default', '$onUpdateFn', 't']);
  });

  it('rejects a runtime marker without its options.runtime callback, naming column and method', () => {
    const graph = tableNode('t', {c: colNode({fn: 'uuid'}, {$defaultFn: lit(true)})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/column "c" carries the \$defaultFn marker/);
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable, {runtime: {c: {$onUpdate: () => 1}}})).toThrowError(
      /column "c" carries the \$defaultFn marker/
    );
  });

  it('rejects an options.runtime callback with no matching marker (and unknown columns)', () => {
    const graph = tableNode('t', {c: colNode({fn: 'uuid'}, {$defaultFn: lit(true)})});
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
    // Config keys and modifier calls share ONE authored object, so at runtime
    // the bridge cannot tell a typo'd modifier from a config key it has never
    // heard of; the per-builder *ColMods bags reject that at compile time. What
    // it must NOT do is call the unknown name as a method on the column.
    const fake = makeFake();
    const graph = tableNode('t', {
      c: colNode({fn: 'uuid', config: obj({frobnicate: lit(true)})}, {frobnicate: lit(true), notNull: lit(true)}),
    });
    const slim = buildRtTableFromGraph(graph, fake.buildTable);
    materializeRtTable(slim, fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'uuid', {frobnicate: true}],
      ['ns.uuid', 'notNull'],
      ['buildTable', 't', ['c']],
    ]);
  });

  it('rejects a modifier value that is neither a flag nor an args tuple', () => {
    const graph = tableNode('t', {c: colNode({fn: 'uuid'}, {default: lit(21)})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/neither a flag nor an args tuple/);
  });

  it('rejects a non-literal config member', () => {
    const fnTyped: ReflectedNode = {id: id(), kind: 17};
    const graph = tableNode('t', {c: colNode({fn: 'varchar', config: obj({length: fnTyped})})});
    expect(() => buildRtTableFromGraph(graph, makeFake().buildTable)).toThrowError(/not a literal type/);
  });
});
