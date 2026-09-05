import {describe, expect, it} from 'vitest';
import {getFnHash} from '@mionjs/run-types';
import type {Diagnostic, Site} from '../src/core/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

// The shape @mionjs/router's typed factory uses to pick the compiled serializer
// families per route: the family slots of the InjectTypeFnArgs markers are
// CONDITIONAL types driven by the route option literal (RO) and the factory
// option literal (O), and the options parameter is CompTimeArgs so the argument
// must be a literal. The Go twin of this suite lives in
// ts-go-runtypes/internal/compiler/resolver/factory_strategy_test.go; this one
// pins the same behaviour through the plugin's session lane.
const API = `import type {CompTimeArgs, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
export type WireStrategy = 'clone' | 'mutate' | 'direct' | 'compact' | 'binary';
export type SerializerOption = WireStrategy | {params?: WireStrategy; return?: WireStrategy};
export interface RouteOptions {description?: string; serializer?: SerializerOption}
export interface RouterOptions {basePath?: string; serializer?: SerializerOption}
type Handler = (...args: any[]) => any;
type HandlerParams<H extends Handler> = Parameters<H> extends [any, ...infer P] ? P : [];
type HandlerReturn<H extends Handler> = Awaited<ReturnType<H>>;
type Dir = 'params' | 'return';
type SerializerOf<Opts> = Opts extends {serializer: infer S} ? S : never;
type PickDir<S, D extends Dir> = S extends WireStrategy ? S : S extends {[K in D]: infer V} ? V : never;
type Single<S> = [Exclude<S, undefined>] extends [never] ? never : Exclude<S, undefined>;
type StrategyIn<Opts, D extends Dir, Fallback> = [Single<PickDir<SerializerOf<Opts>, D>>] extends [never] ? Fallback : Single<PickDir<SerializerOf<Opts>, D>>;
type ParamsStrategy<RO, O> = StrategyIn<RO, 'params', StrategyIn<O, 'params', 'direct'>>;
type ReturnStrategy<RO, O> = StrategyIn<RO, 'return', StrategyIn<O, 'return', 'mutate'>>;
type EncodeFamily<S, Default extends 'sj' | 'pj'> = S extends 'clone' ? 'pjs' : S extends 'mutate' ? 'pj' : S extends 'direct' ? 'sj' : S extends 'compact' ? 'cj' : S extends 'binary' ? Default : never;
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : 'rj';
type Tb<S> = S extends 'binary' ? 'tb' : never;
type Fb<S> = S extends 'binary' ? 'fb' : never;
export interface RouteHelper<O extends RouterOptions> {
  <H extends Handler, const RO extends RouteOptions = {}>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'huk', 'uke', 'fmt', EncodeFamily<ParamsStrategy<RO, O>, 'sj'>, DecodeFamily<ParamsStrategy<RO, O>>, Tb<ParamsStrategy<RO, O>>, Fb<ParamsStrategy<RO, O>>>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'huk', 'uke', EncodeFamily<ReturnStrategy<RO, O>, 'pj'>, DecodeFamily<ReturnStrategy<RO, O>>, Tb<ReturnStrategy<RO, O>>, Fb<ReturnStrategy<RO, O>>>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): {handler: H; options: RO | undefined};
}
export interface Api<O extends RouterOptions> {
  readonly options: O;
  readonly route: RouteHelper<O>;
}
export declare function createApi<const O extends RouterOptions = {}>(opts?: O): Api<O>;
`;

// One route per option shape on a factory WITHOUT a serializer default, through
// the member and the destructured call forms, paired with both getRunTypeId
// shapes over the same params tuple (the marker test coverage rule).
const CALLS = `import {getRunTypeId} from '@mionjs/run-types';
import {createApi} from './api';
type Params = [name: string];
export const api = createApi({basePath: 'api'});
export const plain = api.route((ctx: unknown, name: string): {a: string; d: Date} => ({a: name, d: new Date()}));
export const compact = api.route((ctx: unknown, name: string): {a: string} => ({a: name}), {serializer: 'compact'});
export const retBinary = api.route((ctx: unknown, name: string): {a: string} => ({a: name}), {serializer: {return: 'binary'}});
export const mixed = api.route((ctx: unknown, user: {id: number}): string[] => [String(user.id)], {serializer: {params: 'compact', return: 'direct'}});
export const PRESET = {serializer: 'clone'} as const;
export const preset = api.route((ctx: unknown, name: string): string => name, PRESET);
const {route} = api;
export const destructured = route((ctx: unknown, name: string): number => name.length, {serializer: 'compact'});
export const staticId = getRunTypeId<Params>();
const params = ['x'] as Params;
export const reflectedId = getRunTypeId(params);
`;

// Routes on factories WITH a serializer default: the default flows into a route
// with no option and is overridden per direction by the route literal.
const DEFAULTS = `import {createApi} from './api';
export const api2 = createApi({serializer: 'compact'});
export const inherits = api2.route((ctx: unknown, name: string): {a: string} => ({a: name}));
export const override = api2.route((ctx: unknown, name: string): {a: string} => ({a: name}), {serializer: {return: 'direct'}});
export const api3 = createApi({serializer: {return: 'binary'}});
export const inheritsBinary = api3.route((ctx: unknown, name: string): {a: string} => ({a: name}));
`;

// A NON-literal options argument through both call forms: the CompTimeArgs
// brand on the generic interface's call signature must still be found.
const DYNAMIC = `import {createApi} from './api';
export const api4 = createApi({basePath: 'x'});
function getOpts() { return {serializer: 'compact'} as const; }
export const dynMember = api4.route((ctx: unknown, name: string): string => name, getOpts());
const {route} = api4;
export const dynDestructured = route((ctx: unknown, name: string): string => name, getOpts());
`;

const SOURCES = {'api.ts': API, 'call.ts': CALLS, 'defaults.ts': DEFAULTS, 'dynamic.ts': DYNAMIC};

interface RouteCall {
  paramsFns: Site;
  returnFns: Site;
  paramsId: Site;
  returnId: Site;
}

/** Groups the sites of one file by call position: a route call injects four slots (2..5); anything else is loose. */
function groupCalls(sites: Site[]): {calls: RouteCall[]; loose: Site[]} {
  const sorted = [...sites].sort((a, b) => a.pos - b.pos || (a.paramIndex ?? 0) - (b.paramIndex ?? 0));
  const calls: RouteCall[] = [];
  const loose: Site[] = [];
  for (let i = 0; i < sorted.length; ) {
    let end = i;
    while (end < sorted.length && sorted[end].pos === sorted[i].pos) end++;
    const group = sorted.slice(i, end);
    if (group.length === 4 && group[0].paramIndex === 2 && group[3].paramIndex === 5) {
      calls.push({paramsFns: group[0], returnFns: group[1], paramsId: group[2], returnId: group[3]});
    } else {
      loose.push(...group);
    }
    i = end;
  }
  return {calls, loose};
}

/** The site injected exactly these families (any order): a `never` slot drops out instead of leaving a hole. */
function expectFamilies(site: Site, families: string[]): void {
  const want = families.map((family) => getFnHash(family)).sort();
  expect([...(site.fnIds ?? [])].sort()).toEqual(want);
}

const register = hasBinary() ? it : it.skip;

describe('factory helpers with conditional serializer families', () => {
  register('injects the families the route option literal selects, member and destructured forms alike', async () => {
    await withInlineSources(SOURCES, async ({client}) => {
      const response = await client.scanFiles(['call.ts']);
      expect(response.diagnostics ?? []).toEqual([]);
      const {calls, loose} = groupCalls(response.sites);
      expect(calls).toHaveLength(6);
      const [plain, compact, retBinary, mixed, preset, destructured] = calls;
      // Built-in defaults: params 'direct' (sj + rj), return 'mutate' (pj + rj); tb/fb never.
      expectFamilies(plain.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'sj', 'rj']);
      expectFamilies(plain.returnFns, ['val', 'verr', 'huk', 'uke', 'pj', 'rj']);
      // A string option sets both directions.
      expectFamilies(compact.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'cj', 'cjr']);
      expectFamilies(compact.returnFns, ['val', 'verr', 'huk', 'uke', 'cj', 'cjr']);
      // binary ADDS tb/fb beside the built-in json pair of its direction.
      expectFamilies(retBinary.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'sj', 'rj']);
      expectFamilies(retBinary.returnFns, ['val', 'verr', 'huk', 'uke', 'pj', 'rj', 'tb', 'fb']);
      // Per-direction object form.
      expectFamilies(mixed.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'cj', 'cjr']);
      expectFamilies(mixed.returnFns, ['val', 'verr', 'huk', 'uke', 'sj', 'rj']);
      // An `as const` preset passed by name is a literal to the checker and to the scanner.
      expectFamilies(preset.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'pjs', 'rj']);
      expectFamilies(preset.returnFns, ['val', 'verr', 'huk', 'uke', 'pjs', 'rj']);
      expectFamilies(destructured.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'cj', 'cjr']);
      expectFamilies(destructured.returnFns, ['val', 'verr', 'huk', 'uke', 'cj', 'cjr']);
      for (const call of calls) {
        expect(call.paramsFns.id).toBe(call.paramsId.id);
        expect(call.returnFns.id).toBe(call.returnId.id);
      }
      // Marker coverage rule: getRunTypeId<Params>() and getRunTypeId(value) agree, and hash like the route's params tuple.
      expect(loose).toHaveLength(2);
      const [staticForm, reflectedForm] = loose;
      expect(staticForm.id).toBeTruthy();
      expect(staticForm.id).toBe(reflectedForm.id);
      expect(plain.paramsId.id).toBe(staticForm.id);
    });
  });

  register('a factory default flows into every route and a route literal overrides it per direction', async () => {
    await withInlineSources(SOURCES, async ({client}) => {
      const response = await client.scanFiles(['defaults.ts']);
      expect(response.diagnostics ?? []).toEqual([]);
      const {calls} = groupCalls(response.sites);
      expect(calls).toHaveLength(3);
      const [inherits, override, inheritsBinary] = calls;
      expectFamilies(inherits.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'cj', 'cjr']);
      expectFamilies(inherits.returnFns, ['val', 'verr', 'huk', 'uke', 'cj', 'cjr']);
      expectFamilies(override.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'cj', 'cjr']);
      expectFamilies(override.returnFns, ['val', 'verr', 'huk', 'uke', 'sj', 'rj']);
      expectFamilies(inheritsBinary.paramsFns, ['val', 'verr', 'huk', 'uke', 'fmt', 'sj', 'rj']);
      expectFamilies(inheritsBinary.returnFns, ['val', 'verr', 'huk', 'uke', 'pj', 'rj', 'tb', 'fb']);
    });
  });

  register('reports CTA003 for a non-literal options argument through both call forms', async () => {
    await withInlineSources(SOURCES, async ({client}) => {
      const response = await client.scanFiles(['dynamic.ts']);
      const cta = (response.diagnostics ?? []).filter((diagnostic: Diagnostic) => diagnostic.code === 'CTA003');
      const positions = new Set(cta.map((diagnostic) => `${diagnostic.site.startLine}:${diagnostic.site.startCol}`));
      expect(positions.size).toBe(2);
      expect((response.diagnostics ?? []).filter((diagnostic: Diagnostic) => diagnostic.code !== 'CTA003')).toEqual([]);
    });
  });
});
