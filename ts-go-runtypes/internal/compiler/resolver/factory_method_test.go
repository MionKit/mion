package resolver_test

import (
	"sort"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// factoryApiSource declares the shape mion's createMionRouter returns: a generic
// factory whose result carries marker-bearing METHODS (call signatures on an
// interface instantiated with the option literal) instead of module-level
// functions. The scanner resolves each call's signature, so the callee spelling
// (`api.route(...)` or a destructured `route(...)`) must not matter, and the
// markers spelled on the method signature must still be found through the
// generic interface.
const factoryApiSource = `import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
type Handler = (...args: any[]) => any;
type HandlerParams<H extends Handler> = Parameters<H> extends [any, ...infer P] ? P : [];
export interface RouteHelper<O> {
  <H extends Handler>(handler: H, fns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr'>, id?: InjectRunTypeId<HandlerParams<H>>): {handler: H; options: O};
}
export interface Api<O> {
  readonly options: O;
  readonly route: RouteHelper<O>;
}
export declare function createApi<const O>(opts: O): Api<O>;
`

// factoryCallSource calls the factory's method through a property access and
// through a destructured binding, and pairs them with both getRunTypeId call
// shapes over the same params tuple (the marker test coverage rule): every id
// must be the same structural id.
const factoryCallSource = `import {getRunTypeId} from '@mionjs/run-types';
import {createApi} from './api';
type Params = [name: string];
export const api = createApi({basePath: 'api'});
export const viaMember = api.route((ctx: unknown, name: string) => name);
const {route} = api;
export const viaDestructured = route((ctx: unknown, name: string) => name);
export const staticId = getRunTypeId<Params>();
const params = ['x'] as Params;
export const reflectedId = getRunTypeId(params);
`

// TestScan_FactoryMethodMarkers pins that a marker-bearing method on a
// factory-returned object is injected exactly like a module-level function: one
// site per marker slot at each call, whether the callee is `api.route(...)` or a
// destructured `route(...)`, all resolving to the same id as the plain
// getRunTypeId forms over the same tuple.
func TestScan_FactoryMethodMarkers(t *testing.T) {
	r := setupInline(t, map[string]string{"api.ts": factoryApiSource, "call.ts": factoryCallSource})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, diag := range resp.Diagnostics {
		t.Logf("diagnostic: %s %v", diag.Code, diag.Args)
	}
	sites := append([]protocol.Site(nil), resp.Sites...)
	sort.Slice(sites, func(i, j int) bool {
		if sites[i].Pos != sites[j].Pos {
			return sites[i].Pos < sites[j].Pos
		}
		return sites[i].ParamIndex < sites[j].ParamIndex
	})
	// 2 factory calls x 2 marker slots + the 2 getRunTypeId forms.
	if len(sites) != 6 {
		t.Fatalf("expected 6 injection sites, got %d: %+v", len(sites), sites)
	}
	member, destructured, staticForm, reflectedForm := sites[0:2], sites[2:4], sites[4], sites[5]
	for label, call := range map[string][]protocol.Site{"api.route(...)": member, "destructured route(...)": destructured} {
		fns, id := call[0], call[1]
		if fns.ParamIndex != 1 || id.ParamIndex != 2 {
			t.Errorf("%s: param indexes = %d,%d, want 1,2", label, fns.ParamIndex, id.ParamIndex)
		}
		if fns.Pos != id.Pos {
			t.Errorf("%s: both markers of one call must share Pos, got %d and %d", label, fns.Pos, id.Pos)
		}
		if len(fns.FnIds) != 2 {
			t.Errorf("%s: fn marker names two families, fnIds = %v", label, fns.FnIds)
		}
		if id.FnId != "" || len(id.FnIds) != 0 {
			t.Errorf("%s: the reflection marker must inject a bare id, got fnId %q fnIds %v", label, id.FnId, id.FnIds)
		}
		if fns.ID == "" || fns.ID != id.ID {
			t.Errorf("%s: both slots describe the same params tuple, ids %q and %q", label, fns.ID, id.ID)
		}
	}
	if member[0].ID != destructured[0].ID {
		t.Errorf("member and destructured calls over the same handler must share an id: %q vs %q", member[0].ID, destructured[0].ID)
	}
	if staticForm.ID == "" || staticForm.ID != reflectedForm.ID {
		t.Errorf("getRunTypeId<Params>() and getRunTypeId(value) must agree: %q vs %q", staticForm.ID, reflectedForm.ID)
	}
	if member[0].ID != staticForm.ID {
		t.Errorf("the factory method's params tuple must hash like the plain getRunTypeId forms: %q vs %q", member[0].ID, staticForm.ID)
	}
}
