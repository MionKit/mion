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
} from '@ts-runtypes/core';
import {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';
import {RUNTYPES_DTS, evalEntryModules, instantiateRunTypes} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import {Severity, type Diagnostic, type Site} from '../../../../ts-runtypes-devtools/src/protocol.ts';
import {renderGenerated, describeType, type GeneratedType} from '../core/typeGen.ts';
import {openClient, hasBinary, BIN} from '../type/typeFuzzHarness.ts';
import {SRC_OVERLAY} from '../core/srcOverlay.ts';

export {hasBinary, BIN, openClient};

const FIXTURE = 'g.ts';

/** One serialization lane the oracle round-trips. Each JSON lane pairs an
 *  encoder strategy with the decoder strategy that reads its wire:
 *    clone   → strip    (shape-derived keyed JSON)
 *    mutate  → preserve (in-place keyed JSON, the extras-preserving pair)
 *    direct  → strip    (single-pass keyed JSON; shares the strip decoder)
 *    compact → compact  (positional-array wire)
 *  binary is the byte wire. **/
export type LaneId = 'clone' | 'mutate' | 'direct' | 'compact' | 'binary';

export const JSON_LANES: readonly LaneId[] = ['clone', 'mutate', 'direct', 'compact'];
export const ALL_LANES: readonly LaneId[] = ['clone', 'mutate', 'direct', 'compact', 'binary'];

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
  /** Lanes whose encoder AND decoder wired without throwing. A missing lane
   *  means a factory degraded to a controlled alwaysThrow at wire time. **/
  codecs: Partial<Record<LaneId, WiredCodec>>;
  /** Per-lane (or validate) controlled wire failures. **/
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
} from '@ts-runtypes/core';
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
createBinaryEncoderFn<T>();
createBinaryDecoderFn<T>();
`;
}

/** The 10 fn sites the fixture emits (1 validate + 4 encoders + 3 decoders + 2
 *  binary). No reflection site — values come from the shape generator, not a
 *  product mock. **/
export const EXPECTED_FN_SITES = 10;

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
    await client.setSources({...SRC_OVERLAY, 'runtypes.d.ts': RUNTYPES_DTS, [FIXTURE]: source});
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

  const validate = wire(wireErrors, 'validate', () =>
    byTag.val ? (createValidateFn(undefined, undefined, byTag.val as never) as (v: unknown) => boolean) : undefined
  );

  // strip decoder is shared by the clone and direct lanes (both emit keyed JSON).
  const stripDecode = wireDecoder(byTag.jdST);
  const preserveDecode = wireDecoder(byTag.jdPR);
  const compactDecode = wireDecoder(byTag.jdCO);

  wireLane(codecs, wireErrors, 'clone', byTag.jeCL, stripDecode);
  wireLane(codecs, wireErrors, 'mutate', byTag.jeMU, preserveDecode);
  wireLane(codecs, wireErrors, 'direct', byTag.jeDI, stripDecode);
  wireLane(codecs, wireErrors, 'compact', byTag.jeCO, compactDecode);
  wireBinaryLane(codecs, wireErrors, byTag.tb, byTag.fb);

  return {...partial, validate, codecs, wireErrors};
}

// Index fn-site tuples by their slot-0 family tag (jeCL/jeMU/jeDI/jeCO, jdST/
// jdPR/jdCO, tb/fb, val). Each tag appears at most once in this fixture.
function classifyByTag(fnSites: Site[], tuples: Record<string, readonly unknown[]>): Record<string, readonly unknown[]> {
  const out: Record<string, readonly unknown[]> = {};
  for (const site of fnSites) {
    const tuple = tuples[`${site.fnId}_${site.id}`];
    if (!tuple) continue;
    const tag = tuple[0];
    if (typeof tag === 'string') out[tag] = tuple;
  }
  return out;
}

function wireDecoder(tuple: readonly unknown[] | undefined): ((wire: unknown) => unknown) | undefined {
  if (!tuple) return undefined;
  try {
    return createJsonDecoderFn(undefined, undefined, tuple as never) as (wire: unknown) => unknown;
  } catch {
    return undefined;
  }
}

// Wire one JSON lane: a strategy encoder tuple + an already-wired decoder. The
// lane only registers when BOTH ends materialised.
function wireLane(
  codecs: CompiledCodecs['codecs'],
  wireErrors: CompiledCodecs['wireErrors'],
  lane: LaneId,
  encTuple: readonly unknown[] | undefined,
  decode: ((wire: unknown) => unknown) | undefined
): void {
  if (!encTuple || !decode) return;
  const encode = wire(
    wireErrors,
    lane,
    () => createJsonEncoderFn(undefined, undefined, encTuple as never) as (v: unknown) => unknown
  );
  if (encode) codecs[lane] = {encode, decode};
}

function wireBinaryLane(
  codecs: CompiledCodecs['codecs'],
  wireErrors: CompiledCodecs['wireErrors'],
  encTuple: readonly unknown[] | undefined,
  decTuple: readonly unknown[] | undefined
): void {
  if (!encTuple || !decTuple) return;
  const encode = wire(
    wireErrors,
    'binary',
    () => createBinaryEncoderFn(undefined, undefined, encTuple as never) as (v: unknown) => unknown
  );
  let decode: ((wire: unknown) => unknown) | undefined;
  try {
    decode = createBinaryDecoderFn(undefined, undefined, decTuple as never) as (wire: unknown) => unknown;
  } catch (err) {
    wireErrors.binary = wireErrors.binary ?? errMsg(err);
    decode = undefined;
  }
  if (encode && decode) codecs.binary = {encode, decode};
}

// Build a factory, capturing a controlled alwaysThrow as a wire error rather
// than aborting (a non-serialisable type degrades this way; the runner gates
// such types out, but capture defensively).
function wire<R>(wireErrors: CompiledCodecs['wireErrors'], key: LaneId | 'validate', build: () => R): R | undefined {
  try {
    return build();
  } catch (err) {
    wireErrors[key] = errMsg(err);
    return undefined;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
