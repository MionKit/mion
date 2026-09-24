// Like the type/ harness, but the fixture emits every JSON strategy, so one random type drives every lane.
// Fn sites are classified BY TUPLE TAG, since the strategy lives in the tag. The type/ harness's fixed 6-site fixture
// cannot emit the variants, so this forks its fixture and classifier but reuses openClient and the eval helpers.

import path from 'node:path';
import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
import {getRTFunction} from '@mionjs/run-types/runtime';
import {ResolverClient} from '../../../../devtools/src/core/resolver-client.ts';
import {MARKER_PACKAGE_OVERLAY, evalEntryModules, instantiateRunTypes} from '../../../../devtools/test/helpers/inline.ts';
import {Severity, type Diagnostic, type Site} from '../../../../devtools/src/core/protocol.ts';
import {renderGenerated, describeType, type GeneratedType} from '../core/typeGen.ts';
import {openClient, hasBinary, BIN, SRC_OVERLAY} from '../type/typeFuzzHarness.ts';

export {hasBinary, BIN, openClient};

const FIXTURE = 'g.ts';

/** Each JSON lane decodes with its encoder's strategy; `rebuild` reads the clone wire with the rjs primitive
 *  recovered through a marker, the route a framework wrapper takes. **/
export type LaneId = 'clone' | 'mutate' | 'compact' | 'rebuild';

export const ALL_LANES: readonly LaneId[] = ['clone', 'mutate', 'compact', 'rebuild'];

/** A wired codec: encode returns a JSON string, or undefined for an undefined root. **/
export interface WiredCodec {
  encode: (value: unknown) => string | undefined;
  decode: (wire: string) => unknown;
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

// Options must be the SECOND arg: passed first it becomes the value and silently defaults to clone.
// Go reads the strategy literal from the AST, so the tags resolve regardless of the inline d.ts overlay.
export function renderFixture(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen);
  return `import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  type InjectTypeFnArgs,
} from '@mionjs/run-types';
${decls}
type T = ${rootExpr};
createValidateFn<T>();
createJsonEncoderFn<T>(undefined, {strategy: 'clone'});
createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
createJsonEncoderFn<T>(undefined, {strategy: 'compact'});
createJsonDecoderFn<T>(undefined, {strategy: 'clone'});
createJsonDecoderFn<T>(undefined, {strategy: 'mutate'});
createJsonDecoderFn<T>(undefined, {strategy: 'compact'});
// rjs has no createX factory: a framework reaches it by naming the fnKey in its own
// marker, which is exactly what mion's route helper does for the clone strategy.
declare function recoverRebuild<R>(id?: InjectTypeFnArgs<R, 'restoreFromJsonClone'>): (wire: unknown) => unknown;
recoverRebuild<T>();
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

const LANE_TAGS: Record<LaneId, {encode: string; decode: string}> = {
  clone: {encode: 'jeCL', decode: 'jdCL'},
  mutate: {encode: 'jeMU', decode: 'jdMU'},
  compact: {encode: 'jeCO', decode: 'jdCO'},
  rebuild: {encode: 'jeCL', decode: 'rjs'},
};

// Each slot-0 tag appears at most once in this fixture.
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
    encode: createJsonEncoderFn(
      undefined,
      undefined,
      tupleOrThrow(byTag, LANE_TAGS[lane].encode) as never
    ) as WiredCodec['encode'],
    decode: buildDecoder(lane, tupleOrThrow(byTag, LANE_TAGS[lane].decode)),
  }));
  if (codec) codecs[lane] = codec;
}

function tupleOrThrow(byTag: Record<string, readonly unknown[]>, tag: string): readonly unknown[] {
  const tuple = byTag[tag];
  if (!tuple) throw new Error(`no ${tag} fn site resolved`);
  return tuple;
}

// The composites parse the string themselves; the rjs primitive takes an already-parsed value.
function buildDecoder(lane: LaneId, tuple: readonly unknown[]): WiredCodec['decode'] {
  if (lane === 'rebuild') {
    const restore = getRTFunction<'restoreFromJsonClone'>(tuple);
    return (wire: string) => restore(JSON.parse(wire));
  }
  return createJsonDecoderFn(undefined, undefined, tuple as never) as WiredCodec['decode'];
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
