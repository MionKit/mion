package resolver_test

import (
	"sort"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// tupleSlotApiSource declares the marker parameters as elements of a labelled
// TUPLE the call signature indexes, which is how @mionjs/router writes them once
// (MarkerSlots in packages/router/src/types/encoder.ts) and how every helper
// reads them. The distinction this pins is narrow and load-bearing: a type alias
// wrapped DIRECTLY around a marker resolves to the marker's own type and loses
// the alias the scanner matches on, while a tuple ELEMENT keeps it. Get that
// wrong and nothing errors, the call simply stops being injected.
const tupleSlotApiSource = `import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
type Handler = (...args: any[]) => any;
type HandlerParams<H extends Handler> = Parameters<H> extends [any, ...infer P] ? P : [];
type Slots<H extends Handler> = [
  fns: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr'>,
  id: InjectRunTypeId<HandlerParams<H>>,
];
export interface RouteHelper<O> {
  <H extends Handler>(handler: H, fns?: Slots<H>[0], id?: Slots<H>[1]): {handler: H; options: O};
}
export interface Api<O> {
  readonly options: O;
  readonly route: RouteHelper<O>;
}
export declare function createApi<const O>(opts: O): Api<O>;
`

// tupleSlotCallSource pairs the indexed-slot call with both getRunTypeId call
// shapes over the same params tuple (the marker test coverage rule): every id
// must be the same structural id.
const tupleSlotCallSource = `import {getRunTypeId} from '@mionjs/run-types';
import {createApi} from './tupleApi';
type Params = [name: string];
export const api = createApi({basePath: 'api'});
export const viaTupleSlots = api.route((ctx: unknown, name: string) => name);
export const staticId = getRunTypeId<Params>();
const params = ['x'] as Params;
export const reflectedId = getRunTypeId(params);
`

// TestScan_TupleSlotMarkers pins that a marker reached through a tuple element is
// injected exactly like one spelled inline on the parameter.
func TestScan_TupleSlotMarkers(t *testing.T) {
	r := setupInline(t, map[string]string{"tupleApi.ts": tupleSlotApiSource, "tupleCall.ts": tupleSlotCallSource})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"tupleCall.ts"}})
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
	// 1 route call x 2 marker slots + the 2 getRunTypeId forms.
	if len(sites) != 4 {
		t.Fatalf("expected 4 injection sites, got %d: %+v", len(sites), sites)
	}
	fns, id, staticForm, reflectedForm := sites[0], sites[1], sites[2], sites[3]
	if fns.ParamIndex != 1 || id.ParamIndex != 2 {
		t.Errorf("param indexes = %d,%d, want 1,2", fns.ParamIndex, id.ParamIndex)
	}
	if fns.Pos != id.Pos {
		t.Errorf("both markers of one call must share Pos, got %d and %d", fns.Pos, id.Pos)
	}
	if len(fns.FnIds) != 2 {
		t.Errorf("the fn marker names two families, fnIds = %v", fns.FnIds)
	}
	if id.FnId != "" || len(id.FnIds) != 0 {
		t.Errorf("the reflection marker must inject a bare id, got fnId %q fnIds %v", id.FnId, id.FnIds)
	}
	if staticForm.ID == "" || staticForm.ID != reflectedForm.ID {
		t.Errorf("getRunTypeId<Params>() and getRunTypeId(value) must agree: %q vs %q", staticForm.ID, reflectedForm.ID)
	}
	if fns.ID != staticForm.ID || id.ID != staticForm.ID {
		t.Errorf("the tuple slots must hash like the plain getRunTypeId forms: %q, %q vs %q", fns.ID, id.ID, staticForm.ID)
	}
}
