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
import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
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

const ENCODER_TAGS = new Set(['jeCL', 'jeMU']);
const DECODER_TAGS = new Set(['jdCL', 'jdMU']);

export type WiredFns = {
  validate?: (v: unknown) => boolean;
  getValidationErrors?: (v: unknown) => unknown[];
  jsonEncode?: (v: unknown) => string | undefined;
  jsonDecode?: (s: string) => unknown;
  compactEncode?: (v: unknown) => string | undefined;
  compactDecode?: (s: string) => unknown;
  /** The REAL product mock for this type, with nonDataTypes on so a value
   *  carries the stripped members. Not part of FN_KEYS — it's the value source
   *  for the behaviour tier, not a serialization factory the oracles police. **/
  mock?: () => unknown;
};

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
}

export function openClient(): ResolverClient {
  if (!hasBinary()) throw new Error(`mion binary not built: ${BIN}`);
  return new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
}

/** Render the full fixture: import block, named decls, `type T = root`, and one
 *  call site per family + the getRunTypeId reflection site. **/
export function renderFixture(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen);
  return `import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  getRunTypeId,
} from '@mionjs/run-types';
${decls}
type T = ${rootExpr};
createValidateFn<T>();
createGetValidationErrorsFn<T>();
createJsonEncoderFn<T>();
createJsonDecoderFn<T>();
createJsonEncoderFn<T>(undefined, {strategy: 'compact'});
createJsonDecoderFn<T>(undefined, {strategy: 'compact'});
getRunTypeId<T>();
`;
}

/** Drive the full pipeline for one generated type. Never throws — every failure
 *  mode is captured on the result. **/
export async function compileType(client: ResolverClient, gen: GeneratedType): Promise<CompiledType> {
  const source = renderFixture(gen);
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
  };

  let resp;
  try {
    // The whole src/ tree rides along so the fixture preamble's `./src/...`
    // imports (the SHIPPED format brands) resolve inside the resolver's
    // virtual filesystem — no hand-written brand stand-ins (SRC_OVERLAY above).
    await client.setSources({...SRC_OVERLAY, ...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
    resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  } catch (err) {
    return {...base, resolverError: errMsg(err)};
  }

  const diagnostics = resp.diagnostics ?? [];
  const sites = resp.sites ?? [];
  const fnSites = sites.filter((s) => s.fnId);
  const reflectionSites = sites.filter((s) => !s.fnId);
  const entryModules = resp.entryModules ?? {};
  const partial: CompiledType = {
    ...base,
    diagnostics,
    errorDiagnostics: diagnostics.filter((d) => d.severity === Severity.Error),
    warningDiagnostics: diagnostics.filter((d) => d.severity === Severity.Warning),
    sites,
    fnSiteCount: fnSites.length,
    reflectionSiteCount: reflectionSites.length,
    entryModuleCount: Object.keys(entryModules).length,
  };

  // Evaluating the emitted modules executes the generated factory code (catches
  // invalid-JS emit); instantiateRunTypes knots the reflection graph (catches
  // dangling refs). Either throwing is a finding.
  let tuples: Record<string, readonly unknown[]>;
  try {
    tuples = evalEntryModules(entryModules);
    instantiateRunTypes(tuples);
  } catch (err) {
    return {...partial, evalError: errMsg(err)};
  }

  // Wire each factory independently. A non-serialisable type degrades to an
  // alwaysThrow factory that may throw a CONTROLLED error here — captured per
  // family rather than aborting (the runner decides if that's expected).
  const byFamily = classifyFnSites(fnSites, tuples);
  const wired: WiredFns = {};
  const wireErrors: CompiledType['wireErrors'] = {};
  wire(
    wired,
    wireErrors,
    'validate',
    () => createValidateFn(undefined, undefined, byFamily.val as never) as WiredFns['validate']
  );
  wire(
    wired,
    wireErrors,
    'getValidationErrors',
    () => createGetValidationErrorsFn(undefined, undefined, byFamily.verr as never) as WiredFns['getValidationErrors']
  );
  wire(
    wired,
    wireErrors,
    'jsonEncode',
    () => createJsonEncoderFn(undefined, undefined, byFamily.jenc as never) as WiredFns['jsonEncode']
  );
  wire(
    wired,
    wireErrors,
    'jsonDecode',
    () => createJsonDecoderFn(undefined, undefined, byFamily.jdec as never) as WiredFns['jsonDecode']
  );
  wire(
    wired,
    wireErrors,
    'compactEncode',
    () => createJsonEncoderFn(undefined, undefined, byFamily.jencCO as never) as WiredFns['compactEncode']
  );
  wire(
    wired,
    wireErrors,
    'compactDecode',
    () => createJsonDecoderFn(undefined, undefined, byFamily.jdecCO as never) as WiredFns['compactDecode']
  );

  // Mock value source — the REAL createMockDataFn driven off the reflection ENTRY
  // TUPLE (the per-root facade, basename === the reflection site id). Passing
  // the tuple mirrors what the plugin injects in production: createMockDataFn runs
  // initFromTuple itself, linking the reflection runtype graph into the live
  // rtUtils, then resolves the root by id. (The six function factories register
  // their own demand-driven caches, not the reflection bundle, so the id alone
  // isn't enough.) nonDataTypes:true makes the value carry the stripped members
  // so the encoders exercise their drop / fail paths.
  const reflectionId = reflectionSites[0]?.id;
  const reflectionTuple = reflectionId !== undefined ? tuples[reflectionId] : undefined;
  if (reflectionTuple !== undefined) {
    wire(wired, wireErrors, 'mock', () => {
      const mockFn = createMockDataFn(undefined, {mock: {nonDataTypes: true}}, reflectionTuple as never);
      return (() => mockFn()) as WiredFns['mock'];
    });
  }

  return {...partial, wired, wireErrors};
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

interface FamilyTuples {
  val?: readonly unknown[];
  verr?: readonly unknown[];
  jenc?: readonly unknown[];
  jdec?: readonly unknown[];
  jencCO?: readonly unknown[];
  jdecCO?: readonly unknown[];
}

function classifyFnSites(fnSites: Site[], tuples: Record<string, readonly unknown[]>): FamilyTuples {
  const out: FamilyTuples = {};
  for (const site of fnSites) {
    const tuple = tuples[`${site.fnId}_${site.id}`];
    if (!tuple) continue;
    const tag = tuple[0];
    if (tag === 'val') out.val = tuple;
    else if (tag === 'verr') out.verr = tuple;
    else if (tag === 'jeCO') out.jencCO = tuple;
    else if (tag === 'jdCO') out.jdecCO = tuple;
    else if (typeof tag === 'string' && ENCODER_TAGS.has(tag)) out.jenc = tuple;
    else if (typeof tag === 'string' && DECODER_TAGS.has(tag)) out.jdec = tuple;
  }
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
