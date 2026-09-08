// Strategy-driven family selection on a FACTORY-RETURNED wrapper, mion's
// createMionRouter(opts).route(handler, opts) shape. The marker slots are conditional types over
// the route literal (`RO`) and the factory literal (`O`); the scanner reads the family keys off the
// resolved signature, so a slot resolving to `never` injects nothing. Each case pins the exact
// families a call compiles, proving the selection lives entirely in TypeScript types.
import {describe, expect, it} from 'vitest';
import {getFnHash} from '@mionjs/run-types';
import {Family, type Diagnostic, type Site} from '../src/core/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

const register = hasBinary() ? it : it.skip;

// The factory + helper under test, mirroring what @mionjs/router ships.
const FACTORY_SRC = `import type {CompTimeArgs, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';

type Handler = (ctx: unknown, ...rest: any[]) => unknown;
type JsonStrategy = 'clone' | 'mutate' | 'direct' | 'compact';
type WireStrategy = JsonStrategy | 'binary';
type EncoderOption = WireStrategy | {params?: WireStrategy; return?: WireStrategy};
export type RouteOptions = PlainRouteOptions | RouteOptionsWithEncoder;
export type RouterOptions = {encoder?: EncoderOption; basePath?: string};

type Direction = 'params' | 'return';
type EncoderOf<X> = X extends {encoder: infer E} ? E : never;
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type SingleLiteral<S> = [S] extends [string] ? (string extends S ? never : IsUnion<S> extends true ? never : S) : never;
type DirectionStrategy<E, D extends Direction> = [E] extends [string] ? SingleLiteral<E> : [E] extends [Record<D, infer S extends string>] ? SingleLiteral<S> : never;
type Resolve<RO, O, D extends Direction, Default extends string> =
  [DirectionStrategy<EncoderOf<RO>, D>] extends [never]
    ? [DirectionStrategy<EncoderOf<O>, D>] extends [never]
      ? Default
      : DirectionStrategy<EncoderOf<O>, D>
    : DirectionStrategy<EncoderOf<RO>, D>;
type JsonOf<S, Default> = S extends 'binary' ? Default : S;
type EncodeFamily<S> = S extends 'clone' ? 'pjs' : S extends 'mutate' ? 'pj' : S extends 'direct' ? 'sj' : S extends 'compact' ? 'cj' : never;
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : S extends string ? 'rj' : never;
type TbOf<S> = S extends 'binary' ? 'tb' : never;
type FbOf<S> = S extends 'binary' ? 'fb' : never;
type ParamsStrategy<RO, O> = Resolve<RO, O, 'params', 'direct'>;
type ReturnStrategy<RO, O> = Resolve<RO, O, 'return', 'mutate'>;
type ParamsJson<RO, O> = JsonOf<ParamsStrategy<RO, O>, 'direct'>;
type ReturnJson<RO, O> = JsonOf<ReturnStrategy<RO, O>, 'mutate'>;

export type PlainRouteOptions = {encoder?: never; description?: string};
export type RouteOptionsWithEncoder = {encoder: EncoderOption; description?: string};

// ONE call signature, like @mionjs/router: \`RO\` defaults to the no-encoder shape, so a call
// without \`encoder\` takes its slots from the factory literal and a call with one from its own.
export interface RouteHelper<O extends RouterOptions> {
  <H extends Handler, const RO extends RouteOptions = PlainRouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: InjectTypeFnArgs<Parameters<H>, 'val', 'verr', EncodeFamily<ParamsJson<RO, O>>, DecodeFamily<ParamsJson<RO, O>>, TbOf<ParamsStrategy<RO, O>>, FbOf<ParamsStrategy<RO, O>>>,
    returnFns?: InjectTypeFnArgs<ReturnType<H>, 'val', 'verr', EncodeFamily<ReturnJson<RO, O>>, DecodeFamily<ReturnJson<RO, O>>, TbOf<ReturnStrategy<RO, O>>, FbOf<ReturnStrategy<RO, O>>>,
    paramsId?: InjectRunTypeId<Parameters<H>>
  ): {handler: H; opts?: RO; paramsFns?: unknown; returnFns?: unknown; paramsId?: string};
}

export function createRouter<const O extends RouterOptions = {}>(opts?: O): {options: O | undefined; route: RouteHelper<O>} {
  const route = ((handler: unknown, opts: unknown, paramsFns: unknown, returnFns: unknown, paramsId: unknown) => ({handler, opts, paramsFns, returnFns, paramsId})) as unknown as RouteHelper<O>;
  return {options: opts, route};
}
`;

const PRESET_SRC = `export const compactPreset = {encoder: 'compact', description: 'positional wire'} as const;
export const widenedPreset = {encoder: 'compact'};
`;

// fn ids on the wire are the family fn hashes; map them back to the family key.
const FAMILY_BY_HASH: Record<string, string> = Object.fromEntries(
  (['val', 'verr', 'pj', 'pjs', 'sj', 'cj', 'rj', 'cjr', 'tb', 'fb'] as const).map((key) => [getFnHash(key), key])
);

function familiesOf(site: Site): string[] {
  const ids = site.fnIds ?? (site.fnId ? [site.fnId] : []);
  return ids.map((id) => FAMILY_BY_HASH[id] ?? `?${id}`);
}

/** The two marker sites of one route call, keyed by slot: paramIndex 2 is paramsFns, 3 is returnFns, 4 the reflection id. */
function routeSites(sites: Site[], file: string): {params: Site; ret: Site; id?: Site} {
  const own = sites.filter((site) => site.file === file);
  const params = own.find((site) => site.paramIndex === 2);
  const ret = own.find((site) => site.paramIndex === 3);
  if (!params || !ret) throw new Error(`expected paramsFns + returnFns sites in ${file}, got ${JSON.stringify(own)}`);
  return {params, ret, id: own.find((site) => site.paramIndex === 4)};
}

function markerDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.Marker);
}

async function scan(consumers: Record<string, string>) {
  const sources = {'factory.ts': FACTORY_SRC, 'preset.ts': PRESET_SRC, ...consumers};
  return withInlineSources(sources, async ({client}) => client.scanFiles(Object.keys(consumers)));
}

const HANDLER = `(ctx: unknown, user: {name: string; born: Date}): {ok: boolean; at: Date} => ({ok: true, at: user.born})`;

describe('strategy-driven family slots on a factory-returned route helper', () => {
  register('no option anywhere: the built-in defaults (params direct, return mutate)', async () => {
    const response = await scan({
      'plain.ts': `import {createRouter} from './factory';
const mion = createRouter();
export const r = mion.route(${HANDLER});
`,
    });
    expect(markerDiagsOf(response)).toEqual([]);
    const {params, ret} = routeSites(response.sites, 'plain.ts');
    expect(familiesOf(params)).toEqual(['val', 'verr', 'sj', 'rj']);
    expect(familiesOf(ret)).toEqual(['val', 'verr', 'pj', 'rj']);
  });

  register('a route literal selects compact on both directions, and only compact', async () => {
    const response = await scan({
      'compact.ts': `import {createRouter} from './factory';
const mion = createRouter({basePath: 'api'});
export const r = mion.route(${HANDLER}, {encoder: 'compact'});
`,
    });
    expect(markerDiagsOf(response)).toEqual([]);
    const {params, ret} = routeSites(response.sites, 'compact.ts');
    expect(familiesOf(params)).toEqual(['val', 'verr', 'cj', 'cjr']);
    expect(familiesOf(ret)).toEqual(['val', 'verr', 'cj', 'cjr']);
  });

  register('binary on one direction ADDS tb/fb beside that direction default json pair', async () => {
    const response = await scan({
      'binary.ts': `import {createRouter} from './factory';
const mion = createRouter();
export const r = mion.route(${HANDLER}, {encoder: {return: 'binary'}});
`,
    });
    expect(markerDiagsOf(response)).toEqual([]);
    const {params, ret} = routeSites(response.sites, 'binary.ts');
    expect(familiesOf(params)).toEqual(['val', 'verr', 'sj', 'rj']);
    expect(familiesOf(ret)).toEqual(['val', 'verr', 'pj', 'rj', 'tb', 'fb']);
  });

  register('the factory literal is the router-wide default; a route literal overrides one direction', async () => {
    const response = await scan({
      'factory-default.ts': `import {createRouter} from './factory';
const mion = createRouter({encoder: {params: 'clone', return: 'direct'}});
export const inherited = mion.route(${HANDLER});
export const overridden = mion.route(${HANDLER}, {encoder: {return: 'compact'}});
`,
    });
    expect(markerDiagsOf(response)).toEqual([]);
    const own = response.sites.filter((site) => site.file === 'factory-default.ts').sort((a, b) => a.pos - b.pos);
    // two calls, three sites each (paramsFns, returnFns, paramsId)
    expect(own.length).toBe(6);
    const [inheritedParams, inheritedReturn, , overriddenParams, overriddenReturn] = own;
    expect(familiesOf(inheritedParams)).toEqual(['val', 'verr', 'pjs', 'rj']);
    expect(familiesOf(inheritedReturn)).toEqual(['val', 'verr', 'sj', 'rj']);
    expect(familiesOf(overriddenParams)).toEqual(['val', 'verr', 'pjs', 'rj']);
    expect(familiesOf(overriddenReturn)).toEqual(['val', 'verr', 'cj', 'cjr']);
  });

  register('an `as const` preset passed by name resolves cross-module', async () => {
    const response = await scan({
      'preset-user.ts': `import {createRouter} from './factory';
import {compactPreset} from './preset';
const mion = createRouter();
export const r = mion.route(${HANDLER}, compactPreset);
`,
    });
    expect(markerDiagsOf(response)).toEqual([]);
    const {params, ret} = routeSites(response.sites, 'preset-user.ts');
    expect(familiesOf(params)).toEqual(['val', 'verr', 'cj', 'cjr']);
    expect(familiesOf(ret)).toEqual(['val', 'verr', 'cj', 'cjr']);
  });

  register('a widened preset is CTA004; inference falls back to the defaults and the runtime fails closed', async () => {
    const response = await scan({
      'widened.ts': `import {createRouter} from './factory';
import {widenedPreset} from './preset';
const mion = createRouter();
export const r = mion.route(${HANDLER}, widenedPreset);
`,
    });
    expect(markerDiagsOf(response).map((d) => d.code)).toContain('CTA004');
    // `{encoder: string}` is also a type error at the call, so RO falls back to the constraint and
    // DirectionStrategy filters that widened union out: the defaults get compiled. The runtime value
    // still says 'compact', so the router refuses the route at init (pinned in @mionjs/router).
    const {params, ret} = routeSites(response.sites, 'widened.ts');
    expect(familiesOf(params)).toEqual(['val', 'verr', 'sj', 'rj']);
    expect(familiesOf(ret)).toEqual(['val', 'verr', 'pj', 'rj']);
  });

  register('a call expression as the options is CTA001 (non-literal)', async () => {
    const response = await scan({
      'call.ts': `import {createRouter} from './factory';
import type {RouteOptionsWithEncoder} from './factory';
declare function getOpts(): RouteOptionsWithEncoder;
const mion = createRouter();
export const r = mion.route(${HANDLER}, getOpts());
`,
    });
    const codes = markerDiagsOf(response).map((d) => d.code);
    expect(codes.some((code) => code === 'CTA001' || code === 'CTA003')).toBe(true);
  });

  // Marker test coverage rule: the static and value-first getRunTypeId shapes resolve the SAME id
  // as the route params marker, so the families above are keyed under either spelling.
  register('getRunTypeId<T>() and getRunTypeId(value) agree with the route params id', async () => {
    const response = await scan({
      'ids.ts': `import {createRouter} from './factory';
import {getRunTypeId} from '@mionjs/run-types';
const mion = createRouter();
const handler = ${HANDLER};
export const r = mion.route(handler, {encoder: 'compact'});
export const staticId = getRunTypeId<Parameters<typeof handler>>();
const paramsValue: Parameters<typeof handler> = [undefined, {name: 'a', born: new Date(0)}];
export const valueId = getRunTypeId(paramsValue);
`,
    });
    expect(markerDiagsOf(response)).toEqual([]);
    const {params, id} = routeSites(response.sites, 'ids.ts');
    expect(id, 'the paramsId reflection slot must be a site').toBeTruthy();
    // in source order: the route call's three sites, then the two getRunTypeId calls
    const own = response.sites.filter((site) => site.file === 'ids.ts').sort((a, b) => a.pos - b.pos);
    expect(own.length).toBe(5);
    const [staticSite, valueSite] = own.slice(3);
    const ids = new Set([params.id, id!.id, staticSite.id, valueSite.id]);
    expect(ids.size, `all four sites must share one type id, got ${[...ids].join(', ')}`).toBe(1);
  });
});
