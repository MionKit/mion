package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// scanFnIds scans call.ts (against the default runtypesDTS) and returns the
// injected FnId for each surviving createX site, in source order.
func scanFnIds(t *testing.T, code string) []string {
	t.Helper()
	r := setupInline(t, map[string]string{"call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	fnIds := make([]string, len(resp.Sites))
	for i, site := range resp.Sites {
		fnIds[i] = site.FnId
	}
	return fnIds
}

// TestSpreadOptions_ValidateMergeEquivalent is the load-bearing Part C
// soundness test: a spread-merged ValidateOptions bag must select the SAME
// fn-hash variant as the fully-inlined equivalent — never silently drop the
// preset's options and collapse to the no-options variant (which would emit a
// validator that ignores the requested options).
func TestSpreadOptions_ValidateMergeEquivalent(t *testing.T) {
	const code = `import {createValidateFn} from '@mionjs/run-types';
const strict = {numberMode: 'typeof', rejectCircularRefs: true} as const;
export const spread = createValidateFn<number>(undefined, {...strict});
export const inline = createValidateFn<number>(undefined, {numberMode: 'typeof', rejectCircularRefs: true});
export const none = createValidateFn<number>();
`
	fnIds := scanFnIds(t, code)
	if len(fnIds) != 3 {
		t.Fatalf("expected 3 sites (spread, inline, none), got %d: %v", len(fnIds), fnIds)
	}
	spread, inline, none := fnIds[0], fnIds[1], fnIds[2]
	if spread != inline {
		t.Errorf("spread-merged options must match the inlined variant: spread FnId=%q, inline FnId=%q", spread, inline)
	}
	if spread == none {
		t.Errorf("spread-merged options were silently dropped: spread FnId=%q equals the no-options variant", spread)
	}
}

// TestSpreadOptions_ValidateOverrideOrder pins last-write-wins: an inline
// option after `{...strict}` replaces the spread-in value, for both the
// `numberMode` enum and the `rejectCircularRefs` boolean.
func TestSpreadOptions_ValidateOverrideOrder(t *testing.T) {
	const code = `import {createValidateFn} from '@mionjs/run-types';
const strict = {numberMode: 'typeof', rejectCircularRefs: true} as const;
export const modeOverridden = createValidateFn<number>(undefined, {...strict, numberMode: 'notNaN'});
export const notNaNCircular = createValidateFn<number>(undefined, {numberMode: 'notNaN', rejectCircularRefs: true});
export const circularOff = createValidateFn<number>(undefined, {...strict, rejectCircularRefs: false});
export const onlyTypeof = createValidateFn<number>(undefined, {numberMode: 'typeof'});
export const both = createValidateFn<number>(undefined, {numberMode: 'typeof', rejectCircularRefs: true});
`
	fnIds := scanFnIds(t, code)
	if len(fnIds) != 5 {
		t.Fatalf("expected 5 sites, got %d: %v", len(fnIds), fnIds)
	}
	modeOverridden, notNaNCircular, circularOff, onlyTypeof, both := fnIds[0], fnIds[1], fnIds[2], fnIds[3], fnIds[4]
	if modeOverridden != notNaNCircular {
		t.Errorf("inline `numberMode: 'notNaN'` must override the spread-in 'typeof': got %q, want %q", modeOverridden, notNaNCircular)
	}
	if circularOff != onlyTypeof {
		t.Errorf("inline `rejectCircularRefs: false` must override the spread-in `true`: got %q, want %q", circularOff, onlyTypeof)
	}
	if modeOverridden == both || circularOff == both {
		t.Errorf("override not honored: an overridden FnId equals the spread-only variant %q", both)
	}
}

// TestSpreadOptions_StrategyMergeAndOverride covers the JSON-strategy axis: a
// spread preset selects its strategy, and an inline strategy after the spread
// overrides it (last-write-wins) — both matching the inlined equivalents.
func TestSpreadOptions_StrategyMergeAndOverride(t *testing.T) {
	const code = `import {createJsonEncoderFn} from '@mionjs/run-types';
const preset = {strategy: 'mutate'} as const;
export const spread = createJsonEncoderFn<{x: number}>(undefined, {...preset});
export const inlineMutate = createJsonEncoderFn<{x: number}>(undefined, {strategy: 'mutate'});
export const overridden = createJsonEncoderFn<{x: number}>(undefined, {...preset, strategy: 'direct'});
export const inlineDirect = createJsonEncoderFn<{x: number}>(undefined, {strategy: 'direct'});
`
	fnIds := scanFnIds(t, code)
	if len(fnIds) != 4 {
		t.Fatalf("expected 4 sites, got %d: %v", len(fnIds), fnIds)
	}
	spread, inlineMutate, overridden, inlineDirect := fnIds[0], fnIds[1], fnIds[2], fnIds[3]
	if spread != inlineMutate {
		t.Errorf("spread preset strategy must match inline: spread FnId=%q, inlineMutate FnId=%q", spread, inlineMutate)
	}
	if overridden != inlineDirect {
		t.Errorf("inline strategy must override the spread preset: overridden FnId=%q, inlineDirect FnId=%q", overridden, inlineDirect)
	}
	if spread == overridden {
		t.Errorf("mutate and direct strategies must differ: both FnId=%q", spread)
	}
}

// TestSpreadOptions_CrossModuleFragment pins Decision 2 for the option-bag
// reader: an options preset imported from another module merges like a
// same-module one (the trace follows import aliases).
func TestSpreadOptions_CrossModuleFragment(t *testing.T) {
	const optsModule = `export const strict = {numberMode: 'typeof', rejectCircularRefs: true} as const;`
	const code = `import {createValidateFn} from '@mionjs/run-types';
import {strict} from './opts';
export const spread = createValidateFn<number>(undefined, {...strict});
export const inline = createValidateFn<number>(undefined, {numberMode: 'typeof', rejectCircularRefs: true});
`
	r := setupInline(t, map[string]string{"opts.ts": optsModule, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].FnId != resp.Sites[1].FnId {
		t.Errorf("cross-module options preset must match the inlined variant: spread FnId=%q, inline FnId=%q", resp.Sites[0].FnId, resp.Sites[1].FnId)
	}
}
