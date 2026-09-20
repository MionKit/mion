// All-strategy round-trip harness — like the type/ harness, but the rendered
// fixture emits EVERY JSON codec strategy (clone / mutate / direct / compact)
// alongside binary, so one random type drives all six serialization lanes at
// once and the oracle can check they agree.
//
//   render `.ts` source (named decls + `type T = …` + one call site per codec)
//     → ResolverClient (serve --sources ops) setSources + scanFiles
//     → entryModules → evalEntryModules (execute into positional tuples)
//     → classify fn sites BY TUPLE TAG (jeCL/jeMU/jeDI/jeCO, jdST/jdPR/jdCO,
//       tb/fb, val) rather than by family — the strategy lives in the tag
//     → wire one REAL factory per codec by passing its tuple as the injected id.
//
// The default type/ harness keeps a fixed 6-site fixture (one default JSON
// encoder + decoder) and a shared classifier; it can't emit the strategy
// variants, so this lane forks the fixture + classifier while reusing the
// resolver client (openClient) and the low-level eval helpers.

import path from 'node:path';
import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
} from '@mionjs/run-types';
import {getRTFunction} from '@mionjs/run-types/runtime';
import {ResolverClient} from '../../../../devtools/src/core/resolver-client.ts';
import {MARKER_PACKAGE_OVERLAY, evalEntryModules, instantiateRunTypes} from '../../../../devtools/test/helpers/inline.ts';
import {Severity, type Diagnostic, type Site} from '../../../../devtools/src/core/protocol.ts';
import {renderGenerated, describeType, type GeneratedType} from '../core/typeGen.ts';
import {openClient, hasBinary, BIN, SRC_OVERLAY} from '../type/typeFuzzHarness.ts';

export {hasBinary, BIN, openClient};

const FIXTURE = 'g.ts';

/** One serialization lane the oracle round-trips. Each JSON lane pairs an
 *  encoder strategy with the decoder strategy that reads its wire:
 *    clone   → strip    (shape-derived keyed JSON)
 *    mutate  → preserve (in-place keyed JSON, the extras-preserving pair)
 *    direct  → strip    (single-pass keyed JSON; shares the strip decoder)
 *    compact → compact  (positional-array wire)
 *  `rebuild` reads the same clone wire with the rjs primitive, the decoder that
 *  rebuilds every object from the declared shape instead of walking it in place.
 *  It rides this oracle for one reason: a rebuild that DROPS a declared member
 *  still returns a plausible object, and only comparing thousands of shapes
 *  against the clone reference wire catches that.
 *  binary is the byte wire. **/
export type LaneId = 'clone' | 'mutate' | 'direct' | 'compact' | 'rebuild' | 'binary';

export const JSON_LANES: readonly LaneId[] = ['clone', 'mutate', 'direct', 'compact', 'rebuild'];
export const ALL_LANES: readonly LaneId[] = ['clone', 'mutate', 'direct', 'compact', 'rebuild', 'binary'];

/** A wired codec: encode returns a JSON string (or undefined for an undefined
 *  root) on the JSON lanes, a Uint8Array on the binary lane. **/
export interface WiredCodec {
  encode: (value: unknown) => unknown;
  decode: (wire: unknown) => unknown;
}

export interface CompiledCodecs {
  gen: GeneratedType;
  title: string;
  source: string;
  // --- resolver / emit observations ---
  diagnostics: Diagnostic[];
  errorDiagnostics: Diagnostic[];
  warningDiagnostics: Diagnostic[];
  fnSiteCount: number;
  resolverError?: string;
  evalError?: string;
  // --- wired factories ---
  validate?: (value: unknown) => boolean;
  /** Lanes whose encoder AND decoder wired. A lane missing here has its reason in `wireErrors`. **/
  codecs: Partial<Record<LaneId, WiredCodec>>;
  /** Why a lane (or validate) did not wire: its fn site is missing from the fixture's emit, or its
   *  factory threw (a non-serialisable type degrades to a controlled alwaysThrow). The runner reports
   *  every entry the same way, whichever lane it is. **/
  wireErrors: Partial<Record<LaneId | 'validate', string>>;
}

// One createX call site per codec strategy. Options is the SECOND positional
// arg (`createJsonEncoderFn<T>(undefined, {strategy})`) — passing it first makes
// it the value and silently defaults to clone. The Go side reads the strategy
// literal straight from the AST, so the tags resolve to jeCL/jeMU/jeDI/jeCO and
// jdST/jdPR/jdCO regardless of the inline d.ts overlay.
export function renderFixture(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen);
  return `import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  type InjectTypeFnArgs,
} from '@mionjs/run-types';
${decls}
type T = ${rootExpr};
createValidateFn<T>();
createJsonEncoderFn<T>(undefined, {strategy: 'clone'});
createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
createJsonEncoderFn<T>(undefined, {strategy: 'direct'});
createJsonEncoderFn<T>(undefined, {strategy: 'compact'});
createJsonDecoderFn<T>(undefined, {strategy: 'strip'});
createJsonDecoderFn<T>(undefined, {strategy: 'preserve'});
createJsonDecoderFn<T>(undefined, {strategy: 'compact'});
// rjs has no createX factory: a framework reaches it by naming the fnKey in its own
// marker, which is exactly what mion's route helper does for the clone strategy.
declare function recoverRebuild<R>(id?: InjectTypeFnArgs<R, 'restoreFromJsonClone'>): (wire: unknown) => unknown;
recoverRebuild<T>();
createBinaryEncoderFn<T>();
createBinaryDecoderFn<T>();
`;
}

/** Drive the full pipeline for one generated type. Never throws — every failure
 *  mode is captured on the result. **/
export async function compileCodecs(client: ResolverClient, gen: GeneratedType): Promise<CompiledCodecs> {
  const source = renderFixture(gen);
  const title = describeType(gen);
  const base: CompiledCodecs = {
    gen,
    title,
    source,
    diagnostics: [],
    errorDiagnostics: [],
    warningDiagnostics: [],
    fnSiteCount: 0,
    codecs: {},
    wireErrors: {},
  };

  let resp;
  try {
    // src/ rides along for the fixture preamble's shipped-brand imports (see
    // typeFuzzHarness.compileType).
    await client.setSources({...SRC_OVERLAY, ...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
    resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  } catch (err) {
    return {...base, resolverError: errMsg(err)};
  }

  const diagnostics = resp.diagnostics ?? [];
  const sites = resp.sites ?? [];
  const fnSites = sites.filter((s) => s.fnId);
  const entryModules = resp.entryModules ?? {};
  const partial: CompiledCodecs = {
    ...base,
    diagnostics,
    errorDiagnostics: diagnostics.filter((d) => d.severity === Severity.Error),
    warningDiagnostics: diagnostics.filter((d) => d.severity === Severity.Warning),
    fnSiteCount: fnSites.length,
  };

  let tuples: Record<string, readonly unknown[]>;
  try {
    tuples = evalEntryModules(entryModules);
    instantiateRunTypes(tuples);
  } catch (err) {
    return {...partial, evalError: errMsg(err)};
  }

  const byTag = classifyByTag(fnSites, tuples);
  const codecs: CompiledCodecs['codecs'] = {};
  const wireErrors: CompiledCodecs['wireErrors'] = {};

  const validate = wire(
    wireErrors,
    'validate',
    () => createValidateFn(undefined, undefined, tupleOrThrow(byTag, 'val') as never) as (v: unknown) => boolean
  );
  for (const lane of ALL_LANES) wireLane(codecs, wireErrors, lane, byTag);

  return {...partial, validate, codecs, wireErrors};
}

/** The fn-site tags each lane wires: the strip decoder reads both keyed wires, and rebuild reads the
 *  clone wire with the rjs primitive. **/
const LANE_TAGS: Record<LaneId, {encode: string; decode: string}> = {
  clone: {encode: 'jeCL', decode: 'jdST'},
  mutate: {encode: 'jeMU', decode: 'jdPR'},
  direct: {encode: 'jeDI', decode: 'jdST'},
  compact: {encode: 'jeCO', decode: 'jdCO'},
  rebuild: {encode: 'jeCL', decode: 'rjs'},
  binary: {encode: 'tb', decode: 'fb'},
};

// Index fn-site tuples by their slot-0 family tag (jeCL/jeMU/jeDI/jeCO, jdST/
// jdPR/jdCO, tb/fb, val). Each tag appears at most once in this fixture.
export function classifyByTag(fnSites: Site[], tuples: Record<string, readonly unknown[]>): Record<string, readonly unknown[]> {
  const out: Record<string, readonly unknown[]> = {};
  for (const site of fnSites) {
    const tuple = tuples[`${site.fnId}_${site.id}`];
    if (!tuple) continue;
    const tag = tuple[0];
    if (typeof tag === 'string') out[tag] = tuple;
  }
  return out;
}

export function wireDecoder(tuple: readonly unknown[] | undefined): ((wire: unknown) => unknown) | undefined {
  if (!tuple) return undefined;
  try {
    return createJsonDecoderFn(undefined, undefined, tuple as never) as (wire: unknown) => unknown;
  } catch {
    return undefined;
  }
}

// Wire one lane, both ends under the lane's own wire-error slot: a missing fn site and a throwing
// factory land there alike, so the lane is either in `codecs` or explained in `wireErrors`.
function wireLane(
  codecs: CompiledCodecs['codecs'],
  wireErrors: CompiledCodecs['wireErrors'],
  lane: LaneId,
  byTag: Record<string, readonly unknown[]>
): void {
  const codec = wire(wireErrors, lane, () => ({
    encode: buildEncoder(lane, tupleOrThrow(byTag, LANE_TAGS[lane].encode)),
    decode: buildDecoder(lane, tupleOrThrow(byTag, LANE_TAGS[lane].decode)),
  }));
  if (codec) codecs[lane] = codec;
}

function tupleOrThrow(byTag: Record<string, readonly unknown[]>, tag: string): readonly unknown[] {
  const tuple = byTag[tag];
  if (!tuple) throw new Error(`no ${tag} fn site resolved`);
  return tuple;
}

function buildEncoder(lane: LaneId, tuple: readonly unknown[]): (value: unknown) => unknown {
  if (lane === 'binary') return createBinaryEncoderFn(undefined, undefined, tuple as never) as (value: unknown) => unknown;
  return createJsonEncoderFn(undefined, undefined, tuple as never) as (value: unknown) => unknown;
}

// The composites parse the string themselves; the rjs primitive takes an already-parsed value.
function buildDecoder(lane: LaneId, tuple: readonly unknown[]): (wire: unknown) => unknown {
  if (lane === 'binary') return createBinaryDecoderFn(undefined, undefined, tuple as never) as (wire: unknown) => unknown;
  if (lane === 'rebuild') {
    const restore = getRTFunction<'restoreFromJsonClone'>(tuple);
    return (wire: unknown) => restore(JSON.parse(wire as string));
  }
  return createJsonDecoderFn(undefined, undefined, tuple as never) as (wire: unknown) => unknown;
}

// Build a factory, recording a throw as a wire error rather than aborting.
export function wire<R>(wireErrors: CompiledCodecs['wireErrors'], key: LaneId | 'validate', build: () => R): R | undefined {
  try {
    return build();
  } catch (err) {
    wireErrors[key] = errMsg(err);
    return undefined;
  }
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
