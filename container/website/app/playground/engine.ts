// engine.ts — the framework-agnostic playground engine.
//
// Given a TypeScript snippet that defines `MyType` and a chosen build function,
// it drives the WASM resolver to RESOLVE the type, links the emitted
// entry-module code in-browser, and hands the resulting tuple to the matching
// public ts-runtypes factory to produce a LIVE function it then runs against
// input. This is the same pipeline the Vite plugin + runtime use at build/run
// time, here driven live from a single resolver dispatch.

import * as RT from '@ts-runtypes/core';
// Side effect: register the format pure fns (rtFormats::isUUID, …), regex
// patterns and format mock fns the generated validators / mock walker call at
// runtime. Without it a format like UUID / IP throws `pf_isUUID is not a function`.
import '@ts-runtypes/core/formats';
import {loadResolver, type Resolver, type ResolverOptions, type ResolverVersions} from './wasmLoader.ts';
import {ROOT_TYPE} from './markerDts.ts';
import {runtypesPackageSources} from './packageSources.ts';
import {operationByKey, type Operation} from './operations.ts';

export type {Operation, OperationKind} from './operations.ts';
export type {Resolver, ResolverOptions, ResolverVersions} from './wasmLoader.ts';
export {OPERATIONS, operationByKey} from './operations.ts';
export {ROOT_TYPE} from './markerDts.ts';

const FILE = 'playground.ts';

const factories = RT as unknown as Record<string, (...args: unknown[]) => (...callArgs: unknown[]) => unknown>;

export type Diagnostic = Record<string, unknown>;

export interface RunTypeNode {
  id: string;
  kind: number;
  family?: string;
  typeName?: string;
  name?: string;
  [key: string]: unknown;
}

// A node of the display projection of the live RunType graph. Child slots hold
// the actual child nodes, inlined; `circular` marks the one case that cannot be
// inlined (see runTypeTree).
export interface RunTypeTreeNode {
  id: string;
  kind: number;
  /** Back-edge marker: this slot points at an ANCESTOR node, i.e. a genuine
   *  reference cycle in the graph. The only reference the projection emits. */
  circular?: true;
  /** Emitted when the node budget ran out on a pathologically shared type. */
  truncated?: true;
  [key: string]: unknown;
}

export type RunResult =
  | {op: Operation; kind: 'predicate'; value: boolean; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'errors'; value: unknown[]; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'encode'; value: unknown; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'jsonRoundtrip'; encoded: unknown; decoded: unknown; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'binaryEncode'; byteLength: number; hex: string; diagnostics: Diagnostic[]}
  | {op: Operation; kind: 'binaryRoundtrip'; byteLength: number; hex: string; decoded: unknown; diagnostics: Diagnostic[]}
  | {
      op: Operation;
      kind: 'graph';
      rootId: string | null;
      /** The LIVE reflected node `getRunType<MyType>()` returns — a knotted,
       *  possibly cyclic object graph. Not JSON-safe; project it with `tree`. */
      root: RunTypeNode | null;
      /** JSON-safe projection of `root`, descending from it (see runTypeTree). */
      tree: RunTypeTreeNode | null;
      /** The resolver's flat wire dump: every reachable node, with child slots
       *  as `{id, kind: -1}` ref sentinels (JSON can't carry references). The
       *  build input the runtime re-knots into `root`, kept for node counts. */
      runTypes: RunTypeNode[];
      diagnostics: Diagnostic[];
    };

interface ScanResult {
  // fnId is absent for reflection call sites (getRunTypeId / createMockDataFn),
  // which inject the facade tuple under `__rt_<id>` rather than `__rt_<fnId>_<id>`.
  site: {id: string; fnId?: string; [key: string]: unknown} | null;
  entryModules: Record<string, string>;
  runTypes: RunTypeNode[];
  diagnostics: Diagnostic[];
}

let resolverPromise: Promise<Resolver> | null = null;

export function getResolver(options?: ResolverOptions): Promise<Resolver> {
  if (!resolverPromise) resolverPromise = loadResolver(options);
  return resolverPromise;
}

// setResolver injects a prebuilt resolver, bypassing the WASM loader. Hosts that
// build the resolver their own way (a Node/SSR loader, a custom asset flow, the
// test suite) supply {versions, dispatch} directly; subsequent run()/versions()
// calls reuse it. Pass null to reset back to lazy WASM loading.
export function setResolver(resolver: Resolver | null): void {
  resolverPromise = resolver ? Promise.resolve(resolver) : null;
}

export async function versions(options?: ResolverOptions): Promise<ResolverVersions> {
  return (await getResolver(options)).versions;
}

// link the emitted entry modules into the root tuple. Each module is
// `export const __rt_X = [...]` possibly preceded by `import { __rt_dep } …`;
// deps ride lazy thunks (slot 1) so concatenating every const into one scope
// and returning the root binding is enough — no TDZ on the lazy references.
function linkRootTuple(entryModules: Record<string, string>, binding: string): unknown {
  const parts: string[] = [];
  for (const src of Object.values(entryModules)) {
    parts.push(src.replace(/^\s*import[^;]*;\s*$/gm, '').replace(/^\s*export\s+const/gm, 'const'));
  }
  parts.push(`\nreturn ${binding};`);
  return new Function(parts.join('\n'))();
}

// How the editor's snippet defines the type: a TS type `MyType` (the call site
// is `<factory><MyType>()`), a value-first `const MyType = ...` schema built
// from ts-runtypes/schema + ts-runtypes/formats, or a JSON Schema 2020-12
// document through `const MyType = runTypeFromJsonSchema({…} as const)`. The
// last two share the value-first call shape (`<factory>(MyType)`), so the
// engine treats every non-'type' mode identically — the difference is only
// which preset source the editor shows.
export type Mode = 'type' | 'schema' | 'jsonSchema';

// factoryImport renders the import line the playground shows around a snippet —
// the same `import { <factory> } from '@ts-runtypes/core'` the engine prepends before
// resolving (see `scan` below), surfaced verbatim so the type column can display
// the real surrounding code the user would write.
export function factoryImport(factory: string): string {
  return `import { ${factory} } from '@ts-runtypes/core';`;
}

// factoryCall renders the call line: `const <varName> = <factory><MyType>()` in
// type mode, `const <varName> = <factory>(MyType)` in schema mode. When
// `injectedArg` is given (a `__rt_<…>` binding), it is appended as the trailing
// argument — exactly how the build plugin rewrites the call site (a 0-arg
// `createValidateFn<T>()` becomes `createValidateFn<T>(__rt_…)`; the value-first
// `createValidateFn(MyType)` becomes `createValidateFn(MyType, __rt_…)`).
//
// `options` is the comptime `{strategy: '…'}` literal a JSON en/decoder call
// carries. It rides the options slot: in schema mode after the schema
// (`createJsonEncoderFn(MyType, {strategy: 'mutate'})`); in type mode after an
// explicit `undefined` for the value slot (`createJsonEncoderFn<MyType>(undefined,
// {strategy: 'mutate'})`), matching the canonical call shape.
export function factoryCall(factory: string, varName: string, mode: Mode, injectedArg?: string | null, options?: string): string {
  const args: string[] = [];
  if (mode !== 'type') {
    args.push(ROOT_TYPE);
    if (options) args.push(options);
    if (injectedArg) args.push(injectedArg);
    return `const ${varName} = ${factory}(${args.join(', ')});`;
  }
  if (options) args.push('undefined', options);
  if (injectedArg) args.push(injectedArg);
  return `const ${varName} = ${factory}<${ROOT_TYPE}>(${args.join(', ')});`;
}

// pickFactorySite returns the site for the engine's appended factory call — the
// one with the highest source position. See the `site:` note in scan(): a
// value-first schema snippet emits an extra reflection site for its own
// `const MyType = RT.object(...)` builder that must not be mistaken for the
// factory call site.
function pickFactorySite(sites: ScanResult['site'][]): ScanResult['site'] {
  let best: ScanResult['site'] = null;
  for (const site of sites) {
    if (!site) continue;
    if (!best || Number(site.pos ?? 0) > Number(best.pos ?? 0)) best = site;
  }
  return best;
}

function scan(
  dispatch: Resolver['dispatch'],
  factory: string,
  userCode: string,
  mode: Mode = 'type',
  options?: string
): ScanResult {
  // Only the factory import is injected; the user snippet writes its own
  // `import * as RT from '@ts-runtypes/core/schema'` / `import type { … } from
  // '@ts-runtypes/core/formats'`, so the imports read like real code (and aren't
  // duplicated). `options` (a JSON strategy literal) rides the options slot so
  // its comptime value is folded into the injected fn hash — see factoryCall.
  const args = mode !== 'type' ? [ROOT_TYPE] : [];
  if (options) args.push(mode !== 'type' ? options : `undefined, ${options}`);
  const call = mode !== 'type' ? `${factory}(${args.join(', ')});` : `${factory}<${ROOT_TYPE}>(${args.join(', ')});`;
  const source = [`import { ${factory} } from '@ts-runtypes/core';`, userCode, call, ''].join('\n');
  dispatch({op: 'setSources', sources: {...runtypesPackageSources(), [FILE]: source}});
  const result = dispatch({op: 'scanFiles', files: [FILE], includeRunTypes: true, includeEntryModules: true});
  const sites = (result.sites as ScanResult['site'][]) ?? [];
  return {
    // The factory call is appended LAST, so its site has the highest source
    // position. Pick it, not sites[0]: in schema mode a value-first snippet's
    // own `const MyType = RT.object(...)` carries its OWN reflection marker
    // (the builder's InjectRunTypeId `id` param) and emits an earlier site — the
    // one we must NOT link against (it's the runtype facade, not the factory).
    site: pickFactorySite(sites),
    entryModules: (result.entryModules as Record<string, string>) ?? {},
    runTypes: (result.runTypes as RunTypeNode[]) ?? [],
    diagnostics: (result.diagnostics as Diagnostic[]) ?? [],
  };
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((d) =>
      `${String(d.severity ?? d.Severity ?? '').toUpperCase()} ${d.code ?? d.Code ?? ''}: ${d.message ?? d.Message ?? ''}`.trim()
    )
    .join('\n');
}

interface LinkedEntry {
  tuple: unknown[];
  diagnostics: Diagnostic[];
}

// linkEntry scans <factory><MyType>(), links the emitted entry modules, and
// returns the root tuple. The binding is `__rt_<fnId>_<id>` for type-fn families
// (validate / encoders / …) and `__rt_<id>` for reflection ones (createMockDataFn /
// getRunTypeId), which inject a facade tuple with no fnId. `options` selects the
// JSON strategy (folded into the fnId), so each strategy links its own entry.
function linkEntry(
  dispatch: Resolver['dispatch'],
  factory: string,
  userCode: string,
  mode: Mode = 'type',
  options?: string
): LinkedEntry {
  const {site, entryModules, diagnostics} = scan(dispatch, factory, userCode, mode, options);
  if (!site) {
    throw new Error(
      `${factory}<…>() produced no call site. Check that the snippet compiles and defines ${ROOT_TYPE}.` +
        (diagnostics.length ? `\n${formatDiagnostics(diagnostics)}` : '')
    );
  }
  const binding = site.fnId ? `__rt_${site.fnId}_${site.id}` : `__rt_${site.id}`;
  const tuple = linkRootTuple(entryModules, binding) as unknown[];
  return {tuple, diagnostics};
}

interface Materialized {
  fn: (...args: unknown[]) => unknown;
  diagnostics: Diagnostic[];
}

// materialize a live function by handing the linked root tuple to the public
// ts-runtypes factory. validate/encoders/mock all take the injected tuple in the
// trailing (3rd) arg slot — the runtime signature is (value, options, id). The
// JSON strategy is already baked into the tuple's fnId at scan time, so the
// runtime options slot stays undefined.
function materialize(
  dispatch: Resolver['dispatch'],
  factory: string,
  userCode: string,
  mode: Mode = 'type',
  options?: string
): Materialized {
  const {tuple, diagnostics} = linkEntry(dispatch, factory, userCode, mode, options);
  const fn = factories[factory](undefined, undefined, tuple) as Materialized['fn'];
  return {fn, diagnostics};
}

// transformedSource returns the file the build plugin actually produces for the
// selected factory: the resolver's real transform of `import … / <type> / const
// … = <factory>…()`. That is the injected `import { __rt_… } from 'rtmod:/…'`
// block plus the call rewritten with its trailing `__rt_…` argument — shown
// verbatim in the type column's "after build" view so the edits the plugin makes
// on top of the generated code are visible. Falls back to the untransformed
// source when nothing resolves (e.g. the snippet does not compile yet).
export async function transformedSource(
  factory: string,
  varName: string,
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type',
  fnOptions?: string
): Promise<string> {
  const {dispatch} = await getResolver(options);
  const source = [
    factoryImport(factory),
    '',
    userCode.trimEnd(),
    '',
    factoryCall(factory, varName, mode, undefined, fnOptions),
  ].join('\n');
  dispatch({op: 'setSources', sources: {...runtypesPackageSources(), [FILE]: source}});
  const result = dispatch({op: 'transform', files: [FILE]});
  const code = (result.transformed as Record<string, {code?: string}> | undefined)?.[FILE]?.code;
  if (typeof code !== 'string') return source;
  // The rewrite slot-fills the factory's optional parameters with `undefined`
  // before the injected `__rt_…` id. Type-first passes no value/options so the
  // padding is leading — `createValidateFn<MyType>(undefined, __rt_…)`; value-first
  // passes the schema so the padding is the `options` slot between it and the id
  // — `createJsonEncoderFn(MyType, undefined, __rt_…)`. Drop that padding either
  // way so the call reads like the code a user writes (`…(__rt_…)` /
  // `…(MyType, __rt_…)`). Scope the cleanup to the factory call itself (the last
  // non-empty line) so it can never touch user code with the same shape.
  const lines = code.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      lines[i] = lines[i].replace(/([(,])\s*(?:undefined,\s*)+(__rt_[A-Za-z0-9_]+)\)/g, (_m, sep: string, id: string) =>
        sep === ',' ? `, ${id})` : `(${id})`
      );
      break;
    }
  }
  return lines.join('\n').trimEnd();
}

// A single generated cache module: the virtual-module specifier the transformed
// file (or a sibling cache) imports, plus its `export const __rt_… = […]` source.
export interface CacheModule {
  name: string; // e.g. `rtmod:/fns/jdST.js`
  code: string;
}

// generatedCache returns the generated cache modules for this factory + type —
// one entry per family module the resolver emits (ModuleMode allSingle = one per
// family tag). A single-function type is one module; a JSON/binary codec is a few
// (the composite + the primitives it looks up at runtime), which import each
// other — the UI labels each with its module name and keeps the imports so the
// cross-module structure is visible. For reflection (getRunType) it is the single
// runtype data bundle.
export async function generatedCache(
  factory: string,
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type',
  fnOptions?: string
): Promise<CacheModule[]> {
  const {dispatch} = await getResolver(options);
  const {entryModules} = scan(dispatch, factory, userCode, mode, fnOptions);
  return Object.entries(entryModules).map(([basename, code]) => ({name: `rtmod:/${basename}.js`, code: code.trim()}));
}

// mock generates a random value for the type via createMockDataFn (the same
// generator MockData feeds). Returns the value plus any diagnostics.
export async function mock(
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<{value: unknown; diagnostics: Diagnostic[]}> {
  const {dispatch} = await getResolver(options);
  const {fn, diagnostics} = materialize(dispatch, 'createMockDataFn', userCode, mode);
  return {value: fn(), diagnostics};
}

// mockInvalid generates a value that FAILS validation via the core createMockDataFn
// `invalid` option (a valid mock with one type-aware position corrupted; see
// invalidLeafProbability). It additionally verifies against the live validator and
// retries, so the rare position the core can't make invalid on its own (a
// multi-type union arm, `any`) is caught here. Falls back to the last attempt when
// nothing in the budget is found invalid (e.g. an `any` / `unknown` type).
export async function mockInvalid(
  userCode: string,
  options?: ResolverOptions,
  mode: Mode = 'type',
  invalidLeafProbability = 0.85
): Promise<{value: unknown; diagnostics: Diagnostic[]}> {
  const {dispatch} = await getResolver(options);
  const validate = materialize(dispatch, 'createValidateFn', userCode, mode).fn as (v: unknown) => boolean;
  const {fn: generate, diagnostics} = materialize(dispatch, 'createMockDataFn', userCode, mode);
  const callOpts = {mock: {invalid: true, invalidLeafProbability}};
  let last: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    last = generate(callOpts);
    if (!validate(last)) return {value: last, diagnostics};
  }
  return {value: last, diagnostics};
}

// Cap on nodes emitted by one projection. Inlining turns a DAG back into a
// tree, so a type that reuses the same sub-shape at every level (`type L2 =
// {a: L1; b: L1}`, nested) expands exponentially. The budget keeps a pasted
// snippet from hanging the browser; a normal type never comes close.
const MAX_TREE_NODES = 5000;

// A live RunType node — an object carrying a string id and a kind. Distinguishes
// child slots (which must be walked) from plain data fields on a node.
function isRunTypeLike(value: unknown): value is RunTypeNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return typeof (value as RunTypeNode).id === 'string' && 'kind' in value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// runTypeTree projects the live, knotted RunType graph into a JSON-safe tree
// descending from `node`: every child slot holds the ACTUAL child node, inlined,
// mirroring what the graph looks like in memory. Structural sharing therefore
// prints more than once (`name: string` and `tags: string[]`'s element are the
// same node object) — that is faithful, not a duplicate.
//
// The single exception is a back-edge: a node already on the current ancestor
// path is a real reference cycle (`type Node = {children: Node[]}`) and inlining
// it would never terminate, so it renders as `{id, kind, circular: true}`.
function runTypeTree(node: RunTypeNode, path: Set<unknown>, budget: {left: number}): RunTypeTreeNode {
  if (path.has(node)) return {id: node.id, kind: node.kind, circular: true};
  if (budget.left <= 0) return {id: node.id, kind: node.kind, truncated: true};
  budget.left--;
  path.add(node);
  const projected: RunTypeTreeNode = {id: node.id, kind: node.kind};
  for (const [key, value] of Object.entries(node)) {
    // The cache factory pre-declares every slot, so most are undefined holes.
    if (value === undefined) continue;
    projected[key] = projectValue(value, path, budget);
  }
  path.delete(node);
  return projected;
}

// projectValue renders one field of a node: RunType slots recurse, arrays and
// plain objects are walked (a slot can nest nodes), and the values JSON cannot
// carry (bigint / symbol / regexp literals) become their source-ish text.
function projectValue(value: unknown, path: Set<unknown>, budget: {left: number}): unknown {
  if (isRunTypeLike(value)) return runTypeTree(value, path, budget);
  if (Array.isArray(value)) return value.map((item) => projectValue(item, path, budget));
  if (isPlainObject(value)) {
    const projected: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      projected[key] = projectValue(item, path, budget);
    }
    return projected;
  }
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof RegExp) return value.toString();
  if (typeof value === 'function') return undefined;
  return value;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value; // createBinaryEncoderFn returns a Uint8Array view
  return new Uint8Array(value as ArrayBuffer);
}

// run executes the chosen operation. `input` is the parsed JS value (may be
// undefined for ops that take no input). `mode` selects the TS-type vs schema form.
export async function run(
  opKey: string,
  userCode: string,
  input?: unknown,
  options?: ResolverOptions,
  mode: Mode = 'type'
): Promise<RunResult> {
  const {dispatch} = await getResolver(options);
  const op = operationByKey(opKey);

  switch (op.kind) {
    case 'graph': {
      // Reflect through the REAL runtime rather than reading the resolver's
      // scan output: link the emitted entry module and call getRunType, so the
      // playground shows the live, knotted node a user gets from
      // `getRunType<MyType>()` in their own app. The scan's `runTypes` is the
      // flat build-time wire dump feeding that link — its child slots are
      // `{id, kind: -1}` sentinels only because JSON cannot carry references,
      // which is exactly what the runtime re-knots on registration.
      // `getRunType` covers both modes: type-first via `getRunType<MyType>()`,
      // value-first via the `(schema: RunType<T>)` overload.
      const {site, entryModules, runTypes, diagnostics} = scan(dispatch, 'getRunType', userCode, mode);
      if (!site) {
        throw new Error(
          `getRunType<…>() produced no call site. Check that the snippet compiles and defines ${ROOT_TYPE}.` +
            (diagnostics.length ? `\n${formatDiagnostics(diagnostics)}` : '')
        );
      }
      const binding = site.fnId ? `__rt_${site.fnId}_${site.id}` : `__rt_${site.id}`;
      const tuple = linkRootTuple(entryModules, binding);
      const root = RT.getRunType(undefined, tuple as never) as RunTypeNode;
      const tree = runTypeTree(root, new Set(), {left: MAX_TREE_NODES});
      return {op, kind: 'graph', rootId: root.id, root, tree, runTypes, diagnostics};
    }
    case 'predicate': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      return {op, kind: 'predicate', value: Boolean(fn(input)), diagnostics};
    }
    case 'errors': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      return {op, kind: 'errors', value: fn(input) as unknown[], diagnostics};
    }
    case 'encode': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode, op.options);
      return {op, kind: 'encode', value: fn(input), diagnostics};
    }
    case 'jsonRoundtrip': {
      // The intermediate encoder uses `encodeOptions` (e.g. mutate, so undeclared
      // keys reach the wire); the decoder uses `options` (preserve vs strip) — the
      // pair is what the two decode entries demonstrate against the same input.
      const enc = materialize(dispatch, 'createJsonEncoderFn', userCode, mode, op.encodeOptions);
      const dec = materialize(dispatch, 'createJsonDecoderFn', userCode, mode, op.options);
      const encoded = enc.fn(input);
      const decoded = dec.fn(encoded);
      return {op, kind: 'jsonRoundtrip', encoded, decoded, diagnostics: dec.diagnostics};
    }
    case 'binaryEncode': {
      const {fn, diagnostics} = materialize(dispatch, op.factory, userCode, mode);
      const bytes = asBytes(fn(input));
      return {op, kind: 'binaryEncode', byteLength: bytes.length, hex: toHex(bytes), diagnostics};
    }
    case 'binaryRoundtrip': {
      const enc = materialize(dispatch, 'createBinaryEncoderFn', userCode, mode);
      const dec = materialize(dispatch, 'createBinaryDecoderFn', userCode, mode);
      const bytes = asBytes(enc.fn(input));
      const decoded = dec.fn(bytes);
      return {op, kind: 'binaryRoundtrip', byteLength: bytes.length, hex: toHex(bytes), decoded, diagnostics: dec.diagnostics};
    }
    default:
      throw new Error(`unknown operation kind: ${String(op.kind)}`);
  }
}
