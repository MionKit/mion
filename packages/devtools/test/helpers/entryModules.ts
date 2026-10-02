// The entry-module evaluator and the RunType instantiation the inline
// harnesses use, kept DEPENDENCY-FREE on purpose: no vitest, no resolver
// client, no node builtins. The run-types security fuzz lanes run compiled
// decoders inside a heap-capped worker thread that Node loads through native
// type stripping, and that loader cannot take the parameter properties /
// enums the rest of the devtools graph uses — so this file must stay plain,
// erasable TypeScript (type-only imports, no enums, no parameter properties).
// inline.ts re-exports everything here.

import type {RunType} from '../../src/core/protocol.ts';

// Slots: 0 kind/family tag, 1 deps thunk (undefined when dep-less, never self), 2 ini fn, 3 cache key, 4+ args.
// Mirrors the layout contract in packages/run-types/src/runtypes/entryTuple.ts.
export type EntryTuple = readonly unknown[];

const IMPORT_LINE = /^import \{(__rt_[A-Za-z0-9_$]+)\} from 'rtmod:\/(.+)\.js';\n/gm;
const EXPORT_LINE = /^export const (__rt_[A-Za-z0-9_$]+)=/gm;
const BINDING_PREFIX = '__rt_';

// evalEntryModules keys each export by its binding minus `__rt_`, and a one-export module also by its basename.
// Imports are LIVE: a `with` proxy resolves them at access time, so recursive type graphs behave as real ESM cycles.
// The factory `code` strings are never rewritten.
export function evalEntryModules(modules: Record<string, string>): Record<string, EntryTuple> {
  const tuples: Record<string, EntryTuple> = {};
  const byBinding: Record<string, EntryTuple> = {};
  for (const [basename, source] of Object.entries(modules)) {
    const imported = new Set<string>();
    const stripped = source.replace(IMPORT_LINE, (_whole, binding: string) => {
      imported.add(binding);
      return '';
    });
    const exportNames = [...stripped.matchAll(EXPORT_LINE)].map((match) => match[1]);
    if (exportNames.length === 0) throw new Error(`evalEntryModules: no entry export in ${basename}:\n${source}`);
    const body = stripped.replace(EXPORT_LINE, (_whole, name: string) => `const ${name}=`);
    const scope = new Proxy(
      {},
      {
        has: (_target, prop) => typeof prop === 'string' && imported.has(prop),
        get: (_target, prop) => byBinding[prop as string],
      }
    );
    // Sloppy-mode `new Function` body so `with` is legal; entry modules are
    // emitted without a 'use strict' prologue on purpose.
    const factory = new Function('__scope', `with(__scope){${body}\nreturn {${exportNames.join(',')}};}`);
    const exported = factory(scope) as Record<string, EntryTuple>;
    for (const name of exportNames) {
      byBinding[name] = exported[name];
      tuples[name.slice(BINDING_PREFIX.length)] = exported[name];
    }
    if (exportNames.length === 1) tuples[basename] = exported[exportNames[0]];
  }
  return tuples;
}

// instantiateRunTypes builds the RunType records from every row of the
// runtype data-bundle tuple (slot 0 === 4; headless rows in slot 4), wires each
// node's ref slots from the parallel `rels` array (slot 5, by row index), and
// runs any residual footer initializer (slot 2 — the rare expression-specials)
// against a stub registry — the same two-phase shape the marker package's
// initFromTuple performs against the real rtUtils. Facade tuples (slot 0 === 5)
// carry no data and are skipped. Returns the flat {[id]: RunType} table.
export function instantiateRunTypes(tuples: Record<string, EntryTuple>): Record<string, RunType> {
  const registered: Record<string, RunType> = {};
  const stub = {
    useRunType(id: string): RunType {
      const entry = registered[id];
      if (!entry) throw new Error(`stub useRunType: no entry for ${id}`);
      return entry;
    },
  };
  const bundles: EntryTuple[] = [];
  for (const tuple of Object.values(tuples)) {
    if (!Array.isArray(tuple) || tuple[0] !== 4) continue;
    for (const row of (tuple[4] ?? []) as readonly (readonly unknown[])[]) {
      registered[row[0] as string] = buildRunTypeFromRow(row);
    }
    bundles.push(tuple);
  }
  for (const tuple of bundles) {
    wireBundleRels(tuple, registered);
    if (typeof tuple[2] === 'function') (tuple[2] as (rtu: typeof stub) => void)(stub);
  }
  return registered;
}

// Relation-slot order + single/array split — duplicated from
// RUN_TYPE_REL_KEYS / RUN_TYPE_REL_IS_ARRAY in
// packages/run-types/src/runtypes/entryTuple.ts (kept local so this test
// helper doesn't drag the whole mion type graph into the devtools
// typecheck). Mirrors Go's runtype.renderRelations; the tests that walk the
// reflected graph catch any drift.
const REL_KEYS = [
  'child',
  'children',
  'index',
  'return',
  'indexType',
  'parameters',
  'safeUnionChildren',
  'unionDiscriminators',
  'typeMeta',
  'typeArguments',
  'arguments',
  'extendsArguments',
  'implements',
  'extends',
] as const;
const REL_IS_ARRAY = [false, true, false, false, false, true, true, true, true, true, true, true, true, true] as const;

// wireBundleRels mirrors entryTuple.ts's wireBundleRelations: patch each node's
// ref slots from the parallel `rels` array (slot 5) by ROW INDEX. A number is a
// row index, a string a foreign id (registry lookup), anything else an inline
// non-ref RunType. Runs after every row is registered, so cycles resolve.
function wireBundleRels(tuple: EntryTuple, registered: Record<string, RunType>): void {
  const rows = (tuple[4] ?? []) as readonly (readonly unknown[])[];
  const rels = (tuple[5] ?? []) as readonly (readonly unknown[] | undefined)[];
  const byIndex = rows.map((row) => registered[row[0] as string]);
  const resolve = (rel: unknown): unknown =>
    typeof rel === 'number' ? byIndex[rel] : typeof rel === 'string' ? registered[rel] : rel;
  for (let i = 0; i < rels.length; i++) {
    const relRow = rels[i];
    if (!relRow) continue;
    const target = byIndex[i] as unknown as Record<string, unknown>;
    if (!target) continue;
    for (let slot = 0; slot < REL_KEYS.length; slot++) {
      const value = relRow[slot];
      if (value === undefined) continue;
      target[REL_KEYS[slot]] = REL_IS_ARRAY[slot] ? (value as readonly unknown[]).map(resolve) : resolve(value);
    }
  }
}

// buildRunTypeFromRow mirrors the 20-slot row construction in
// packages/run-types/src/runtypes/entryTuple.ts (registerRunTypeBundle):
// every ref-bearing slot starts undefined and is patched by the ini pass.
function buildRunTypeFromRow(row: readonly unknown[]): RunType {
  const arg = (offset: number) => row[offset];
  return {
    id: arg(0),
    kind: arg(1),
    subKind: arg(2),
    typeName: arg(3),
    name: arg(4),
    literal: arg(5),
    optional: arg(6),
    readonly: arg(7),
    isAbstract: arg(8),
    isStatic: arg(9),
    visibility: arg(10),
    isSafeName: arg(11),
    position: arg(12),
    isCircular: arg(13),
    flags: arg(14),
    description: arg(15),
    defaultVal: arg(16),
    enumVal: arg(17),
    values: arg(18),
    notSupported: arg(19),
    child: undefined,
    index: undefined,
    return: undefined,
    indexType: undefined,
    parameters: undefined,
    children: undefined,
    safeUnionChildren: undefined,
    unionDiscriminators: undefined,
    typeMeta: undefined,
    typeArguments: undefined,
    arguments: undefined,
    extendsArguments: undefined,
    implements: undefined,
    extends: undefined,
    classType: undefined,
  } as unknown as RunType;
}
