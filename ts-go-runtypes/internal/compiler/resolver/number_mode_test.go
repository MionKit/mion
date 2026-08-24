package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// numberModeDTS declares createValidateFn with the numberMode ValidateOption so
// the scanner reads it off the call-site options literal and folds it into the
// injected fnId variant. Uses the function marker (InjectTypeFnArgs) so each
// Site carries a FnId to assert against operations.FnHashFor.
const numberModeDTS = `declare module '@ts-runtypes/core' {
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean; numberMode?: 'isFinite' | 'typeof' | 'notNaN'}
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
}
`

func wantValFnId(t *testing.T, optionNames ...string) string {
	t.Helper()
	op, ok := operations.ByName("validate")
	if !ok {
		t.Fatal("validate op not registered")
	}
	return operations.FnHashFor(op, optionNames, "", false)
}

// TestNumberMode_PerSiteVariant pins that a per-call-site numberMode selects the
// validate variant: 'isFinite' (and an absent option) stays the plain entry,
// 'typeof' forks to the numberTypeof variant, 'notNaN' to numberNotNaN. Covers
// both createValidateFn call shapes (static <T>() and value-first (value)).
func TestNumberMode_PerSiteVariant(t *testing.T) {
	const code = `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<number>();
createValidateFn<number>(undefined, {numberMode: 'isFinite'});
createValidateFn<number>(undefined, {numberMode: 'typeof'});
createValidateFn<number>(undefined, {numberMode: 'notNaN'});
const v: number = 1;
createValidateFn(v, {numberMode: 'typeof'});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": numberModeDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 5 {
		t.Fatalf("expected 5 Sites, got %d: %+v", len(resp.Sites), resp.Sites)
	}
	plain := wantValFnId(t)
	typeofID := wantValFnId(t, "numberTypeof")
	notNaNID := wantValFnId(t, "numberNotNaN")
	want := []string{plain, plain, typeofID, notNaNID, typeofID}
	for i, s := range resp.Sites {
		if s.FnId != want[i] {
			t.Errorf("Site[%d].FnId = %q, want %q", i, s.FnId, want[i])
		}
	}
	// Every site validates the same structural type — numberMode never folds
	// into the type id, only the fnId variant.
	for i, s := range resp.Sites {
		if s.ID != resp.Sites[0].ID {
			t.Errorf("Site[%d].ID = %q, want %q (numberMode must not change the type id)", i, s.ID, resp.Sites[0].ID)
		}
	}
}

// TestNumberMode_GlobalDefaultPerFieldMerge is the load-bearing merge test: a
// project-wide validate.numberMode default fills in ONLY the numberMode field of
// each call site, per field. A site that sets noLiterals keeps it AND inherits
// the global numberMode; a site that sets its own numberMode overrides the
// default for that field (including an explicit 'isFinite' that opts back out).
func TestNumberMode_GlobalDefaultPerFieldMerge(t *testing.T) {
	const code = `import {createValidateFn} from '@ts-runtypes/core';
createValidateFn<number>();
createValidateFn<number[]>(undefined, {noLiterals: true});
createValidateFn<number>(undefined, {numberMode: 'isFinite'});
createValidateFn<number>(undefined, {numberMode: 'notNaN'});
`
	r := setupInlineWith(t, map[string]string{"runtypes.d.ts": numberModeDTS, "call.ts": code},
		func(_ *program.Options, ro *resolver.Options) {
			ro.ValidateDefaults = resolver.ValidateDefaults{NumberMode: "typeof"}
		})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 4 {
		t.Fatalf("expected 4 Sites, got %d: %+v", len(resp.Sites), resp.Sites)
	}
	want := []string{
		wantValFnId(t, "numberTypeof"),               // global default fills in
		wantValFnId(t, "noLiterals", "numberTypeof"), // site's noLiterals preserved + global numberMode
		wantValFnId(t),                 // explicit isFinite opts back out of the global default
		wantValFnId(t, "numberNotNaN"), // per-site override wins over the global default
	}
	for i, s := range resp.Sites {
		if s.FnId != want[i] {
			t.Errorf("Site[%d].FnId = %q, want %q", i, s.FnId, want[i])
		}
	}
}
