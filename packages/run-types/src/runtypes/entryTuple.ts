// Runtime half of the per-entry virtual modules: the Go binary emits one ES module per cache entry, exporting a
// positional tuple. ⚠️ SYNC BOUNDARY — the `*_TUPLE_KEYS` arrays below are the single source of slot order,
// mirrored by the Go emitters in internal/compiler/virtualmodules and
// internal/cachegen/{runtype,typefunctions,purefunctions}, so a layout change must touch both ends together.
// Every tuple shares a fixed head: slot 0 discriminates the layout (the numeric kinds below, or the quoted
// family tag for type-fn entries), slot 1 a lazy deps thunk, slot 2 the runtype footer ini, slot 3 the cache
// key; Go trims trailing-undefined slots, which the derived tuple types model as optional tails.

import {getRTUtils} from './rtUtils.ts';
import type {RTUtils} from './rtUtils.ts';
import type {AnyFn, CompiledFnArgs, CompiledFnData, CompiledPureFunction, CompiledTypeFn, RunType} from './types.ts';

// Numeric slot-0 kinds (Go: constants.TupleKind*); type-fn entries carry their family tag string instead.
// Kind 0 is the standalone per-node module form, emitted only under `moduleMode: 'allModules'`.
const KIND_RUN_TYPE = 0;
const KIND_PURE_FN = 2;
const KIND_MISSING = 3;
const KIND_RUN_TYPE_BUNDLE = 4;
const KIND_RUN_TYPE_FACADE = 5;

/** Fixed character length of every fnHash, used to split `<fnHash>_<typeId>` keys. ⚠️ HAND-WRITTEN MIRROR of Go's
 *  operations.FnHashLen: it must move on BOTH ends in the same change, or the split silently misses and the
 *  factory degrades to the family noop — and only the value-first form rebuilds the key, so the type form hides
 *  it. Pinned against the generated hash table by `fnHashLength` in test/features/getFnHash.test.ts. **/
export const FN_HASH_LEN = 4;

/** Lazy dependency thunk (slot 1): the entry's DIRECT dependency tuples, never itself; lazy so module-level
 *  import cycles never hit TDZ. Dep-less entries carry undefined in the slot instead. **/
export type EntryDepsThunk = () => readonly EntryTuple[];

/** Runtype footer initializer (slot 2): patches the entry's ref slots once the whole closure is registered. **/
export type RunTypeIni = (rtu: RTUtils) => void;

// =============================================================================
// Entry records — named views of each tuple layout.
// =============================================================================

// The scalar identification fields a runtype bundle ROW carries, in WIRE ORDER. The ref-bearing slots are NOT
// here: they start undefined on the registered entry and are patched by the bundle's combined ini.
const RUN_TYPE_FIELD_KEYS = [
  'id',
  'kind',
  'subKind',
  'typeName',
  'name',
  'literal',
  'optional',
  'readonly',
  'isAbstract',
  'isStatic',
  'visibility',
  'isSafeName',
  'position',
  'isCircular',
  'flags',
  'description',
  'defaultVal',
  'enumVal',
  'values',
  'notSupported',
  'nonEnumerable',
  // Trailing, reflection ROOTS only (cachegen/jsonsize): a hole on every nested row and on an unbounded root.
  'jsonMaxBytes',
] as const;

/** One runtype ROW inside the data bundle. Rows carry no tuple head: the bundle module hosts the shared deps
 *  thunk and the single combined ini. **/
export type RunTypeRowRecord = Pick<RunType, (typeof RUN_TYPE_FIELD_KEYS)[number]>;

// The ref-bearing RunType fields, in the wire order of a bundle `rels` row.
// ⚠️ MUST match Go's runtype.renderRelations (internal/cachegen/runtype/module.go).
// child/children lead — the most common fields — so the typical relRow is one or two slots long; the fields NOT
// here (classType, literal, formatAnnotation) are JS expressions handled by the residual bundle ini.
const RUN_TYPE_REL_KEYS = [
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

// Parallel to RUN_TYPE_REL_KEYS: true = the slot holds an ARRAY of relation targets, false = a single target.
const RUN_TYPE_REL_IS_ARRAY = [
  false, // child
  true, // children
  false, // index
  false, // return
  false, // indexType
  true, // parameters
  true, // safeUnionChildren
  true, // unionDiscriminators
  true, // typeMeta
  true, // typeArguments
  true, // arguments
  true, // extendsArguments
  true, // implements
  true, // extends
] as const;

/** One relation target inside a bundle `rels` row: a row INDEX (number), a foreign id (string — a ref whose
 *  target is not a bundle row), or an inline non-ref RunType (object). **/
type RunTypeRel = number | string | object;

/** A bundle `rels` row — parallel by index to `rows`, and by slot to RUN_TYPE_REL_KEYS / RUN_TYPE_REL_IS_ARRAY.
 *  A slot is undefined when it carries no relation, and a whole row is undefined for a leaf node. **/
export type RunTypeRelRow = readonly (RunTypeRel | readonly RunTypeRel[] | undefined)[];

/** A standalone per-node runtype module (kind 0, `moduleMode: 'allModules'` only): the shared head plus a bundle
 *  row's fields; its own ini patches this one node's ref slots. **/
export interface RunTypeRecord extends RunTypeRowRecord {
  entryKind: typeof KIND_RUN_TYPE;
  deps: EntryDepsThunk | undefined;
  ini: RunTypeIni | undefined;
}

/** THE runtype data-bundle module (`rtmod:/runtypes.js`): every reflection-demanded node as one headless row,
 *  a parallel `rels` array wiring each node's ref-bearing slots by ROW INDEX, and a residual `ini` carrying only
 *  the rare expression-specials (classType / bigint-symbol literal / formatAnnotation). `key` is a CONTENT hash
 *  over the row ids, so the processed-keys guard re-registers new rows after an HMR reload of the bundle. **/
export interface RunTypeBundleRecord {
  entryKind: typeof KIND_RUN_TYPE_BUNDLE;
  deps: EntryDepsThunk | undefined;
  ini: RunTypeIni | undefined;
  key: string;
  rows: readonly RunTypeRow[];
  rels: readonly RunTypeRelRow[];
}

/** A per-reflection-root facade module (`rtmod:/<rootId>.js`): registers nothing, it carries the root id in the
 *  key slot and the bundle in its deps thunk, so the rewrite's binding-only injection keeps deriving ids. **/
export interface RunTypeFacadeRecord {
  entryKind: typeof KIND_RUN_TYPE_FACADE;
  deps: EntryDepsThunk | undefined;
  ini: undefined;
  key: string;
}

/** A type-fn entry tuple; slot 0 is the family tag string. `code` is widened to `| undefined` because noop and
 *  alwaysThrow rows ship without one — the register path resolves the identity / throwing factory instead. **/
export interface FnTypeRecord extends Pick<
  CompiledTypeFn,
  'rtFnHash' | 'typeName' | 'isNoop' | 'rtDependencies' | 'pureFnDependencies' | 'createRTFn' | 'alwaysThrowMessage'
> {
  familyTag: string;
  deps: EntryDepsThunk | undefined;
  ini: undefined;
  code: CompiledFnData['code'] | undefined;
  // `tb` (binary-encoder) entries only: the cold-start buffer-size estimate in bytes, absent on every other
  // family. Trailing slot; read by createBinaryEncoderFn's `dynamic` strategy (see binarySizeEstimateFromTuple).
  binarySizeEstimate?: number;
}

/** A pure-fn entry tuple; `key` is the pure fn's id, which is the cache key verbatim. **/
export interface PureFnRecord extends Pick<CompiledPureFunction, 'paramNames' | 'code' | 'pureFnDependencies' | 'createPureFn'> {
  entryKind: typeof KIND_PURE_FN;
  deps: EntryDepsThunk | undefined;
  ini: undefined;
  key: string;
}

/** A KindMissing stub — emitted for demanded entries the build dropped (unsupported kinds / dangling deps);
 *  registers nothing, consumers degrade to their family identity fallback. **/
export interface MissingRecord {
  entryKind: typeof KIND_MISSING;
  deps: undefined;
  ini: undefined;
  key: string;
}

// =============================================================================
// Tuple types — derived from the records via the ordered key arrays.
// =============================================================================

// The SAME key arrays drive the runtime tuple→record conversion (tupleToRecord), so slot order has exactly one
// source of truth.
type TupleFrom<R, K extends readonly (keyof R)[]> = {[I in keyof K]: R[K[I]]};

const ENTRY_HEAD_KEYS = ['entryKind', 'deps', 'ini'] as const;

// Go's emitters render every default-valued slot as a JS array HOLE and drop the trailing run of holes; when a
// LATER slot is non-default the interior holes stay in place, and index-based access reads them back as
// undefined either way. Runtype rows always carry at least (id, kind), fn tuples at least (rtFnHash, typeName,
// code), pure-fn tuples trim only the trailing `createPureFn`, and bundle / facade / missing tuples are never
// trimmed. The REQUIRED/TRIMMED splits below mirror that so the derived tuple types accept the short forms.
type RunTypeRowRequiredKeys = readonly ['id', 'kind'];
type RunTypeRowTrimmedKeys = typeof RUN_TYPE_FIELD_KEYS extends readonly [unknown, unknown, ...infer Rest] ? Rest : never;

export const RUN_TYPE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, ...RUN_TYPE_FIELD_KEYS] as const;
export const RUN_TYPE_BUNDLE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key', 'rows', 'rels'] as const;
export const RUN_TYPE_FACADE_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key'] as const;

const FN_TYPE_REQUIRED_KEYS = ['familyTag', 'deps', 'ini', 'rtFnHash', 'typeName', 'code'] as const;
const FN_TYPE_TRIMMED_KEYS = [
  'isNoop',
  'rtDependencies',
  'pureFnDependencies',
  'createRTFn',
  'alwaysThrowMessage',
  'binarySizeEstimate',
] as const;
export const FN_TYPE_TUPLE_KEYS = [...FN_TYPE_REQUIRED_KEYS, ...FN_TYPE_TRIMMED_KEYS] as const;

/** Slot index of the `tb` cold-start estimate, derived from the keys array so it tracks any layout edit. **/
const FN_TYPE_ESTIMATE_SLOT = FN_TYPE_TUPLE_KEYS.indexOf('binarySizeEstimate');

const PURE_FN_REQUIRED_KEYS = [...ENTRY_HEAD_KEYS, 'key', 'paramNames', 'code', 'pureFnDependencies'] as const;
// Dropped in `code` mode (rebuilt at runtime from code + paramNames), present in `functions`/`both`.
const PURE_FN_TRIMMED_KEYS = ['createPureFn'] as const;
export const PURE_FN_TUPLE_KEYS = [...PURE_FN_REQUIRED_KEYS, ...PURE_FN_TRIMMED_KEYS] as const;

const MISSING_TUPLE_KEYS = [...ENTRY_HEAD_KEYS, 'key'] as const;

/** Positional row of the runtype data bundle: headless, id at slot 0, kind at slot 1, trailing slots trimmed. **/
export type RunTypeRow = readonly [
  ...TupleFrom<RunTypeRowRecord, RunTypeRowRequiredKeys>,
  ...Partial<TupleFrom<RunTypeRowRecord, RunTypeRowTrimmedKeys>>,
];

/** Positional tuple of a standalone per-node runtype module (allModules mode). **/
export type RunTypeTuple = readonly [
  ...TupleFrom<RunTypeRecord, readonly [...typeof ENTRY_HEAD_KEYS, ...RunTypeRowRequiredKeys]>,
  ...Partial<TupleFrom<RunTypeRecord, RunTypeRowTrimmedKeys>>,
];

/** Positional tuple of the runtype data-bundle module. **/
export type RunTypeBundleTuple = readonly [...TupleFrom<RunTypeBundleRecord, typeof RUN_TYPE_BUNDLE_TUPLE_KEYS>];

/** Positional tuple of a per-root facade module. **/
export type RunTypeFacadeTuple = readonly [...TupleFrom<RunTypeFacadeRecord, typeof RUN_TYPE_FACADE_TUPLE_KEYS>];

/** Positional tuple of a type-fn entry module. **/
export type FnTypeTuple = readonly [
  ...TupleFrom<FnTypeRecord, typeof FN_TYPE_REQUIRED_KEYS>,
  ...Partial<TupleFrom<FnTypeRecord, typeof FN_TYPE_TRIMMED_KEYS>>,
];

/** Positional tuple of a pure-fn entry module: trailing `createPureFn` optional (dropped in `code` mode), and
 *  `code` `| undefined` (holed out in `functions` mode). **/
export type PureFnTuple = readonly [
  ...TupleFrom<PureFnRecord, typeof PURE_FN_REQUIRED_KEYS>,
  ...Partial<TupleFrom<PureFnRecord, typeof PURE_FN_TRIMMED_KEYS>>,
];

/** Positional tuple of a KindMissing stub module. **/
export type MissingTuple = readonly [...TupleFrom<MissingRecord, typeof MISSING_TUPLE_KEYS>];

/** One emitted entry-module tuple — the union every consumer handles. **/
export type EntryTuple = RunTypeTuple | RunTypeBundleTuple | RunTypeFacadeTuple | FnTypeTuple | PureFnTuple | MissingTuple;

// Fixed-head slot indexes, pinned at compile time against every keys array so
// a layout edit that moves a head slot fails the build here, not at runtime.
const SLOT_KIND = 0;
const SLOT_DEPS = 1;
const SLOT_KEY = 3;
const SLOT_ROWS = 4;
const SLOT_RELS = 5;
const _pinBundleRels: 'rels' = RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_RELS];
void _pinBundleRels;
const _pinBundleHead: ['entryKind', 'deps', 'ini', 'key', 'rows'] = [
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_KIND],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_DEPS],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[2],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_KEY],
  RUN_TYPE_BUNDLE_TUPLE_KEYS[SLOT_ROWS],
];
const _pinFacadeHead: ['entryKind', 'deps', 'ini', 'key'] = [
  RUN_TYPE_FACADE_TUPLE_KEYS[SLOT_KIND],
  RUN_TYPE_FACADE_TUPLE_KEYS[SLOT_DEPS],
  RUN_TYPE_FACADE_TUPLE_KEYS[2],
  RUN_TYPE_FACADE_TUPLE_KEYS[SLOT_KEY],
];
const _pinFnTypeHead: ['familyTag', 'deps', 'ini', 'rtFnHash'] = [
  FN_TYPE_TUPLE_KEYS[SLOT_KIND],
  FN_TYPE_TUPLE_KEYS[SLOT_DEPS],
  FN_TYPE_TUPLE_KEYS[2],
  FN_TYPE_TUPLE_KEYS[SLOT_KEY],
];
const _pinPureFnHead: ['entryKind', 'deps', 'ini', 'key'] = [
  PURE_FN_TUPLE_KEYS[SLOT_KIND],
  PURE_FN_TUPLE_KEYS[SLOT_DEPS],
  PURE_FN_TUPLE_KEYS[2],
  PURE_FN_TUPLE_KEYS[SLOT_KEY],
];
const _pinMissingHead: ['entryKind', 'deps', 'ini', 'key'] = [
  MISSING_TUPLE_KEYS[SLOT_KIND],
  MISSING_TUPLE_KEYS[SLOT_DEPS],
  MISSING_TUPLE_KEYS[2],
  MISSING_TUPLE_KEYS[SLOT_KEY],
];
void _pinBundleHead;
void _pinFacadeHead;
void _pinFnTypeHead;
void _pinPureFnHead;
void _pinMissingHead;

// tupleToRecord is the runtime counterpart of TupleFrom; trimmed (absent) slots land as explicit undefined.
function tupleToRecord<R extends object>(keys: readonly (keyof R)[], tuple: readonly unknown[]): R {
  const record = {} as Record<keyof R, unknown>;
  for (let index = 0; index < keys.length; index++) {
    record[keys[index]] = tuple[index];
  }
  return record as R;
}

/** Runtime guard for an injected entry tuple (vs a value-first schema, a legacy string id, or undefined). A
 *  dep-less entry carries no thunk, so the key slot's string check is the discriminating signal. **/
export function isEntryTuple(value: unknown): value is EntryTuple {
  if (isMissingTuple(value)) return true;
  if (!Array.isArray(value) || value.length <= SLOT_KEY) return false;
  const deps = value[SLOT_DEPS];
  return (typeof deps === 'function' || deps === undefined) && typeof value[SLOT_KEY] === 'string';
}

/** The cache key an entry tuple registers under: `id` for runtype tuples, `rtFnHash` for fn tuples, `key` for
 *  pure-fn / missing tuples. **/
export function entryTupleKey(tuple: EntryTuple): string {
  return tuple[SLOT_KEY] as string;
}

/** The cold-start size estimate (bytes) a `tb` (binary-encoder) tuple carries at its trailing slot, undefined
 *  for every other family. createBinaryEncoderFn's `dynamic` strategy seeds the buffer with it. **/
export function binarySizeEstimateFromTuple(injected: unknown): number | undefined {
  if (!isEntryTuple(injected)) return undefined;
  const slot = (injected as readonly unknown[])[FN_TYPE_ESTIMATE_SLOT];
  return typeof slot === 'number' ? slot : undefined;
}

/** True for the KindMissing stub the Go side emits for dropped entries; stubs register nothing and consumers
 *  degrade to their family identity fallback. **/
export function isMissingTuple(value: unknown): boolean {
  return Array.isArray(value) && value[SLOT_KIND] === KIND_MISSING;
}

// =============================================================================
// Per-family entry metadata.
// =============================================================================

interface FamilyMeta {
  fnID: string;
  args: () => CompiledFnArgs;
  defaultParamValues: () => CompiledFnArgs;
  noop: AnyFn;
}

const noopTrue = () => true;
const noopFalse = () => false;
const noopIdentity = (v: unknown) => v;
const noopErrors = (_v: unknown, _pth: unknown, er: unknown) => er || [];
const noopStringify = (v: unknown) => JSON.stringify(v);
const noopParse = (s: unknown) => JSON.parse(s as string);
const noopToBinary = (_v: unknown, Ser: unknown) => Ser;
const noopFromBinary = (ret: unknown) => ret;

const valueArgs = () => ({vλl: 'v'}) as CompiledFnArgs;
const valueDefaults = (): CompiledFnArgs => ({vλl: ''});
const errorArgs = () => ({vλl: 'v', pλth: 'pth', εrr: 'er'}) as CompiledFnArgs;
const errorDefaults = (): CompiledFnArgs => ({vλl: '', pλth: '[]', εrr: '[]'});

const valueShaped = (fnID: string, noop: AnyFn): FamilyMeta => ({fnID, args: valueArgs, defaultParamValues: valueDefaults, noop});

const errorShaped = (fnID: string): FamilyMeta => ({fnID, args: errorArgs, defaultParamValues: errorDefaults, noop: noopErrors});

// Keyed by the tuple's slot-0 family tag. The seven JSON-composite tags borrow the metadata of their host family
// (Go: constants.JsonCompositeHostTags) EXCEPT the noop fn: a composite's identity is native JSON, so a noop
// composite tuple must register JSON.stringify (encoder tags) / JSON.parse (decoder tags) — noopIdentity would
// silently return the raw value / unparsed string.
// Exported for the coverage test only: a missing tag silently falls back to identity, so a validator answers true.
export const familyMeta: Record<string, FamilyMeta> = {
  val: valueShaped('val', noopTrue),
  verr: errorShaped('verr'),
  // The fused validators behind `{checkUnknowns: true}` — same shapes and noops as their plain twins (a noop
  // entry is an any/unknown root, which declares no keys, so nothing can be undeclared in it either).
  vst: valueShaped('vst', noopTrue),
  vest: errorShaped('vest'),
  // The union-scoped validators behind `{checkUnionUnknowns: true}` — same shapes and noops again.
  vuk: valueShaped('vuk', noopTrue),
  veuk: errorShaped('veuk'),
  pj: valueShaped('pj', noopIdentity),
  rj: valueShaped('rj', noopIdentity),
  sj: valueShaped('sj', noopStringify),
  pjs: valueShaped('pjs', noopIdentity),
  // compact strategy: cj builds the positional array, cjr rebuilds the keyed object.
  cj: valueShaped('cj', noopIdentity),
  cjr: valueShaped('cjr', noopIdentity),
  // rjs: the strip restore, value-shaped identity like rj.
  rjs: valueShaped('rjs', noopIdentity),
  huk: {
    fnID: 'huk',
    args: () => ({vλl: 'v', θpts: 'opts'}) as CompiledFnArgs,
    defaultParamValues: (): CompiledFnArgs => ({vλl: '', θpts: '{}'}),
    noop: noopFalse,
  },
  ces: valueShaped('ces', noopIdentity),
  uke: errorShaped('uke'),
  ukuw: valueShaped('ukuw', noopIdentity),
  // Name card: its typeName slot carries the build-time class name registerClassSerializer's name lane keys on.
  csr: valueShaped('csr', noopIdentity),
  tb: {
    fnID: 'tb',
    args: () => ({vλl: 'v', sεr: 'Ser'}) as CompiledFnArgs,
    defaultParamValues: (): CompiledFnArgs => ({vλl: '', sεr: ''}),
    noop: noopToBinary,
  },
  fb: {
    fnID: 'fb',
    args: () => ({vλl: 'ret', dεs: 'Des'}) as CompiledFnArgs,
    defaultParamValues: (): CompiledFnArgs => ({vλl: '', dεs: ''}),
    noop: noopFromBinary,
  },
  fmt: valueShaped('fmt', noopIdentity),
  // jsonSchema documents: the fn RETURNS the document (its `v` arg is unused); a noop would say "any value".
  jsc: valueShaped('jsc', () => ({})),
  // JSON composites: encoder tags host on pj metadata, decoder tags on rj, but their noop is native JSON.
  jeCL: valueShaped('pj', noopStringify),
  jeMU: valueShaped('pj', noopStringify),
  jeDI: valueShaped('pj', noopStringify),
  jeCO: valueShaped('pj', noopStringify),
  jdST: valueShaped('rj', noopParse),
  jdPR: valueShaped('rj', noopParse),
  jdCO: valueShaped('rj', noopParse),
};

// =============================================================================
// Tuple registration
// =============================================================================

// Keys whose subtree already registered — prunes the recursive walk across calls. The prune holds only while the
// entry is still in the registry (`removeFromRTCache` / `removeRunType` drop one, and the next injection must
// register it again), so collectClosure re-checks the registry before trusting a processed key. Cycles inside
// one call are cut by the per-call `visiting` set instead.
const processedKeys = new Set<string>();

/** Registers `root`'s full dependency closure into rtUtils, children first, then runs each newly-registered
 *  runtype tuple's footer initializer. Idempotent per key; processed subtrees are skipped without re-walking. **/
export function initFromTuple(root: EntryTuple): void {
  if (isMissingTuple(root)) return;
  if (!isEntryTuple(root)) return;
  const utils = getRTUtils();
  const fresh: EntryTuple[] = [];
  collectClosure(root, utils, fresh, new Set<string>());
  // Phase 2: every referenced entry now exists, so a ref lookup always resolves, cycles included.
  for (const tuple of fresh) {
    if (tuple[SLOT_KIND] === KIND_RUN_TYPE_BUNDLE) wireBundleRelations(utils, tuple as RunTypeBundleTuple);
    const ini = tuple[2] as RunTypeIni | undefined;
    if (typeof ini === 'function') ini(utils);
  }
}

// wireBundleRelations patches every bundle node's ref-bearing slots from the parallel `rels` array. Runs in
// phase 2, after registerRunTypeBundle added every row, so a relation target always resolves against a
// registered entry — cycles included, since index refs have no TDZ unlike direct const refs. `rels` shorter than
// `rows` means the tail rows are leaves with no relations.
function wireBundleRelations(utils: RTUtils, tuple: RunTypeBundleTuple): void {
  const rows = (tuple[SLOT_ROWS] ?? []) as readonly RunTypeRow[];
  const rels = (tuple[SLOT_RELS] ?? []) as readonly (RunTypeRelRow | undefined)[];
  if (rels.length === 0) return;
  const byIndex = rows.map((row) => utils.getRunType(row[0] as string));
  const resolve = (rel: unknown): unknown =>
    typeof rel === 'number' ? byIndex[rel] : typeof rel === 'string' ? utils.getRunType(rel) : rel;
  for (let i = 0; i < rels.length; i++) {
    const relRow = rels[i];
    if (!relRow) continue; // leaf row: no relations
    const runType = byIndex[i];
    if (!runType) continue;
    const target = runType as unknown as Record<string, unknown>;
    for (let slot = 0; slot < RUN_TYPE_REL_KEYS.length; slot++) {
      const value = relRow[slot];
      if (value === undefined) continue;
      target[RUN_TYPE_REL_KEYS[slot]] = RUN_TYPE_REL_IS_ARRAY[slot] ? (value as readonly unknown[]).map(resolve) : resolve(value);
    }
  }
}

// collectClosure walks a tuple's deps() thunks post-order, so deps register before their dependents: `visiting`
// terminates cycles, the processed-keys guard skips subtrees an earlier root registered (while the registry
// still holds them), and every newly registered tuple lands in `fresh` for the caller's phase-2 ini pass.
function collectClosure(tuple: unknown, utils: RTUtils, fresh: EntryTuple[], visiting: Set<string>): void {
  if (!isEntryTuple(tuple) || isMissingTuple(tuple)) return;
  const key = entryTupleKey(tuple);
  if (visiting.has(key)) return;
  visiting.add(key);
  if (processedKeys.has(key) && isStillRegistered(utils, tuple)) return;
  processedKeys.add(key);
  const deps = tuple[SLOT_DEPS] as EntryDepsThunk | undefined;
  if (deps) for (const dep of deps()) collectClosure(dep, utils, fresh, visiting);
  if (registerTuple(utils, tuple)) fresh.push(tuple);
}

// isStillRegistered keeps the cross-call prune from hiding an entry a removal dropped. A facade and a missing
// stub register nothing, so they always count; a data bundle counts by its FIRST row, since a removal drops rows
// wholesale and checking them all would cost O(rows) per call.
function isStillRegistered(utils: RTUtils, tuple: EntryTuple): boolean {
  const slot0 = tuple[SLOT_KIND];
  const key = entryTupleKey(tuple);
  if (typeof slot0 === 'string') return utils.hasRTFn(key);
  if (slot0 === KIND_RUN_TYPE) return utils.hasRunType(key);
  if (slot0 === KIND_PURE_FN) return utils.hasPureFnByKey(key);
  if (slot0 === KIND_RUN_TYPE_BUNDLE) {
    const rows = (tuple[SLOT_ROWS] ?? []) as readonly RunTypeRow[];
    return rows.length === 0 || utils.hasRunType(rows[0][0] as string);
  }
  return true;
}

/** Registers a tuple in the cache matching its kind; true when an entry was newly added (drives phase 2). **/
function registerTuple(utils: RTUtils, tuple: EntryTuple): boolean {
  const slot0 = tuple[SLOT_KIND];
  if (typeof slot0 === 'string') return registerTypeFnTuple(utils, tuple as FnTypeTuple);
  if (slot0 === KIND_RUN_TYPE_BUNDLE) return registerRunTypeBundle(utils, tuple as RunTypeBundleTuple);
  if (slot0 === KIND_RUN_TYPE) return registerRunTypeTuple(utils, tuple as RunTypeTuple);
  if (slot0 === KIND_PURE_FN) return registerPureFnTuple(utils, tuple as PureFnTuple);
  // A facade only carries its root id — the data arrived through its bundle dep.
  if (slot0 === KIND_RUN_TYPE_FACADE) return false;
  return false;
}

// Every ref-bearing slot starts undefined and is patched by the matching ini (the bundle's combined footer, or
// the per-node module's own ini in allModules mode).
function runTypeEntryFromRecord(record: RunTypeRowRecord): RunType {
  return {
    ...record,
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
  };
}

// registerRunTypeTuple registers one standalone per-node runtype module (kind 0, allModules mode); the node's
// ini patches its ref slots in phase 2. Re-registration is skipped so footer-patched entries are never reset.
function registerRunTypeTuple(utils: RTUtils, tuple: RunTypeTuple): boolean {
  const record = tupleToRecord<RunTypeRecord>(RUN_TYPE_TUPLE_KEYS, tuple);
  if (utils.hasRunType(record.id)) return false;
  utils.addRunType(record.id, runTypeEntryFromRecord(record));
  return true;
}

// registerRunTypeBundle registers every headless row of the data bundle. Rows an earlier bundle generation
// already registered are skipped, so footer-patched entries are never reset while in use; the combined ini
// re-runs over them anyway, which is safe — footer assignments are deterministic constants.
function registerRunTypeBundle(utils: RTUtils, tuple: RunTypeBundleTuple): boolean {
  const rows = (tuple[SLOT_ROWS] ?? []) as readonly RunTypeRow[];
  let added = false;
  for (const row of rows) {
    const record = tupleToRecord<RunTypeRowRecord>(RUN_TYPE_FIELD_KEYS, row);
    if (utils.hasRunType(record.id)) continue;
    utils.addRunType(record.id, runTypeEntryFromRecord(record));
    added = true;
  }
  return added;
}

// registerTypeFnTuple joins the tuple's wire fields with the family metadata keyed by its family tag.
function registerTypeFnTuple(utils: RTUtils, tuple: FnTypeTuple): boolean {
  const record = tupleToRecord<FnTypeRecord>(FN_TYPE_TUPLE_KEYS, tuple);
  if (utils.hasRTFn(record.rtFnHash)) return false;
  const meta = familyMeta[record.familyTag];
  if (!meta) return false; // unknown future family — leave to the identity fallback
  const isNoop = record.isNoop === true;
  const entry: CompiledTypeFn = {
    rtFnHash: record.rtFnHash,
    fnID: meta.fnID,
    familyTag: record.familyTag,
    typeName: record.typeName,
    args: meta.args(),
    defaultParamValues: meta.defaultParamValues(),
    // undefined in `functions` mode — entryCode derives it lazily from createRTFn.
    code: record.code,
    isNoop,
    rtDependencies: record.rtDependencies,
    pureFnDependencies: record.pureFnDependencies,
    createRTFn:
      record.alwaysThrowMessage !== undefined
        ? (utils.alwaysThrowFactory(record.alwaysThrowMessage) as CompiledTypeFn['createRTFn'])
        : record.createRTFn,
    fn: isNoop ? (meta.noop as CompiledTypeFn['fn']) : undefined,
    alwaysThrowMessage: record.alwaysThrowMessage,
    // `tb` entries only; carried onto the entry so it is reachable through getRT(rtFnHash) like every other
    // field the tuple ships, not only from createBinaryEncoderFn's closure.
    binarySizeEstimate: record.binarySizeEstimate,
  };
  utils.addToRTCache(entry);
  return true;
}

function registerPureFnTuple(utils: RTUtils, tuple: PureFnTuple): boolean {
  const record = tupleToRecord<PureFnRecord>(PURE_FN_TUPLE_KEYS, tuple);
  // The UNTRACKED lookup: the id comes off an emitted tuple, so there is no reference for the build to track.
  if (utils.hasPureFnByKey(record.key)) return false;
  const entry: CompiledPureFunction = {
    id: record.key,
    paramNames: record.paramNames,
    // undefined in `functions` mode — nobody reads a pure fn's code at runtime.
    code: record.code,
    pureFnDependencies: record.pureFnDependencies,
    // undefined in `code` mode — initPureFunction reconstructs via new Function.
    createPureFn: record.createPureFn,
    fn: undefined,
  };
  utils.addPureFn(record.key, entry);
  return true;
}

// =============================================================================
// createX-side resolution
// =============================================================================

/** Reads the nth entry tuple out of a multi-family `InjectTypeFnArgs<T, F1, F2, …>` slot: one tuple per name, in
 *  the order the names are written. The marker's DECLARED type is `string & {brand}`, not the tuple array it
 *  carries (the Go scanner only resolves `T` and the `Fn` keys reliably through that string-intersection alias),
 *  so unwrapping it HERE keeps that unavoidable cast out of every calling factory. **/
export function entryTupleAt(injected: unknown, index: number): EntryTuple | undefined {
  const tuples = injected as readonly EntryTuple[] | undefined;
  return tuples ? tuples[index] : undefined;
}

/** Resolves the compiled fn a createX factory dispatches to, registering the tuple's closure first. In the
 *  value-first SCHEMA form the schema's runtime `.id` overrides the injected type id, so the family fnHash is
 *  recovered from the tuple key by fixed-length split (FN_HASH_LEN); a missing stub or a key miss degrades to
 *  the family identity; no tuple at all means the plugin is inactive, so it throws with an actionable hint. */
export function resolveEntryTupleFn<F extends AnyFn>(
  fnName: string,
  identityFn: F,
  runTypeId: string | undefined,
  injected: unknown
): F {
  const utils = getRTUtils();
  if (isMissingTuple(injected)) return identityFn;
  if (!isEntryTuple(injected)) {
    if (runTypeId === undefined) {
      throw new Error(
        `${fnName}(): no id injected. @mionjs/devtools must be active for ${fnName} to dispatch to a precompiled factory.`
      );
    }
    // Plugin inactive, but the schema still names a type the build knows: degrade to the identity fallback.
    // knowsType, not hasRunType — the reflection graph is demand-driven, so fn entries must count as known too.
    if (utils.knowsType(runTypeId)) return identityFn;
    throw new Error(`${fnName}(): no RTCompiledFn entry for run-type id "${runTypeId}" in rtUtils.`);
  }
  initFromTuple(injected);
  let key = entryTupleKey(injected);
  if (runTypeId !== undefined) key = key.slice(0, FN_HASH_LEN) + '_' + runTypeId;
  const typeId = key.slice(FN_HASH_LEN + 1);
  const entry = utils.getRT(key);
  // `{rejectCircularRefs: true}` forks the injected fnHash at build time, so an armed call resolves a DIFFERENT
  // entry whose body self-guards (via findCycle); nothing to read here, the option is already baked into `key`.
  if (entry) return entry.fn as F;
  // A key miss is only reachable through the schema form's runtime id substitution, since the build always
  // renders the tuple's own key: degrade to the family identity. knowsType counts fn entries as well as the
  // reflection graph, so the decision does not depend on whether anything happened to reflect the type.
  if (utils.knowsType(typeId)) return identityFn;
  throw new Error(
    `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}
