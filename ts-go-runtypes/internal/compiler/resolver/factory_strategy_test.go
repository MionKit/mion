package resolver_test

import (
	"sort"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// strategyApiSource is the shape @mionjs/router's typed factory uses to pick
// the compiled serializer families per route: the family slots of the
// InjectTypeFnArgs markers are CONDITIONAL types driven by the route option
// literal (`RO`) and the factory option literal (`O`), and the options
// parameter is branded CompTimeArgs so the argument must be a literal. The
// scanner reads the RESOLVED alias arguments of each call, so a conditional
// slot arrives as one string literal (or as `never`, which is skipped).
const strategyApiSource = `import type {CompTimeArgs, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
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
`

// strategyCallSource declares one route per option shape on a factory WITHOUT
// a serializer default, through the member and the destructured call forms,
// paired with both getRunTypeId shapes over the same params tuple (the marker
// test coverage rule).
const strategyCallSource = `import {getRunTypeId} from '@mionjs/run-types';
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
`

// strategyDefaultsSource declares routes on factories WITH a serializer
// default: the default flows into a route with no option and is overridden per
// direction by the route literal.
const strategyDefaultsSource = `import {createApi} from './api';
export const api2 = createApi({serializer: 'compact'});
export const inherits = api2.route((ctx: unknown, name: string): {a: string} => ({a: name}));
export const override = api2.route((ctx: unknown, name: string): {a: string} => ({a: name}), {serializer: {return: 'direct'}});
export const api3 = createApi({serializer: {return: 'binary'}});
export const inheritsBinary = api3.route((ctx: unknown, name: string): {a: string} => ({a: name}));
`

// strategyDynamicSource passes a NON-literal options argument through both call
// forms: the CompTimeArgs brand on the generic interface's call signature must
// still be found, so each call reports CTA003 (a function call is a forbidden
// construct).
const strategyDynamicSource = `import {createApi} from './api';
export const api4 = createApi({basePath: 'x'});
function getOpts() { return {serializer: 'compact'} as const; }
export const dynMember = api4.route((ctx: unknown, name: string): string => name, getOpts());
const {route} = api4;
export const dynDestructured = route((ctx: unknown, name: string): string => name, getOpts());
`

// strategyCall is the four injection sites of one route call, in slot order.
type strategyCall struct {
	paramsFns, returnFns, paramsId, returnId protocol.Site
}

// scanStrategyFile scans one fixture file and groups its route-call sites by
// call position; the sites that are not part of a 4-slot route call (the
// getRunTypeId forms) come back separately, in source order.
func scanStrategyFile(t *testing.T, file string) ([]strategyCall, []protocol.Site, []diagnostics.Diagnostic) {
	t.Helper()
	sources := map[string]string{
		"api.ts":      strategyApiSource,
		"call.ts":     strategyCallSource,
		"defaults.ts": strategyDefaultsSource,
		"dynamic.ts":  strategyDynamicSource,
	}
	r := setupInline(t, sources)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
	if resp.Error != "" {
		t.Fatalf("scanFiles %s: %s", file, resp.Error)
	}
	sites := append([]protocol.Site(nil), resp.Sites...)
	sort.Slice(sites, func(i, j int) bool {
		if sites[i].Pos != sites[j].Pos {
			return sites[i].Pos < sites[j].Pos
		}
		return sites[i].ParamIndex < sites[j].ParamIndex
	})
	var calls []strategyCall
	var loose []protocol.Site
	for i := 0; i < len(sites); {
		end := i
		for end < len(sites) && sites[end].Pos == sites[i].Pos {
			end++
		}
		group := sites[i:end]
		if len(group) == 4 && group[0].ParamIndex == 2 && group[3].ParamIndex == 5 {
			calls = append(calls, strategyCall{group[0], group[1], group[2], group[3]})
		} else {
			loose = append(loose, group...)
		}
		i = end
	}
	return calls, loose, resp.Diagnostics
}

// wantFamilies asserts that a marker site injected exactly the given families
// (compared through their fnHash), in any order, and nothing else: a `never`
// slot must DROP OUT of the list rather than leave a hole.
func wantFamilies(t *testing.T, label string, site protocol.Site, families ...string) {
	t.Helper()
	want := make(map[string]string, len(families))
	for _, family := range families {
		want[leafFnHash(t, family)] = family
	}
	if len(site.FnIds) != len(families) {
		t.Errorf("%s: expected %d families %v, got fnIds %v", label, len(families), families, site.FnIds)
	}
	for _, fnID := range site.FnIds {
		if _, ok := want[fnID]; !ok {
			t.Errorf("%s: unexpected family hash %q in %v (want %v)", label, fnID, site.FnIds, families)
		}
	}
	seen := make(map[string]bool, len(site.FnIds))
	for _, fnID := range site.FnIds {
		seen[fnID] = true
	}
	for hash, family := range want {
		if !seen[hash] {
			t.Errorf("%s: family %q (%s) was not injected: %v", label, family, hash, site.FnIds)
		}
	}
}

// TestScan_FactoryStrategyFamilies pins that a conditional family slot resolves
// per call from the route option literal (member and destructured forms alike),
// that a slot resolving to `never` drops out of the injected list, and that
// the two getRunTypeId forms hash like the route's own params tuple.
func TestScan_FactoryStrategyFamilies(t *testing.T) {
	calls, loose, diags := scanStrategyFile(t, "call.ts")
	for _, diag := range diags {
		t.Errorf("unexpected diagnostic on the literal calls: %s %v", diag.Code, diag.Args)
	}
	if len(calls) != 6 {
		t.Fatalf("expected 6 route calls with 4 slots each, got %d", len(calls))
	}
	if len(loose) != 2 {
		t.Fatalf("expected the 2 getRunTypeId sites, got %d: %+v", len(loose), loose)
	}
	plain, compact, retBinary, mixed, preset, destructured := calls[0], calls[1], calls[2], calls[3], calls[4], calls[5]
	// Built-in defaults: params 'direct' (sj + rj), return 'mutate' (pj + rj); tb/fb never.
	wantFamilies(t, "plain params", plain.paramsFns, "val", "verr", "huk", "uke", "fmt", "sj", "rj")
	wantFamilies(t, "plain return", plain.returnFns, "val", "verr", "huk", "uke", "pj", "rj")
	// A string option sets both directions.
	wantFamilies(t, "compact params", compact.paramsFns, "val", "verr", "huk", "uke", "fmt", "cj", "cjr")
	wantFamilies(t, "compact return", compact.returnFns, "val", "verr", "huk", "uke", "cj", "cjr")
	// binary ADDS tb/fb beside the built-in json pair of its direction; the other direction keeps its default.
	wantFamilies(t, "retBinary params", retBinary.paramsFns, "val", "verr", "huk", "uke", "fmt", "sj", "rj")
	wantFamilies(t, "retBinary return", retBinary.returnFns, "val", "verr", "huk", "uke", "pj", "rj", "tb", "fb")
	// Per-direction object form.
	wantFamilies(t, "mixed params", mixed.paramsFns, "val", "verr", "huk", "uke", "fmt", "cj", "cjr")
	wantFamilies(t, "mixed return", mixed.returnFns, "val", "verr", "huk", "uke", "sj", "rj")
	// An `as const` preset passed by name is a literal to the checker AND to the scanner.
	wantFamilies(t, "preset params", preset.paramsFns, "val", "verr", "huk", "uke", "fmt", "pjs", "rj")
	wantFamilies(t, "preset return", preset.returnFns, "val", "verr", "huk", "uke", "pjs", "rj")
	// The destructured helper resolves the same signature.
	wantFamilies(t, "destructured params", destructured.paramsFns, "val", "verr", "huk", "uke", "fmt", "cj", "cjr")
	wantFamilies(t, "destructured return", destructured.returnFns, "val", "verr", "huk", "uke", "cj", "cjr")
	for label, call := range map[string]strategyCall{"plain": plain, "compact": compact, "destructured": destructured} {
		if call.paramsFns.ID == "" || call.paramsFns.ID != call.paramsId.ID {
			t.Errorf("%s: the params fn slot and the params id slot describe the same tuple: %q vs %q", label, call.paramsFns.ID, call.paramsId.ID)
		}
		if call.returnFns.ID == "" || call.returnFns.ID != call.returnId.ID {
			t.Errorf("%s: the return fn slot and the return id slot describe the same type: %q vs %q", label, call.returnFns.ID, call.returnId.ID)
		}
	}
	staticForm, reflectedForm := loose[0], loose[1]
	if staticForm.ID == "" || staticForm.ID != reflectedForm.ID {
		t.Errorf("getRunTypeId<Params>() and getRunTypeId(value) must agree: %q vs %q", staticForm.ID, reflectedForm.ID)
	}
	if plain.paramsId.ID != staticForm.ID {
		t.Errorf("the route's params tuple must hash like the plain getRunTypeId forms: %q vs %q", plain.paramsId.ID, staticForm.ID)
	}
}

// TestScan_FactoryStrategyDefaults pins that the FACTORY option literal flows
// by type into every route the factory declares, and that a route literal
// overrides it per direction.
func TestScan_FactoryStrategyDefaults(t *testing.T) {
	calls, _, diags := scanStrategyFile(t, "defaults.ts")
	for _, diag := range diags {
		t.Errorf("unexpected diagnostic on the factory defaults: %s %v", diag.Code, diag.Args)
	}
	if len(calls) != 3 {
		t.Fatalf("expected 3 route calls with 4 slots each, got %d", len(calls))
	}
	inherits, override, inheritsBinary := calls[0], calls[1], calls[2]
	wantFamilies(t, "inherits params", inherits.paramsFns, "val", "verr", "huk", "uke", "fmt", "cj", "cjr")
	wantFamilies(t, "inherits return", inherits.returnFns, "val", "verr", "huk", "uke", "cj", "cjr")
	wantFamilies(t, "override params", override.paramsFns, "val", "verr", "huk", "uke", "fmt", "cj", "cjr")
	wantFamilies(t, "override return", override.returnFns, "val", "verr", "huk", "uke", "sj", "rj")
	wantFamilies(t, "inheritsBinary params", inheritsBinary.paramsFns, "val", "verr", "huk", "uke", "fmt", "sj", "rj")
	wantFamilies(t, "inheritsBinary return", inheritsBinary.returnFns, "val", "verr", "huk", "uke", "pj", "rj", "tb", "fb")
}

// TestScan_FactoryStrategyDynamicOptions pins that the CompTimeArgs brand on
// the generic interface's call signature is honoured through the member and
// the destructured call forms: a non-literal options argument is CTA003.
func TestScan_FactoryStrategyDynamicOptions(t *testing.T) {
	_, _, diags := scanStrategyFile(t, "dynamic.ts")
	positions := map[[2]int]bool{}
	for _, diag := range diags {
		if diag.Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
			t.Errorf("unexpected diagnostic: %s %v", diag.Code, diag.Args)
			continue
		}
		positions[[2]int{diag.Site.StartLine, diag.Site.StartCol}] = true
	}
	if len(positions) != 2 {
		t.Fatalf("expected CTA003 at both dynamic calls (member and destructured), got %d distinct positions in %+v", len(positions), diags)
	}
}
