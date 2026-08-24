package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
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
	const code = `import {createValidateFn} from '@ts-runtypes/core';
const strict = {noLiterals: true, noIsArrayCheck: true} as const;
export const spread = createValidateFn<string>(undefined, {...strict});
export const inline = createValidateFn<string>(undefined, {noLiterals: true, noIsArrayCheck: true});
export const none = createValidateFn<string>();
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
// `noLiterals: false` after `{...strict}` (which sets it true) disables the
// option, so the variant matches the inlined `{noIsArrayCheck: true}` — NOT
// the both-options variant.
func TestSpreadOptions_ValidateOverrideOrder(t *testing.T) {
	const code = `import {createValidateFn} from '@ts-runtypes/core';
const strict = {noLiterals: true, noIsArrayCheck: true} as const;
export const overridden = createValidateFn<string>(undefined, {...strict, noLiterals: false});
export const onlyArray = createValidateFn<string>(undefined, {noIsArrayCheck: true});
export const both = createValidateFn<string>(undefined, {noLiterals: true, noIsArrayCheck: true});
`
	fnIds := scanFnIds(t, code)
	if len(fnIds) != 3 {
		t.Fatalf("expected 3 sites, got %d: %v", len(fnIds), fnIds)
	}
	overridden, onlyArray, both := fnIds[0], fnIds[1], fnIds[2]
	if overridden != onlyArray {
		t.Errorf("inline `noLiterals: false` must override the spread-in `true`: overridden FnId=%q, onlyArray FnId=%q", overridden, onlyArray)
	}
	if overridden == both {
		t.Errorf("override not honored: overridden FnId=%q equals the both-options variant", overridden)
	}
}

// TestSpreadOptions_StrategyMergeAndOverride covers the JSON-strategy axis: a
// spread preset selects its strategy, and an inline strategy after the spread
// overrides it (last-write-wins) — both matching the inlined equivalents.
func TestSpreadOptions_StrategyMergeAndOverride(t *testing.T) {
	const code = `import {createJsonEncoderFn} from '@ts-runtypes/core';
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
	const optsModule = `export const strict = {noLiterals: true, noIsArrayCheck: true} as const;`
	const code = `import {createValidateFn} from '@ts-runtypes/core';
import {strict} from './opts';
export const spread = createValidateFn<string>(undefined, {...strict});
export const inline = createValidateFn<string>(undefined, {noLiterals: true, noIsArrayCheck: true});
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
