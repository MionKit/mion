import {beforeAll, describe, expect, it} from 'vitest';
import {RunTypeKind} from '@ts-runtypes/core';
import {
  factoryCall,
  factoryImport,
  generatedCache,
  mock,
  mockInvalid,
  run,
  setResolver,
  transformedSource,
  versions,
  type RunTypeTreeNode,
} from '../../../../container/website/app/playground/index.ts';
import {assetsBuilt, installSidecarHook, loadNodeResolver} from './nodeResolver.ts';

// End-to-end engine tests: each resolves <factory><MyType>() via the real WASM
// resolver, links the emitted entry modules in-process, hands the tuple to the
// public ts-runtypes factory, and runs the live function - the same pipeline the
// browser playground drives. They need the host-built WASM assets in
// .cache/rt-wasm/; run
//   node container/website/scripts/build-playground.mjs
// first (pnpm rtx website dev|build does this automatically). Without the
// assets, they skip.

const TYPE = `type MyType = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};`;

const VALID = {id: 1, name: 'ada', tags: ['math', 'code'], active: true};
const INVALID = {id: 'not-a-number', name: 'ada', tags: []};

// The surrounding-code templating the type column shows around the user's type
// (header import + footer call). Pure string helpers - no resolver needed.
describe('surrounding-code templating', () => {
  it('factoryImport renders the ts-runtypes import line', () => {
    expect(factoryImport('createValidateFn')).toBe("import { createValidateFn } from '@ts-runtypes/core';");
    expect(factoryImport('createJsonEncoderFn')).toBe("import { createJsonEncoderFn } from '@ts-runtypes/core';");
  });

  it('factoryCall renders the type-first call, appending the injected arg when given', () => {
    expect(factoryCall('createValidateFn', 'validate', 'type')).toBe('const validate = createValidateFn<MyType>();');
    expect(factoryCall('createValidateFn', 'validate', 'type', '__rt_a1b_Xk7')).toBe(
      'const validate = createValidateFn<MyType>(__rt_a1b_Xk7);'
    );
  });

  it('factoryCall renders the value-first (schema) call, injecting after the schema', () => {
    expect(factoryCall('createValidateFn', 'validate', 'schema')).toBe('const validate = createValidateFn(MyType);');
    expect(factoryCall('createValidateFn', 'validate', 'schema', '__rt_a1b_Xk7')).toBe(
      'const validate = createValidateFn(MyType, __rt_a1b_Xk7);'
    );
  });
});

const ready = assetsBuilt();
if (!ready) {
  // eslint-disable-next-line no-console
  console.warn(
    '[playground] WASM assets not built - skipping engine tests. Run: node container/website/scripts/build-playground.mjs'
  );
}
const describeIf = ready ? describe : describe.skip;

describeIf('playground engine (WASM, live execution)', () => {
  beforeAll(async () => {
    setResolver(await loadNodeResolver());
  });

  it('reports the resolver versions', async () => {
    const v = await versions();
    expect(typeof v.version).toBe('string');
    expect(typeof v.tsgo).toBe('string');
  });

  it('createValidateFn accepts a matching value and rejects a mismatch', async () => {
    expect(await run('validate', TYPE, VALID)).toMatchObject({kind: 'predicate', value: true});
    expect(await run('validate', TYPE, INVALID)).toMatchObject({kind: 'predicate', value: false});
  });

  it('createGetValidationErrorsFn reports errors only for a mismatch', async () => {
    const good = await run('errors', TYPE, VALID);
    const bad = await run('errors', TYPE, INVALID);
    if (good.kind !== 'errors' || bad.kind !== 'errors') throw new Error('expected errors result');
    expect(good.value).toHaveLength(0);
    expect(bad.value.length).toBeGreaterThan(0);
  });

  it('createJsonEncoderFn/Decoder round-trips a value', async () => {
    const res = await run('jsonDecoderStrip', TYPE, {...VALID});
    if (res.kind !== 'jsonRoundtrip') throw new Error('expected jsonRoundtrip result');
    expect(res.decoded).toMatchObject({id: 1, name: 'ada'});
  });

  // The JSON strategy variants ride the comptime `{strategy: '…'}` literal the
  // engine appends at the call site — so each must resolve to a DISTINCT compiled
  // function. clone/direct strip undeclared keys; mutate keeps them on the wire.
  it('json encode strategies differ (clone/direct strip, mutate preserves unknown keys)', async () => {
    const messy = {id: 1, name: 'ada', tags: ['x'], active: true, secret: 'shh'};
    const clone = await run('jsonEncoderClone', TYPE, {...messy});
    const mutate = await run('jsonEncoderMutate', TYPE, {...messy});
    const direct = await run('jsonEncoderDirect', TYPE, {...messy});
    if (clone.kind !== 'encode' || mutate.kind !== 'encode' || direct.kind !== 'encode') {
      throw new Error('expected encode result');
    }
    // The encoders return a serialized JSON string (not an object).
    expect(typeof clone.value).toBe('string');
    expect(JSON.parse(clone.value as string)).not.toHaveProperty('secret');
    expect(JSON.parse(direct.value as string)).not.toHaveProperty('secret');
    expect(JSON.parse(mutate.value as string)).toHaveProperty('secret', 'shh');
  });

  it('json compact encode emits a positional-array wire (no key names)', async () => {
    const res = await run('jsonEncoderCompact', TYPE, {...VALID});
    if (res.kind !== 'encode') throw new Error('expected encode result');
    expect(Array.isArray(JSON.parse(res.value as string))).toBe(true);
  });

  it('json decode strategies differ (preserve keeps unknown keys, strip nulls them out)', async () => {
    const messy = {id: 1, name: 'ada', tags: ['x'], active: true, secret: 'shh'};
    const preserve = await run('jsonDecoderPreserve', TYPE, {...messy});
    const strip = await run('jsonDecoderStrip', TYPE, {...messy});
    if (preserve.kind !== 'jsonRoundtrip' || strip.kind !== 'jsonRoundtrip') {
      throw new Error('expected jsonRoundtrip result');
    }
    // preserve passes the undeclared key through; strip (the default) sets it to
    // undefined (so it drops on re-serialization) — a clear behavioral split.
    expect(preserve.decoded).toHaveProperty('secret', 'shh');
    expect((strip.decoded as Record<string, unknown>).secret).toBeUndefined();
    expect(preserve.decoded).toMatchObject({id: 1, name: 'ada'});
    expect(strip.decoded).toMatchObject({id: 1, name: 'ada'});
  });

  it('createBinaryEncoderFn/Decoder round-trips a value', async () => {
    const res = await run('binaryDecoder', TYPE, VALID);
    if (res.kind !== 'binaryRoundtrip') throw new Error('expected binaryRoundtrip result');
    expect(res.byteLength).toBeGreaterThan(0);
    expect(res.decoded).toMatchObject({id: 1, name: 'ada'});
  });

  it('getRunType resolves the RunType graph', async () => {
    const res = await run('graph', TYPE);
    if (res.kind !== 'graph') throw new Error('expected graph result');
    expect(res.rootId).toBeTruthy();
    expect(res.runTypes.length).toBeGreaterThan(0);
    // The root is the LIVE reflected node, not a row of the flat wire dump.
    expect(res.root?.id).toBe(res.rootId);
    expect(res.root?.children).toBeInstanceOf(Array);
  });

  // Regression: the graph op used to hand back the resolver's flat wire dump,
  // whose child slots are `{id, kind: -1}` ref sentinels, making the runtime look
  // like a table of ids to look up. It is a knotted object graph, and the
  // playground now shows it as one — descending from the root, children inlined.
  it('graph output descends from the root with the CHILD NODES inlined, never refs', async () => {
    const res = await run('graph', TYPE);
    if (res.kind !== 'graph' || !res.tree) throw new Error('expected graph result');

    // No ref sentinel survives anywhere in the projection.
    expect(JSON.stringify(res.tree)).not.toContain('"kind":-1');

    expect(res.tree.id).toBe(res.rootId);
    const members = res.tree.children as RunTypeTreeNode[];
    expect(members.map((member) => member.name)).toEqual(['id', 'name', 'tags', 'active']);

    // Each member carries its actual child node, so reading its kind needs no
    // second lookup by id.
    const byName = (name: string) => members.find((member) => member.name === name) as RunTypeTreeNode;
    const nameChild = byName('name').child as RunTypeTreeNode;
    expect(nameChild.kind).toBe(RunTypeKind.string);
    // `family` is build-time-only classification (protocol.Family, for the Go
    // compiler's inline-vs-call decision) — the runtime node never carries it,
    // so it is absent here where the flat wire dump showed it.
    expect(nameChild.family).toBeUndefined();

    // Two hops: `tags: string[]` → array → element, all inlined.
    const element = (byName('tags').child as RunTypeTreeNode).child as RunTypeTreeNode;
    expect(element.kind).toBe(RunTypeKind.string);
    // Structural sharing prints in full at each use (same node, inlined twice).
    expect(element).toEqual(nameChild);
  });

  it('graph output marks a genuine cycle as the only reference', async () => {
    const recursive = `type MyType = { id: number; children: MyType[] };`;
    const res = await run('graph', recursive);
    if (res.kind !== 'graph' || !res.tree) throw new Error('expected graph result');

    const members = res.tree.children as RunTypeTreeNode[];
    const children = members.find((member) => member.name === 'children') as RunTypeTreeNode;
    // `children: MyType[]` → array → element, which is the root again: a real
    // reference cycle, so it renders as a marker rather than inlining forever.
    const element = (children.child as RunTypeTreeNode).child as RunTypeTreeNode;
    expect(element.circular).toBe(true);
    expect(element.id).toBe(res.rootId);
    // The back-edge is the ONLY marker — every other slot is inlined.
    expect(JSON.stringify(res.tree).match(/"circular":true/g)).toHaveLength(1);
  });

  it('generatedCache returns the runtype cache module for getRunType', async () => {
    const mods = await generatedCache('getRunType', TYPE);
    // Reflection is a single runtype data bundle module (compact cache, not expanded JSON).
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toMatch(/^rtmod:\/.+\.js$/);
    expect(mods[0].code).toMatch(/export const __rt_/);
  });

  it('createMockDataFn generates a value that validates', async () => {
    const m = await mock(TYPE);
    expect(m.value).toBeTypeOf('object');
    const ok = await run('validate', TYPE, m.value);
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
  });

  // The WASM engine has no node sidecar; the __tsRunTypesJsEngine host hook
  // (the sidecar bundle's IIFE build, loaded by the browser playground and by
  // loadNodeResolver here) IS its JS engine. A pattern with NO declared
  // mockSamples only mocks if generation ran through that hook — pinning the
  // browser-parity lane end-to-end under the real WASM module.
  it('sample-less pattern mockSamples generate in WASM via the sidecar hook', async () => {
    expect(installSidecarHook()).toBe(true);
    const patternType = `import type * as TF from '@ts-runtypes/core/formats';
type MyType = { code: TF.String<{pattern: {source: '^[a-z]{3}-[0-9]{2}$'; flags: ''}}> };`;
    const m = await mock(patternType);
    const value = m.value as {code: string};
    expect(value.code).toMatch(/^[a-z]{3}-[0-9]{2}$/);
    const ok = await run('validate', patternType, m.value);
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
  });

  it('mockInvalid (negative generator) produces values that fail validation', async () => {
    for (let i = 0; i < 8; i++) {
      const m = await mockInvalid(TYPE);
      const res = await run('validate', TYPE, m.value);
      if (res.kind !== 'predicate') throw new Error('expected predicate result');
      expect(res.value).toBe(false);
    }
  });

  it('mockInvalid invalidLeafProbability biases leaf (1) vs root (0) corruption', async () => {
    // invalidLeafProbability=1 corrupts a deep leaf, so the root object survives.
    const leaf = await mockInvalid(TYPE, undefined, 'type', 1);
    expect(leaf.value).toBeTypeOf('object');
    const leafRes = await run('validate', TYPE, leaf.value);
    if (leafRes.kind !== 'predicate') throw new Error('expected predicate result');
    expect(leafRes.value).toBe(false);

    // invalidLeafProbability=0 replaces the whole root with a wrong-typed value.
    const root = await mockInvalid(TYPE, undefined, 'type', 0);
    expect(root.value).not.toBeTypeOf('object');
    const rootRes = await run('validate', TYPE, root.value);
    if (rootRes.kind !== 'predicate') throw new Error('expected predicate result');
    expect(rootRes.value).toBe(false);
  });

  it('mockInvalid works in the value-first schema form (mode: schema)', async () => {
    const schema = `import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';

const MyType = RT.object({
      id: TF.number(),
      name: TF.string(),
      tags: RT.array(TF.string()),
      active: RT.boolean(),
    });`;
    const m = await mockInvalid(schema, undefined, 'schema');
    const res = await run('validate', schema, m.value, undefined, 'schema');
    if (res.kind !== 'predicate') throw new Error('expected predicate result');
    expect(res.value).toBe(false);
  });

  it('generated cache ships a live factory function (emit mode: functions), not a code string', async () => {
    const mods = await generatedCache('createValidateFn', TYPE);
    // A single function type = one named cache module.
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toMatch(/^rtmod:\/.+\.js$/);
    // The WASM resolver runs EmitFunctions (cmd/ts-runtypes-wasm/main.go), so the
    // factory rides as a real `function g_…(utl){…}` in the tuple, not an escaped
    // code string - clearer in the "Generated Cache" view.
    expect(mods[0].code).toMatch(/export const __rt_/);
    expect(mods[0].code).toMatch(/function g_[A-Za-z0-9_]+\(utl\)/);
  });

  it('generated cache returns one named module per family (codecs span several)', async () => {
    // A JSON codec's composite looks its primitives up at runtime, so the resolver
    // emits several sibling modules that import each other. The cache view keeps
    // them as separate named sections (each labeled with its `rtmod:/…` name)
    // rather than a single blob.
    const mods = await generatedCache('createJsonDecoderFn', TYPE);
    expect(mods.length).toBeGreaterThan(1);
    for (const m of mods) {
      expect(m.name).toMatch(/^rtmod:\/.+\.js$/);
      expect(m.code).toMatch(/export const __rt_/);
    }
  });

  it('generated cache inlines a NAMED nested type into one self-contained function', async () => {
    // Regression guard for the playground resolver's single-cache config
    // (cmd/ts-runtypes-wasm/main.go: InlineMode allInternal + ModuleMode allSingle).
    // A NAMED nested type is the discriminating case: under the resolver's DEFAULT
    // inline mode a named alias becomes a SEPARATE cache entry and the root validator
    // delegates to it (`...fn(v.outer)`), so the named member's leaf checks land in a
    // sibling module. allInternal inlines it into the one validate module. DO NOT
    // relax this to an unnamed `{ ... }` object — those inline under BOTH modes, so
    // the test would silently stop catching the regression.
    const named = `type Inner = { innerField: string; innerNum: number };
type MyType = { outer: Inner };`;
    const mods = await generatedCache('createValidateFn', named);
    // validate is a single family, so one module carrying the whole inlined function.
    expect(mods).toHaveLength(1);
    const code = mods[0].code;
    // The named member's leaf checks appear INLINE in the single cached function...
    expect(code).toContain('innerField');
    expect(code).toContain('innerNum');
    // ...and it is self-contained — no delegation to an external sibling entry.
    expect(code).not.toMatch(/\.fn\(/);
  });

  it('transformedSource is the real transform: injected import + a clean __rt_ arg (type mode)', async () => {
    const code = await transformedSource('createValidateFn', 'validate', TYPE);
    // The injected virtual-module import the build plugin adds for the entry tuple.
    expect(code).toMatch(/^import \{__rt_[A-Za-z0-9_]+} from 'rtmod:\/.+';/m);
    // The call carries the injected id as a clean trailing arg (slot-filling
    // `undefined` padding stripped) - no `(undefined, __rt_…)`.
    expect(code).toMatch(/const validate = createValidateFn<MyType>\(__rt_[A-Za-z0-9_]+\);/);
    expect(code).not.toContain('undefined, __rt_');
    // The user's import + type body survive verbatim.
    expect(code).toContain("import { createValidateFn } from '@ts-runtypes/core';");
    expect(code).toContain('id: number;');
  });

  it('transformedSource cleanup is scoped to the call - user code with (undefined, __rt_x) survives', async () => {
    // A type body containing the exact `(undefined, __rt_…)` pattern the padding
    // cleanup targets - it must NOT be collapsed (regression guard for the fix
    // that scopes the cleanup to the factory call line only).
    const tricky = `type MyType = {value: number};\n// example: someHelper(undefined, __rt_fake123)`;
    const code = await transformedSource('createValidateFn', 'validate', tricky);
    // The user's line is preserved verbatim.
    expect(code).toContain('someHelper(undefined, __rt_fake123)');
    // The real factory call still gets the clean injected arg (no undefined padding).
    expect(code).toMatch(/const validate = createValidateFn<MyType>\(__rt_[A-Za-z0-9_]+\);/);
  });

  it('transformedSource injects the id after the schema in the value-first form (mode: schema)', async () => {
    const schema = `import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';
const MyType = RT.object({id: TF.number(), name: TF.string()});`;
    const code = await transformedSource('createJsonEncoderFn', 'toJson', schema, undefined, 'schema');
    expect(code).toMatch(/^import \{__rt_[A-Za-z0-9_]+} from 'rtmod:\/.+';/m);
    expect(code).toMatch(/const toJson = createJsonEncoderFn\(MyType, __rt_[A-Za-z0-9_]+\);/);
  });

  it('handles a circular (recursive) type in both type and schema forms', async () => {
    const typeForm = `type MyType = { id: number; name: string; children: MyType[] };`;
    const schemaForm = `import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';
const MyType = RT.circular(RT.object({ id: TF.number(), name: TF.string(), children: RT.array(RT.self()) }));`;
    const tree = {id: 1, name: 'root', children: [{id: 2, name: 'leaf', children: []}]};
    const badNested = {id: 1, name: 'root', children: [{id: 'nope', name: 'leaf', children: []}]};

    for (const [code, mode] of [
      [typeForm, 'type'],
      [schemaForm, 'schema'],
    ] as const) {
      const graph = await run('graph', code, undefined, undefined, mode);
      if (graph.kind !== 'graph') throw new Error('expected graph result');
      expect(graph.runTypes.length).toBeGreaterThan(0);

      const ok = await run('validate', code, tree, undefined, mode);
      const ko = await run('validate', code, badNested, undefined, mode);
      if (ok.kind !== 'predicate' || ko.kind !== 'predicate') throw new Error('expected predicate result');
      expect(ok.value).toBe(true); // valid tree
      expect(ko.value).toBe(false); // recursion reaches the bad nested id
    }
  });

  it('runs the value-first schema form (mode: schema)', async () => {
    const schema = `import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';

const MyType = RT.object({
      id: TF.number(),
      name: TF.string(),
      tags: RT.array(TF.string()),
      active: RT.boolean(),
    });`;
    const ok = await run('validate', schema, VALID, undefined, 'schema');
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
    const bad = await run('validate', schema, INVALID, undefined, 'schema');
    if (bad.kind !== 'predicate') throw new Error('expected predicate result');
    expect(bad.value).toBe(false);
  });
});
