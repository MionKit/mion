// Public surface for the mock-value generator — separated from
// `createRTFunctions.ts` so bundlers can drop the whole mock subtree from
// bundles that don't reference `createMockDataFn`. Mock has no per-type RT
// cache; the walker reads `runTypesCache` and generates values at runtime.

import {getRTUtils, isRunTypeValue} from '../runtypes/rtUtils.ts';
import {entryTupleKey, initFromTuple, isEntryTuple} from '../runtypes/entryTuple.ts';
// Side-effect imports: register the per-kind format mock fns. They must ride
// the mock subtree itself — a consumer whose only @mionjs/run-types/formats imports
// sit in type positions has them elided, and an empty registry silently mocks
// format-branded nodes as kind-default values that fail their own validators.
import './mockStringFormat.ts';
import './mockNumberFormat.ts';
import './mockBigIntFormat.ts';
import type {RunType} from '../runtypes/types.ts';
import type {CompTimeHints, InjectRunTypeId} from '../index.ts';
import {mockRunType} from './mockType.ts';
import {mockRunTypeInvalid} from './mockInvalid.ts';
import {mockRunTypeOversized} from './mockOversized.ts';
import {applyInBoundsSizing} from './binarySize.ts';
import {MockRandom, nativeMockRandom} from './mockRandom.ts';
import {defaultMockOptions} from './constants.mock.ts';
import type {MockDataNode, MockOptions, MockTypeFn, RunTypeMockOptions, DeepPartial} from './mockTypes.ts';

/** Returns a mock-value generator for `T`. Each call produces a fresh value
 *  that passes `validate<T>`. Options merge: call < factory < defaults. Accepts
 *  either a value-first schema (`createMockDataFn(rt)`) or the value/static form.
 *  Throws if the Vite plugin isn't active (no `id` injected).
 *
 *  The options slot is `CompTimeHints`: the build READS a literal
 *  `mock.seed` from it (making generated pattern mockSample pools
 *  reproducible across builds) but never validates it — a dynamic options
 *  bag stays legal and simply keeps the build-time knobs invisible. **/
export function createMockDataFn<T>(
  runType: RunType<T>,
  options?: CompTimeHints<RunTypeMockOptions<T>>,
  id?: InjectRunTypeId<T>
): MockTypeFn<T>;
export function createMockDataFn<T>(
  val?: T,
  options?: CompTimeHints<RunTypeMockOptions<T>>,
  id?: InjectRunTypeId<T>
): MockTypeFn<T>;
export function createMockDataFn<T>(
  valOrSchema?: T | RunType<T>,
  options?: RunTypeMockOptions<T>,
  id?: InjectRunTypeId<T>
): MockTypeFn<T> {
  let injectedId: string | undefined = id;
  if (isEntryTuple(id)) {
    // The plugin injects the runtype's entry-module tuple — register the
    // type graph and recover the id string.
    initFromTuple(id);
    injectedId = entryTupleKey(id);
  }
  const effectiveId = isRunTypeValue(valOrSchema) ? valOrSchema.id : injectedId;
  if (effectiveId === undefined) {
    throw new Error(
      'createMockDataFn(): no id injected. @mionjs/devtools must be active for createMockDataFn to resolve the runtype graph.'
    );
  }
  const utils = getRTUtils();
  const runType = utils.getRunType(effectiveId);
  if (!runType) {
    throw new Error(
      `createMockDataFn(): no RunType entry for "${effectiveId}" in rtUtils. The build pipeline didn't emit a cache entry for that runtype.`
    );
  }
  const factoryOpts = mergeMockOptions(undefined, options as DeepPartial<RunTypeMockOptions<unknown>> | undefined);
  return ((callOpts) => {
    const merged = mergeMockOptions(factoryOpts, callOpts as DeepPartial<RunTypeMockOptions<unknown>> | undefined);
    const mockOpts = merged.mock as MockOptions;
    // One random source per generation, carried on the options bag so it threads
    // through the whole walk (and the deferred Promise resolver, which closes
    // over `merged`). A fresh seeded instance each call ⇒ the same seed always
    // reproduces the same value; no seed reuses the stateless native instance.
    mockOpts.random = mockOpts.seed === undefined ? nativeMockRandom : new MockRandom(mockOpts.seed);
    // Steer generation to FIT the binary cold-start estimate — only when
    // explicitly requested (`=== true`). `undefined` leaves the random generator
    // untouched; `false` (oversized) inflates a position past the budget and
    // reads `binarySizingOptions` directly, so it needs no in-bounds pass.
    if (mockOpts.respectBinarySize === true) applyInBoundsSizing(mockOpts);
    if (mockOpts.invalid) return mockRunTypeInvalid(runType, merged, []) as T;
    if (mockOpts.respectBinarySize === false) return mockRunTypeOversized(runType, merged, []) as T;
    return mockRunType(runType, merged, []) as T;
  }) as MockTypeFn<T>;
}

/** Three-way merge: defaults ← factory opts ← call opts. Shallow merge of
 *  the `mock` slot; nested pool arrays are replaced when supplied. The optional
 *  `data` (`MockData<T>`) enrichment map is taken from call opts, else factory
 *  opts, and seeded as the root `dataNode` cursor the walker descends. **/
function mergeMockOptions(
  factoryOpts: RunTypeMockOptions<unknown> | undefined,
  callOpts: DeepPartial<RunTypeMockOptions<unknown>> | undefined
): RunTypeMockOptions<unknown> {
  const factoryMock = factoryOpts?.mock as Partial<MockOptions> | undefined;
  const callMock = callOpts?.mock as Partial<MockOptions> | undefined;
  const merged: MockOptions = {
    ...defaultMockOptions,
    ...factoryMock,
    ...callMock,
  };
  const data = (callOpts?.data ?? factoryOpts?.data) as RunTypeMockOptions<unknown>['data'];
  const result: RunTypeMockOptions<unknown> = {mock: merged};
  if (data !== undefined) {
    result.data = data;
    result.dataNode = data as MockDataNode;
  }
  return result;
}
