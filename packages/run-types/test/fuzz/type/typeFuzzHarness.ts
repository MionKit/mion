// Phase 2 harness — turn a generated type into REAL compiled runtime functions
// by driving the actual resolver → plugin → runtime pipeline, and collect
// everything the oracles need:
//
//   render `.ts` source (named decls + `type T = …` + one call site per family)
//     → ResolverClient (serve --sources ops) setSources + scanFiles
//     → entryModules (the per-entry virtual modules the plugin would serve)
//     → evalEntryModules (execute them into their positional tuples)
//     → pass each fn tuple as the injected id to the REAL createX factory
//       (createValidateFn(undefined, undefined, tuple) → initFromTuple links the
//        whole dependency closure into the live rtUtils).
//
// Crucially this is run on the WIDEST type space (typeGen.ts) — classes,
// functions, symbols, index signatures, native builtins, circular types, etc.
// Many of those are non-serialisable: the resolver emits Error-severity
// diagnostics and the factories degrade to `alwaysThrow` (which may throw a
// CONTROLLED error when wired or called). That is the contract working, not a
// bug — so the harness records the diagnostics + per-factory wire outcome and
// lets the runner pick the right oracle tier from them.

import path from 'node:path';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createRemoveUnknownKeysFn,
  type RemoveUnknownKeysFn,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {ResolverClient} from '../../../../devtools/src/core/resolver-client.ts';
import {
  MARKER_PACKAGE_OVERLAY,
  evalEntryModules,
  instantiateRunTypes,
  BIN,
  hasBinary,
} from '../../../../devtools/test/helpers/inline.ts';
import {Severity, type Diagnostic, type Site} from '../../../../devtools/src/core/protocol.ts';
import {readFileSync, readdirSync} from 'node:fs';
import {renderGenerated, describeType, type GeneratedType} from '../core/typeGen.ts';
import type {FuzzTarget} from '../value/fuzzOracle.ts';

export {hasBinary, BIN};

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const FIXTURE = 'g.ts';

// The resolver's serve/ops mode builds its program from the setSources keys
// alone — a pure virtual filesystem — so a fixture cannot import the shipped
// sources off disk. This is a WORKAROUND for that, not a mechanism to build
// on: read the real `src/` tree once and hand it over whole, so fixture
// imports like `./src/formats/index.ts` resolve to the shipped sources.
//
// ⚠️ THE RULE: fixtures always use the real shipped types, imported — never
// hand-write a stand-in. A hand copy does not fail when the shipped type
// changes; it silently keeps testing the old shape, which is the one failure
// mode a fuzz suite cannot afford. The few tolerated, pinned exceptions
// (fixtures in scratch temp dirs where no import can resolve) are listed in
// "Real types, never copies" in test/fuzz/README.md. (`src/` imports nothing
// non-relative, so the graph closes with no further stubs.)
const SRC_ROOT = path.resolve(__dirname, '../../../src');
function readSrcTree(dir: string, prefix: string, into: Record<string, string>): void {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) readSrcTree(abs, `${prefix}${entry.name}/`, into);
    else if (entry.name.endsWith('.ts')) into[`src/${prefix}${entry.name}`] = readFileSync(abs, 'utf8');
  }
}
/** Every `src/**` file keyed by its path under `src/`, for `setSources`. Read
 *  once per process — the tree does not change mid-run. **/
export const SRC_OVERLAY: Readonly<Record<string, string>> = (() => {
  const overlay: Record<string, string> = {};
  readSrcTree(SRC_ROOT, '', overlay);
  return overlay;
})();

/** `mock` is the REAL product mock (nonDataTypes on), the behaviour tier's value source, so it is not in FN_KEYS. **/
export type WiredFns = Partial<
  Pick<
    FuzzTarget,
    'validate' | 'getValidationErrors' | 'jsonEncode' | 'jsonDecode' | 'compactEncode' | 'compactDecode' | 'mock'
  > & {
    mutateEncode: FuzzTarget['jsonEncode'];
    mutateDecode: FuzzTarget['jsonDecode'];
    removeUnknownKeys: RemoveUnknownKeysFn;
    /** `createValidateFn<DataOnly<T>>()`, which D4 holds against `validate`. **/
    validateDataOnly: FuzzTarget['validate'];
  }
>;

type FnKey = Exclude<keyof WiredFns, 'mock'>;
type FnFactory = (value: undefined, options: undefined, tuple: never) => unknown;

/** Entry-tuple tag to the function it builds and its factory. **/
const WIRED_BY_TAG: Partial<Record<string, [FnKey, FnFactory]>> = {
  val: ['validate', createValidateFn as FnFactory],
  verr: ['getValidationErrors', createGetValidationErrorsFn as FnFactory],
  jeCL: ['jsonEncode', createJsonEncoderFn as FnFactory],
  jdCL: ['jsonDecode', createJsonDecoderFn as FnFactory],
  jeCO: ['compactEncode', createJsonEncoderFn as FnFactory],
  jdCO: ['compactDecode', createJsonDecoderFn as FnFactory],
  jeMU: ['mutateEncode', createJsonEncoderFn as FnFactory],
  jdMU: ['mutateDecode', createJsonDecoderFn as FnFactory],
  ruk: ['removeUnknownKeys', createRemoveUnknownKeysFn as FnFactory],
};

/** The compiled functions every fixture has a call site for; the second `val` site is the DataOnly one. **/
export const FN_KEYS: FnKey[] = [...Object.values(WIRED_BY_TAG).map((wiring) => wiring![0]), 'validateDataOnly'];

/** What the fixture's `DataOnly<T>` sites name: the shipped type, or a stand-in a negative control declares. **/
export interface DataOnlySpelling {
  name: string;
  decl?: string;
}
const SHIPPED_DATA_ONLY: DataOnlySpelling = {name: 'DataOnly'};

type FnSites = Partial<Record<FnKey, {site: Site; tuple: readonly unknown[]}>>;

export interface CompiledType {
  gen: GeneratedType;
  title: string;
  source: string;
  // --- resolver / emit observations ---
  diagnostics: Diagnostic[];
  errorDiagnostics: Diagnostic[];
  warningDiagnostics: Diagnostic[];
  sites: Site[];
  fnSiteCount: number;
  reflectionSiteCount: number;
  entryModuleCount: number;
  resolverError?: string;
  evalError?: string;
  // --- factory wiring ---
  /** The factories that materialised without throwing. **/
  wired: WiredFns;
  /** Per-family controlled wire failures (alwaysThrow factories may throw). **/
  wireErrors: Partial<Record<keyof WiredFns, string>>;
  /** The line of each function's call site in `source`, where its diagnostics are reported. **/
  siteLines: Partial<Record<keyof WiredFns, number>>;
  /** The reflection ids of `getRunTypeId<T>()` and `getRunTypeId<DataOnly<T>>()`. **/
  reflectionIds: {type?: string; dataOnly?: string};
}

export function openClient(): ResolverClient {
  if (!hasBinary()) throw new Error(`mion binary not built: ${BIN}`);
  return new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
}

/** Render the full fixture: import block, named decls, `type T = root`, and one
 *  call site per family + the getRunTypeId reflection site. **/
export function renderFixture(gen: GeneratedType, dataOnly: DataOnlySpelling = SHIPPED_DATA_ONLY): string {
  const {decls, rootExpr} = renderGenerated(gen);
  return `import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createRemoveUnknownKeysFn,
  getRunTypeId,
  type DataOnly,
} from '@mionjs/run-types';
${decls}${dataOnly.decl ? `\n${dataOnly.decl}` : ''}
type T = ${rootExpr};
createValidateFn<T>();
createGetValidationErrorsFn<T>();
createJsonEncoderFn<T>();
createJsonDecoderFn<T>();
createJsonEncoderFn<T>(undefined, {strategy: 'compact'});
createJsonDecoderFn<T>(undefined, {strategy: 'compact'});
createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
createJsonDecoderFn<T>(undefined, {strategy: 'mutate'});
createRemoveUnknownKeysFn<T>();
getRunTypeId<T>();
createValidateFn<${dataOnly.name}<T>>();
getRunTypeId<${dataOnly.name}<T>>();
`;
}

/** Drive the full pipeline for one generated type. Never throws — every failure
 *  mode is captured on the result. **/
export async function compileType(
  client: ResolverClient,
  gen: GeneratedType,
  dataOnly: DataOnlySpelling = SHIPPED_DATA_ONLY
): Promise<CompiledType> {
  const source = renderFixture(gen, dataOnly);
  const title = describeType(gen);
  const base: CompiledType = {
    gen,
    title,
    source,
    diagnostics: [],
    errorDiagnostics: [],
    warningDiagnostics: [],
    sites: [],
    fnSiteCount: 0,
    reflectionSiteCount: 0,
    entryModuleCount: 0,
    wired: {},
    wireErrors: {},
    siteLines: {},
    reflectionIds: {},
  };

  let resp;
  try {
    // src/ goes along so the preamble's `./src/...` imports resolve to the SHIPPED format brands, no stand-ins.
    await client.setSources({...SRC_OVERLAY, ...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
    resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  } catch (err) {
    return {...base, resolverError: errMsg(err)};
  }

  const diagnostics = resp.diagnostics ?? [];
  const sites = resp.sites ?? [];
  // Source order tells the two `val` sites and the two reflection sites apart.
  const fnSites = sites.filter((s) => s.fnId).sort((a, b) => a.pos - b.pos);
  const reflectionSites = sites.filter((s) => !s.fnId).sort((a, b) => a.pos - b.pos);
  const entryModules = resp.entryModules ?? {};
  const partial: CompiledType = {
    ...base,
    diagnostics,
    errorDiagnostics: diagnostics.filter((d) => d.severity === Severity.Error),
    // A dropped member is Info, and the oracles only care that something was dropped.
    warningDiagnostics: diagnostics.filter((d) => d.severity === Severity.Warning || d.severity === Severity.Info),
    sites,
    fnSiteCount: fnSites.length,
    reflectionSiteCount: reflectionSites.length,
    entryModuleCount: Object.keys(entryModules).length,
  };

  // Evaluating catches invalid-JS emit, instantiateRunTypes catches dangling refs; either throwing is a finding.
  let tuples: Record<string, readonly unknown[]>;
  try {
    tuples = evalEntryModules(entryModules);
    instantiateRunTypes(tuples);
  } catch (err) {
    return {...partial, evalError: errMsg(err)};
  }

  // An alwaysThrow factory may throw a controlled error here: record it per family, the runner decides if it is expected.
  const byKey = classifyFnSites(fnSites, tuples);
  const wired: WiredFns = {};
  const wireErrors: CompiledType['wireErrors'] = {};
  const siteLines: CompiledType['siteLines'] = {};
  // Site positions are UTF-8 byte offsets; lines break where TypeScript's do.
  const sourceBytes = Buffer.from(source, 'utf8');
  for (const [key, {site}] of Object.entries(byKey) as [FnKey, {site: Site}][]) {
    siteLines[key] = sourceBytes
      .subarray(0, site.pos)
      .toString('utf8')
      .split(/\r\n|[\n\r\u2028\u2029]/).length;
  }
  for (const [key, factory] of Object.values(WIRED_BY_TAG) as [FnKey, FnFactory][]) {
    wire(wired, wireErrors, key, () => factory(undefined, undefined, byKey[key]?.tuple as never) as never);
  }
  const validateFactory = createValidateFn as FnFactory;
  wire(
    wired,
    wireErrors,
    'validateDataOnly',
    () => validateFactory(undefined, undefined, byKey.validateDataOnly?.tuple as never) as never
  );
  const reflectionIds = {type: reflectionSites[0]?.id, dataOnly: reflectionSites[1]?.id};

  // Pass the reflection entry tuple as the plugin does: the function factories' caches never link the reflection graph.
  // nonDataTypes:true makes the value carry the stripped members, so the encoders exercise their drop / fail paths.
  const reflectionId = reflectionSites[0]?.id;
  const reflectionTuple = reflectionId !== undefined ? tuples[reflectionId] : undefined;
  if (reflectionTuple !== undefined) {
    wire(wired, wireErrors, 'mock', () => {
      const mockFn = createMockDataFn(undefined, {mock: {nonDataTypes: true}}, reflectionTuple as never);
      return (() => mockFn()) as WiredFns['mock'];
    });
  }

  return {...partial, wired, wireErrors, siteLines, reflectionIds};
}

function wire<K extends keyof WiredFns>(
  wired: WiredFns,
  errs: CompiledType['wireErrors'],
  key: K,
  build: () => WiredFns[K]
): void {
  try {
    wired[key] = build();
  } catch (err) {
    errs[key] = errMsg(err);
  }
}

function classifyFnSites(fnSites: Site[], tuples: Record<string, readonly unknown[]>): FnSites {
  const out: FnSites = {};
  for (const site of fnSites) {
    const tuple = tuples[`${site.fnId}_${site.id}`];
    const tagged = tuple && typeof tuple[0] === 'string' ? WIRED_BY_TAG[tuple[0]]?.[0] : undefined;
    const key = tagged === 'validate' && out.validate ? 'validateDataOnly' : tagged;
    if (key) out[key] = {site, tuple};
  }
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
