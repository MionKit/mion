package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// standardSchemaDTS declares a multi-function marker factory: the trailing
// `InjectTypeFnArgs<T, 'val', 'verr'>` names TWO families, so one call site
// must yield two fnIds (val + verr) injected as an array of entry tuples.
const standardSchemaDTS = `declare module '@ts-runtypes/core' {
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createStandardSchema<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, ids?: InjectTypeFnArgs<T, 'val', 'verr'>): {'~standard': {version: 1; vendor: string; validate: (v: unknown) => unknown}};
}
`

// TestResolver_StandardSchema_MultiFnSite pins the multi-function injection: a
// single createStandardSchema<T>() call site emits ONE site whose FnIds list
// carries the 'val' and 'verr' fnHashes (in marker order) and whose flattened
// Demand covers both families. The scalar FnId mirrors FnIds[0] for the
// byte-stable single-fn wire.
func TestResolver_StandardSchema_MultiFnSite(t *testing.T) {
	const code = `import {createStandardSchema} from '@ts-runtypes/core';
createStandardSchema<string>();
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": standardSchemaDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site for the createStandardSchema call, got %d (%+v)", len(resp.Sites), resp.Sites)
	}
	site := resp.Sites[0]
	if site.ID == "" {
		t.Fatalf("site has empty id")
	}

	valOp, ok := operations.ByFnKey("val")
	if !ok {
		t.Fatalf("no operation registered for fnKey 'val'")
	}
	verrOp, ok := operations.ByFnKey("verr")
	if !ok {
		t.Fatalf("no operation registered for fnKey 'verr'")
	}
	wantVal := operations.FnHashFor(valOp, nil, "", false)
	wantVerr := operations.FnHashFor(verrOp, nil, "", false)

	if len(site.FnIds) != 2 {
		t.Fatalf("expected 2 fnIds (val, verr), got %d (%+v)", len(site.FnIds), site.FnIds)
	}
	if site.FnIds[0] != wantVal || site.FnIds[1] != wantVerr {
		t.Errorf("FnIds = %v, want [%s %s] (val, verr in marker order)", site.FnIds, wantVal, wantVerr)
	}
	// Scalar FnId mirrors FnIds[0] so single-fn consumers stay byte-stable.
	if site.FnId != wantVal {
		t.Errorf("scalar FnId = %q, want %q (mirror of FnIds[0])", site.FnId, wantVal)
	}

	// The flattened Demand must request BOTH families so the val and verr entry
	// modules are emitted for this site.
	families := map[string]bool{}
	for _, demand := range site.Demand {
		families[demand.FamilyTag] = true
	}
	if !families[valOp.FamilyTag] || !families[verrOp.FamilyTag] {
		t.Errorf("Demand families = %v, want both %q and %q", families, valOp.FamilyTag, verrOp.FamilyTag)
	}
}

// TestResolver_SingleFn_NoFnIds confirms the multi-fn change leaves ordinary
// single-function sites byte-stable: createValidateFn yields a scalar FnId and
// NO FnIds list (so the wire and rewrite stay identical to before).
func TestResolver_SingleFn_NoFnIds(t *testing.T) {
	const code = `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<string>();
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": standardSchemaDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site, got %d", len(resp.Sites))
	}
	site := resp.Sites[0]
	if len(site.FnIds) != 0 {
		t.Errorf("single-fn site should carry no FnIds list, got %v", site.FnIds)
	}
	valOp, _ := operations.ByFnKey("val")
	if want := operations.FnHashFor(valOp, nil, "", false); site.FnId != want {
		t.Errorf("scalar FnId = %q, want %q", site.FnId, want)
	}
}
