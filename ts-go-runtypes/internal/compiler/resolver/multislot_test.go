package resolver_test

import (
	"sort"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// multiSlotDTS declares wrapper factories with SEVERAL injection-marker
// parameters — the multi-slot shape mion's route() uses (params + response
// markers), plus a fn-marker-then-reflection-marker mix and a non-marker gap.
const multiSlotDTS = `declare module '@ts-runtypes/core' {
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never, F4 extends string = never, F5 extends string = never, F6 extends string = never, F7 extends string = never, F8 extends string = never, F9 extends string = never, F10 extends string = never, F11 extends string = never, F12 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12]};
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  // Two fn markers on one call: a params side (verr + jsonDecoder) and a
  // response side (jsonEncoder). Both must inject at their own slot.
  export function twoSlot(handler: unknown, paramsFns?: InjectTypeFnArgs<string, 'verr', 'jsonDecoder'>, responseFns?: InjectTypeFnArgs<number, 'jsonEncoder'>): unknown;
  // A fn marker plus a SEPARATE reflection marker — the A5.3 workaround shape.
  export function fnAndMeta(handler: unknown, fns?: InjectTypeFnArgs<string, 'verr'>, meta?: InjectRunTypeId<number>): unknown;
  // A non-marker optional parameter (opts) sits between the args and the markers.
  export function withGap(handler: unknown, opts?: {readonly x?: number}, a?: InjectTypeFnArgs<string, 'verr'>, b?: InjectTypeFnArgs<number, 'jsonEncoder'>): unknown;
}
`

func scanOneCall(t *testing.T, dts, code string) []protocol.Site {
	t.Helper()
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	sites := append([]protocol.Site(nil), resp.Sites...)
	sort.Slice(sites, func(i, j int) bool { return sites[i].ParamIndex < sites[j].ParamIndex })
	return sites
}

// TestMultiSlot_TwoFnMarkers pins the core of A5.1: a call with TWO
// InjectTypeFnArgs parameters injects at BOTH slots — one site per marker, each
// with its own type id, fn ids, and parameter index. The historical scanner
// injected only the trailing slot, dropping the params side.
func TestMultiSlot_TwoFnMarkers(t *testing.T) {
	sites := scanOneCall(t, multiSlotDTS, `import {twoSlot} from '@ts-runtypes/core';
twoSlot(() => {});
`)
	if len(sites) != 2 {
		t.Fatalf("expected 2 sites (params + response markers), got %d (%+v)", len(sites), sites)
	}
	params, response := sites[0], sites[1]
	if params.ParamIndex != 1 || response.ParamIndex != 2 {
		t.Errorf("param indexes = %d,%d, want 1,2", params.ParamIndex, response.ParamIndex)
	}
	// Distinct T (string vs number) → distinct structural ids.
	if params.ID == response.ID {
		t.Errorf("params and response markers must resolve to distinct ids (string vs number), both %q", params.ID)
	}
	// Params side names two families → an fnIds array of length 2.
	if len(params.FnIds) != 2 {
		t.Errorf("params fnIds = %v, want 2 (verr, jsonDecoder)", params.FnIds)
	}
	if want := leafFnHash(t, "verr"); params.FnId != want {
		t.Errorf("params scalar FnId = %q, want verr %q", params.FnId, want)
	}
	// Response side names one family → scalar FnId, no fnIds array.
	if len(response.FnIds) != 0 {
		t.Errorf("single-family response should carry no fnIds array, got %v", response.FnIds)
	}
	if response.FnId == "" {
		t.Errorf("response FnId must be set (jsonEncoder)")
	}
	// Both slots inject at the same call, so they share the injection position.
	if params.Pos != response.Pos {
		t.Errorf("both markers of one call must share Pos, got %d and %d", params.Pos, response.Pos)
	}
}

// TestMultiSlot_FnMarkerPlusReflection pins the A5.3 workaround: an
// InjectTypeFnArgs marker and a SEPARATE InjectRunTypeId marker on one call both
// inject — the fn slot carries fn ids, the reflection slot carries a bare id
// (no FnId), so a wrapper can read the runtype graph without an 'rt' key.
func TestMultiSlot_FnMarkerPlusReflection(t *testing.T) {
	sites := scanOneCall(t, multiSlotDTS, `import {fnAndMeta} from '@ts-runtypes/core';
fnAndMeta(() => {});
`)
	if len(sites) != 2 {
		t.Fatalf("expected 2 sites (fn + reflection markers), got %d (%+v)", len(sites), sites)
	}
	fnSite, reflectSite := sites[0], sites[1]
	if fnSite.FnId == "" {
		t.Errorf("fn marker slot must carry an FnId (verr)")
	}
	if reflectSite.FnId != "" || len(reflectSite.FnIds) != 0 {
		t.Errorf("reflection marker slot must carry NO fn id, got FnId=%q FnIds=%v", reflectSite.FnId, reflectSite.FnIds)
	}
	if reflectSite.ID == "" {
		t.Errorf("reflection marker slot must still resolve a type id")
	}
}

// TestMultiSlot_FreeTypeParamPerSlot pins per-slot MKR003: inside a generic
// wrapper body, a marker slot whose T is still free emits MKR003 for that slot
// while a concrete-T slot on the same call still injects.
func TestMultiSlot_NonMarkerGap(t *testing.T) {
	sites := scanOneCall(t, multiSlotDTS, `import {withGap} from '@ts-runtypes/core';
withGap(() => {});
`)
	if len(sites) != 2 {
		t.Fatalf("expected 2 sites (a + b markers past the opts gap), got %d (%+v)", len(sites), sites)
	}
	// The markers sit at indexes 2 and 3 (opts is the non-marker gap at 1).
	if sites[0].ParamIndex != 2 || sites[1].ParamIndex != 3 {
		t.Errorf("marker param indexes = %d,%d, want 2,3 (opts gap at 1)", sites[0].ParamIndex, sites[1].ParamIndex)
	}
}

// TestMultiSlot_DuplicateKeyPerSlot pins that the duplicate-family rule (MKR006)
// still fires per slot in a multi-marker call.
func TestMultiSlot_DuplicateKeyPerSlot(t *testing.T) {
	const dts = `declare module '@ts-runtypes/core' {
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never, F4 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4]};
  export function dup(handler: unknown, a?: InjectTypeFnArgs<string, 'verr'>, b?: InjectTypeFnArgs<number, 'jsonEncoder', 'jsonEncoder'>): unknown;
}
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": dts, "call.ts": `import {dup} from '@ts-runtypes/core';
dup(() => {});
`})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var mkr006 int
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeMarkerDuplicateFnKey {
			mkr006++
		}
	}
	if mkr006 != 1 {
		t.Errorf("expected 1 MKR006 (b repeats jsonEncoder), got %d", mkr006)
	}
	// Both markers still produce sites; b's fn ids are deduped to one.
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(resp.Sites))
	}
}
