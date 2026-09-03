/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez

 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
  CompiledTypeFn,
  TypesFunctionsCache,
  PureFunctionsCache,
  CompiledPureFunction,
  PureFunction,
  PureFunctionFactory,
  RunType,
  RunTypesCache,
  InitializedTypeFn,
  Mutable,
} from './types.ts';
import {
  getClassSerializer as getClassSerializerImpl,
  deserializeClass as deserializeClassImpl,
  classSerializerEpoch as classSerializerEpochImpl,
} from './classSerializerRegistry.ts';
import {CircularReferenceError} from './circular.ts';
import {ParseMismatch} from './parseError.ts';
import type {CircularPath} from './circular.ts';
import type {ClassSerializerEntry} from './classSerializerRegistry.ts';
import type {DataOnly} from './dataOnly.ts';
import type {CompTimeArgs} from '../markers.ts';

/**
 * Shape of rtUtils. Must be defined as a type — `typeof rtUtils` breaks
 * reflection.
 */
export type RTUtils = typeof rtUtils;

/** Runtime guard for the RUN-TYPE overload shared by every `createXxx` factory
 *  (`createValidateFn(rt)`, `createJsonEncoderFn(rt)`,
 *  `createCloneExactShapeFn(rt)`, …): the run-type a builder returns carries
 *  both a string `id` and a `kind`. Plain reflected values (the value/static
 *  form) don't carry `kind`, so they fall through to the plugin-injected id. **/
export function isRunTypeValue(val: unknown): val is RunType {
  return typeof val === 'object' && val !== null && typeof (val as RunType).id === 'string' && 'kind' in val;
}

const rtFnsCache: TypesFunctionsCache = {};
const pureFnsCache: PureFunctionsCache = {};
const runTypesCache: RunTypesCache = {};

// Memo for findRTForType, including negative results (`null` = scanned, no
// entry — the common case, since most formats declare no transform). Cleared
// whenever rtFnsCache mutates, so a hit is always as fresh as a scan. Without
// it the scan runs per format-annotated MOCK NODE: one generated
// Set<{[k: number]: Map<…, Record<string, Format>>}> value is ~10^5 nodes, and
// against a long-lived registry the O(cache) scan (which also allocates every
// key via Object.keys) turned a 35ms fuzz-soak iteration into 300+ seconds.
const findRTForTypeMemo = new Map<string, CompiledTypeFn | null>();

const rtUtils = {
  addToRTCache(comp: CompiledTypeFn) {
    rtFnsCache[comp.rtFnHash] = comp;
    findRTForTypeMemo.clear();
  },
  removeFromRTCache(comp: CompiledTypeFn) {
    if (!rtFnsCache[comp.rtFnHash]) return;
    (rtFnsCache[comp.rtFnHash] as any) = undefined;
    findRTForTypeMemo.clear();
  },
  getRT(rtFnHash: string): InitializedTypeFn | undefined {
    const entry = rtFnsCache[rtFnHash];
    if (!entry) return undefined;
    materializeRTFn(entry);
    return entry;
  },
  // Find a family's compiled entry for a TYPE id without knowing the family's
  // opaque fnHash prefix (cache keys are `<fnHash>_<typeId>`; the 3-char hash
  // folds the binary version, so the runtime can never hardcode it). Linear
  // scan gated on the key suffix + the entry's familyTag, memoized per
  // (familyTag, typeId) — cold path (mock generation), but called once per
  // format-annotated node of a generated value, so repeats must be O(1).
  findRTForType(familyTag: string, typeId: string): InitializedTypeFn | undefined {
    const memoKey = familyTag + '\u0000' + typeId;
    const hit = findRTForTypeMemo.get(memoKey);
    if (hit !== undefined) {
      if (hit === null) return undefined;
      materializeRTFn(hit);
      return hit as InitializedTypeFn;
    }
    const suffix = '_' + typeId;
    for (const key of Object.keys(rtFnsCache)) {
      if (!key.endsWith(suffix)) continue;
      const entry = rtFnsCache[key];
      if (!entry || entry.familyTag !== familyTag) continue;
      materializeRTFn(entry);
      findRTForTypeMemo.set(memoKey, entry);
      return entry;
    }
    findRTForTypeMemo.set(memoKey, null);
    return undefined;
  },
  getRTFn(rtFnHash: string): (...args: any[]) => any {
    const entry = rtFnsCache[rtFnHash];
    if (!entry) throw new Error(`RT function not found for rtFnHash ${rtFnHash}`);
    materializeRTFn(entry);
    return entry.fn;
  },
  hasRTFn(rtFnHash: string) {
    return !!rtFnsCache[rtFnHash];
  },
  addPureFn(key: string, compiledFn: CompiledPureFunction): CompiledPureFunction {
    if (!key) throw new Error('Pure function key must be a non-empty "namespace::fnName" string');
    const existing = pureFnsCache[key];
    if (existing) {
      // Version conflict — body changed; replace and warn.
      if (existing.bodyHash && compiledFn.bodyHash && existing.bodyHash !== compiledFn.bodyHash) {
        console.warn(
          `Pure function ${key} body hash mismatch. ` +
            `Existing: ${existing.bodyHash}, New: ${compiledFn.bodyHash}. ` +
            `Replacing with new version.`
        );
        pureFnsCache[key] = compiledFn;
        return compiledFn;
      }
      return existing;
    }
    pureFnsCache[key] = compiledFn;
    return compiledFn;
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  usePureFn(key: CompTimeArgs<string>): PureFunction {
    const compiled = pureFnsCache[key];
    if (!compiled) throw new Error(`Pure function not found for key "${key}"`);
    initPureFunction(compiled);
    return compiled.fn;
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  getPureFn(key: CompTimeArgs<string>): PureFunction | undefined {
    const compiled = pureFnsCache[key];
    if (!compiled) return;
    initPureFunction(compiled);
    return compiled.fn;
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  getCompiledPureFn(key: CompTimeArgs<string>): CompiledPureFunction | undefined {
    return pureFnsCache[key];
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  hasPureFn(key: CompTimeArgs<string>): boolean {
    return !!pureFnsCache[key];
  },
  // Runtime-key lookup — the UNTRACKED companion to usePureFn/getPureFn/hasPureFn.
  // The `key` parameter is a plain `string` (NOT `CompTimeArgs<string>`), so the
  // scanner never demand-checks it: this is the door for a framework dispatching
  // on a pure-fn id received over the WIRE (e.g. a content hash from a request),
  // which is inherently non-literal. NOT build-tracked — it drives no PFE9012
  // "referenced but never registered" nor pure-fn dependency edges; use the
  // CompTimeArgs forms when you want that tracking.
  getPureFnByKey(key: string): PureFunction | undefined {
    const compiled = pureFnsCache[key];
    if (!compiled) return;
    initPureFunction(compiled);
    return compiled.fn;
  },
  // Untracked existence check keyed by a runtime string (see getPureFnByKey).
  hasPureFnByKey(key: string): boolean {
    return !!pureFnsCache[key];
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  findCompiledPureFn(fnName: CompTimeArgs<string>): CompiledPureFunction | undefined {
    const suffix = '::' + fnName;
    for (const key of Object.keys(pureFnsCache)) {
      if (key === fnName || key.endsWith(suffix)) return pureFnsCache[key];
    }
    return undefined;
  },
  addRunType(id: string, runType: RunType): RunType {
    if (!id) throw new Error('Run-type id must be a non-empty string');
    runTypesCache[id] = runType;
    return runType;
  },
  removeRunType(id: string) {
    if (!runTypesCache[id]) return;
    (runTypesCache[id] as any) = undefined;
  },
  getRunType(id: string): RunType | undefined {
    return runTypesCache[id];
  },
  useRunType(id: string): RunType {
    const rt = runTypesCache[id];
    if (!rt) throw new Error(`Run-type not found for id "${id}"`);
    return rt;
  },
  hasRunType(id: string): boolean {
    return !!runTypesCache[id];
  },
  // "Does the build know this type at all?" — the degrade-vs-throw signal for a
  // compiled-fn key miss (resolveEntryTupleFn): a known type with no entry for
  // the requested variant degrades to the family identity; a wholly unknown id
  // throws. A registered runtype graph answers yes, but the graph is
  // demand-driven (reflection sites only), so ANY registered fn entry for the
  // id (cache keys are `<fnHash>_<typeId>`) counts as knowledge too — otherwise
  // a createX-only type would flip from degrade to throw depending on whether
  // some unrelated file happens to reflect it. Miss paths only, so the linear
  // key scan is fine (no memo needed).
  knowsType(typeId: string): boolean {
    if (runTypesCache[typeId]) return true;
    const suffix = '_' + typeId;
    for (const key of Object.keys(rtFnsCache)) {
      if (key.endsWith(suffix) && rtFnsCache[key]) return true;
    }
    return false;
  },
  alwaysThrowFactory(message: string): () => never {
    return () => {
      throw new Error(message);
    };
  },
  // Constructs the CircularReferenceError an armed encoder body throws when its
  // inline guard (rt::findCycle) detects a reference cycle. Kept on rtUtils
  // so the emitted factory body — rebuilt via `new Function('utl', code)` — can
  // reach the error class without a module import.
  circularError(path: CircularPath): CircularReferenceError {
    return new CircularReferenceError(path);
  },
  // The mismatch signal an emitted parse body throws. Kept here for the same
  // reason as circularError: the body is rebuilt via `new Function('utl', code)`
  // and cannot import a module. `createParseFn` catches it one frame up and
  // turns it into the RTParseError the caller sees.
  parseMismatch(value: unknown, cause?: unknown): ParseMismatch {
    return new ParseMismatch(value, cause);
  },
  // Custom user-class (de)serializer lookup. Emitted factory bodies for plain
  // user classes (KindClass + SubKindNone) call this with the class node's
  // `rt.ID` plus its build-time class name; exact instantiation ids match
  // first, then the class-name fallback lane (one registration covers every
  // generic instantiation — generics are erased at runtime). A registered
  // entry routes (de)serialization through it, otherwise the factory uses its
  // structural fallback. See classSerializerRegistry.ts.
  getClassSerializer(typeId: string, className?: string): ClassSerializerEntry | undefined {
    return getClassSerializerImpl(typeId, className);
  },
  // Registry epoch — emitted bodies cache their getClassSerializer(<id>) result
  // in the closure and re-look-up only when this moves (register/unregister/clear
  // bump it), so the steady-state hot path is one int compare, not a Map lookup.
  csEpoch(): number {
    return classSerializerEpochImpl();
  },
  // Reconstruct a live instance from decoded data. Emitted decode bodies
  // call this for a registered class member; it prefers the registered
  // `deserialize`, else auto-instantiates a zero-arg class and sets its
  // declared properties (surfacing CLS002 when the bare `new cls()` throws).
  deserializeClass<T>(entry: ClassSerializerEntry<T>, data: DataOnly<T>, keys: readonly string[]): T {
    return deserializeClassImpl(entry, data, keys);
  },
};

export function getRTUtils(): RTUtils {
  return rtUtils;
}

/** Returns the RT and pure-function caches. DO NOT MODIFY — the returned
 *  objects are the originals used by RT functions. */
export function getRTFnCaches() {
  return {
    rtFnsCache: rtFnsCache as Readonly<TypesFunctionsCache>,
    pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
  };
}

/** Lazily materialize a pure function's `.fn`.
 *
 *  Emit modes (symmetric with materializeRTFn for type fns):
 *  - functions/both: `createPureFn` is the embedded `function(<params>){…}`
 *    closure — invoke it with rtUtils.
 *  - code (default): `createPureFn` is absent (dropped as a trailing hole);
 *    rebuild it from `code` + `paramNames` via `new Function(...)` and cache it
 *    on the entry so the reconstruction runs once. **/
function initPureFunction(compiled: CompiledPureFunction): asserts compiled is CompiledPureFunction & {fn: PureFunction} {
  if (compiled.fn) return;
  let factory = compiled.createPureFn;
  if (!factory) {
    factory = buildPureFnFactoryFromCode(compiled.paramNames, compiled.code ?? '');
    (compiled as Mutable<CompiledPureFunction>).createPureFn = factory;
  }
  compiled.fn = factory(rtUtils);
}

/** Rebuilds a pure-fn factory from its serialized `code` body via
 *  `new Function(...paramNames, code)` — the runtime counterpart of the emitted
 *  `function(<paramNames>){<code>}` literal (`code`-mode reconstruction).
 *  Forces strict mode so the reconstructed body matches the (always-strict) ESM
 *  literal shipped in `functions`/`both` mode. Contrast `buildFactoryFromCode`
 *  (type fns): a pure fn's params are its recorded `paramNames`, not a fixed
 *  `utl`. **/
export function buildPureFnFactoryFromCode(paramNames: string[], code: string): PureFunctionFactory {
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function(...paramNames, `'use strict'; ${code}`) as PureFunctionFactory;
}

/** Composite key for the pure-fn cache: `<namespace>::<fnName>`. **/
export function pureFnKey(namespace: string, fnName: string): string {
  return namespace + '::' + fnName;
}

/** Builds a fresh factory closure from a serialized code body via
 *  `new Function('utl', code)`. Forces strict mode. **/
export function buildFactoryFromCode(code: string): (utl: RTUtils) => (...args: any[]) => any {
  // oxlint-disable-next-line typescript/no-implied-eval
  return new Function('utl', `'use strict'; ${code}`) as (utl: RTUtils) => (...args: any[]) => any;
}

/** Returns the entry's factory body `code`. Present verbatim in `code`/`both`
 *  emit modes; in `functions` mode (code omitted, live factory shipped) it is
 *  derived from `createRTFn.toString()` — the factory prints as
 *  `function g_<hash>(utl){<body>}`, so the body is the slice between the first
 *  `{` and the last `}`. Memoized onto the entry so the derivation runs once.
 *  Empty string when neither code nor factory exists (never, in practice). **/
export function entryCode(entry: CompiledTypeFn): string {
  if (entry.code !== undefined) return entry.code;
  if (entry.createRTFn) {
    const src = entry.createRTFn.toString();
    const open = src.indexOf('{');
    const close = src.lastIndexOf('}');
    const derived = open >= 0 && close > open ? src.slice(open + 1, close) : '';
    (entry as Mutable<CompiledTypeFn>).code = derived;
    return derived;
  }
  return '';
}

/** Cycle guard. When entry A's createRTFn invokes `getRT('B')` and B's
 *  createRTFn invokes `getRT('A')`, the second call would re-enter
 *  materializeRTFn for A while A is still materializing. The marker
 *  short-circuits that re-entry — getRT still returns A's entry (with
 *  `fn` undefined for now); the inner closure captures the entry reference
 *  and reads `A.fn` later at call time, by which point it's set. **/
const materializing = new Set<string>();

/** Lazily populate an entry's `createRTFn` + `fn`. Cache modules register
 *  entries without eager materialization so cross-cache `getRT()` lookups
 *  inside a closure resolve to entries that already exist.
 *
 *  Emit modes:
 *  - functions/both (`--emit-mode functions|both`): `entry.createRTFn` is
 *    the embedded `function(utl){…}` closure — invoke it.
 *  - code (default): `entry.createRTFn` is undefined; rebuild from `entry.code`
 *    via `new Function('utl', code)`, cache on the entry.
 *
 *  Noop entries skip via the `entry.fn` guard (cache modules pre-populate
 *  `fn` with the family-specific identity at register time).
 *
 *  alwaysThrow entries: `entry.createRTFn` is the throwing closure from
 *  `alwaysThrowFactory(message)`; it ignores `utl` and throws. **/
function materializeRTFn(entry: CompiledTypeFn): asserts entry is InitializedTypeFn {
  if (entry.fn) return;
  if (materializing.has(entry.rtFnHash)) return;
  if (!entry.createRTFn && !entry.code) return;
  materializing.add(entry.rtFnHash);
  try {
    // `functions` mode ships createRTFn directly; otherwise rebuild it from the
    // code string (entryCode === entry.code here, since createRTFn is absent).
    if (!entry.createRTFn) (entry as Mutable<CompiledTypeFn>).createRTFn = buildFactoryFromCode(entryCode(entry));
    (entry as Mutable<CompiledTypeFn>).fn = (entry as InitializedTypeFn).createRTFn(rtUtils);
  } finally {
    materializing.delete(entry.rtFnHash);
  }
}
