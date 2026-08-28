// Runtime end-to-end for the unused-builder-const elision, through the REAL
// vitest plugin (this file is transformed by ts-runtypes-devtools like any
// consumer file):
//
//   - a builder const used only via `InferType<typeof …>` registers NO runtype
//     graph at runtime, the module still executes (the builder returns its
//     harmless carrier), and the static-form validator works;
//   - a builder const handed to createValidateFn registers no graph EITHER (the
//     factory resolves its own injected entry tuple and never reads the schema),
//     and its validator works the same — including for a recursive schema, where
//     the runtime would otherwise have substituted the live node's own id;
//   - a builder const the id-lookup escape reads (`getRunType`) keeps its graph
//     registered, and so does one handed to `createMockDataFn`, whose marker is
//     InjectRunTypeId and which needs the graph at runtime.
//
// The third-party-wrapper counter-case lives in ts-runtypes-devtools' own
// elision test: the marker-package gate resolves a symbol's package by walking up
// to the nearest package.json, so a wrapper declared here would count as one of
// ours and be exempt. Only a real consumer file can pin that.
//
// Every lane uses a DIFFERENT shape on purpose: equivalent shapes share one
// structural id, so the kept lane registering its graph must not mask the elided
// lanes' absence assertions.
//
// (Marker coverage rule: both getRunTypeId call shapes with a convergence
// assert, on a further unrelated shape.)

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createMockDataFn,
  createStandardSchema,
  createJsonSchemaFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  getRunType,
  getRunTypeId,
  getRTUtils,
  getRTFnCaches,
  type InferType,
} from '@ts-runtypes/core';
import {object, array, circular, self} from '@ts-runtypes/core/builders';
import {string, number} from '@ts-runtypes/core/formats';
import {FN_HASH_LEN} from '../../src/runtypes/entryTuple.ts';

// Static-form lane: the const's only reference is the type query below.
const elidedRT = object({elidedProp: string()});
type ElidedShape = InferType<typeof elidedRT>;
const isElidedShape = createValidateFn<ElidedShape>();

// Factory-argument lane: the const IS the createValidateFn argument, and that is
// its only reference.
const factoryArgRT = object({factoryArgProp: string()});
const isFactoryArgShape = createValidateFn(factoryArgRT);

// Recursive factory-argument lane: the shape where the runtime's live-`.id`
// substitution was documented to matter, so the elided spelling must still land
// on a working validator.
const circularArgRT = circular(object({circularProp: number(), children: array(self())}));
const isCircularArgShape = createValidateFn(circularArgRT);

// Kept lane: the id-lookup escape READS the graph, so this const keeps it.
const keptRT = object({keptProp: number()});
const isKeptShape = createValidateFn(keptRT);
const keptNode = getRunType(keptRT);

// The OTHER factory families a schema can be handed to, each on its own shape.
// createMockDataFn is the odd one out: it carries an InjectRunTypeId marker (not
// InjectTypeFnArgs) and REQUIRES the graph at runtime — `utils.getRunType()` or
// it throws — so it is not a type-fn factory and its argument stays a value use.
const mockRT = object({mockProp: string()});
const generateMock = createMockDataFn(mockRT);
const standardRT = object({standardProp: number()});
const standard = createStandardSchema(standardRT);
const jsonSchemaRT = object({jsonSchemaProp: string()});
const jsonSchemaDoc = createJsonSchemaFn(jsonSchemaRT);
const binaryRT = object({binaryProp: number()});
const toBinary = createBinaryEncoderFn(binaryRT);
const fromBinary = createBinaryDecoderFn(binaryRT);

// Type ids are recovered from the registered val entries (`<hash>_<typeId>`)
// rather than getRunTypeId — reflecting the shapes here would itself register
// the very graphs the assertions are about.
function valEntryTypeIds(): string[] {
  const {rtFnsCache} = getRTFnCaches();
  const ids: string[] = [];
  for (const key of Object.keys(rtFnsCache)) {
    const entry = rtFnsCache[key];
    if (entry && entry.familyTag === 'val') ids.push(key.slice(FN_HASH_LEN + 1));
  }
  return ids;
}

// NOTE: `elidedRT`, `factoryArgRT` and `circularArgRT` are deliberately
// referenced NOWHERE below — any value reference (even
// `expect(elidedRT).toBeTruthy()`) would itself count as a use and keep the
// graph. Their harmlessness at runtime is proven indirectly: this module
// executed (each builder call ran and returned its carrier without throwing), or
// no test in this file could run at all.

describe('unused-builder-const elision (real plugin pipeline)', () => {
  it('static form validates correctly with NO runtype graph registered', () => {
    expect(isElidedShape({elidedProp: 'x'})).toBe(true);
    expect(isElidedShape({elidedProp: 1})).toBe(false);
    expect(isElidedShape(undefined)).toBe(false);
    // Five val entries: the static, factory-argument, recursive and kept lanes,
    // plus createStandardSchema's own 'val' family. Only the kept lane's type has
    // a graph (the id lookup reads it) among them — the mock lane keeps a graph
    // too but has no val entry at all — so four of the five are graph-less.
    const ids = valEntryTypeIds();
    expect(ids.length).toBe(5);
    const graphless = ids.filter((id) => getRTUtils().getRunType(id) === undefined);
    expect(graphless.length).toBe(4);
  });

  it('a schema handed to createValidateFn validates with NO graph registered', () => {
    expect(isFactoryArgShape({factoryArgProp: 'x'})).toBe(true);
    expect(isFactoryArgShape({factoryArgProp: 1})).toBe(false);
    expect(isFactoryArgShape(undefined)).toBe(false);
  });

  it('a recursive schema handed to createValidateFn still validates the whole tree', () => {
    const tree = {circularProp: 1, children: [{circularProp: 2, children: []}]};
    expect(isCircularArgShape(tree)).toBe(true);
    expect(isCircularArgShape({circularProp: 1, children: [{circularProp: 'nope', children: []}]})).toBe(false);
    expect(isCircularArgShape(undefined)).toBe(false);
  });

  it('the id-lookup escape keeps its runtype graph registered', () => {
    expect(isKeptShape({keptProp: 2})).toBe(true);
    expect(isKeptShape({keptProp: 'nope'})).toBe(false);
    const ids = valEntryTypeIds();
    const registered = ids.filter((id) => getRTUtils().getRunType(id) !== undefined);
    expect(registered.length).toBe(1);
    // And the const the lookup read IS the live node for that id.
    expect((keptRT as {id?: string}).id).toBe(registered[0]);
    expect(keptNode.id).toBe(registered[0]);
  });

  // Every other family a schema can be handed to. Each reads at most the
  // schema's `.id` before resolving its own injected entry tuple, so the elision
  // must not change what they build.
  it('the remaining factory families work with a handed-over schema', () => {
    expect(standard['~standard'].validate({standardProp: 1})).toBeTruthy();
    expect(jsonSchemaDoc()).toBeTruthy();
    expect(fromBinary(toBinary({binaryProp: 7}))).toEqual({binaryProp: 7});
  });

  // createMockDataFn needs the graph, and keeps it: its InjectRunTypeId marker
  // is not the type-fn factory marker, so its argument is still a value use.
  it('createMockDataFn keeps the graph it needs and still generates', () => {
    expect(generateMock()).toHaveProperty('mockProp');
    const mockId = (mockRT as {id?: string}).id;
    expect(mockId, 'the mock schema must stay a live node').toBeTypeOf('string');
    expect(getRTUtils().getRunType(mockId as string)).toBeDefined();
  });

  it('getRunTypeId static and reflect forms converge (marker coverage pair)', () => {
    interface UnrelatedDto {
      label: string;
    }
    const staticId = getRunTypeId<UnrelatedDto>();
    const value: UnrelatedDto = {label: 'x'};
    expect(getRunTypeId(value)).toBe(staticId);
  });
});
