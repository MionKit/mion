package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// anonPureFnDTS declares BOTH pure-fn lanes so the resolver's scan + extraction
// recognises them by brand: the named `registerPureFnFactory` (comptime id +
// PureFunctionFactory) and the anonymous `registerAnonymousPureFn` (direct
// PureFunction + injected InjectPureFnHash). It also carries a user
// wrapper-shaped helper so tests can forward the markers through a library API.
const anonPureFnDTS = `declare module '@ts-runtypes/core' {
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export type PureFunctionFactory<F> = F & {readonly __rtPureFunctionFactoryBrand?: never};
  export type InjectPureFnHash<F> = string & {readonly __rtInjectPureFnHashBrand?: F};
  export type PureFnId = string & {readonly __rtPureFnIdBrand?: never};
  export interface RTUtils {
    usePureFn(key: CompTimeArgs<string>): any;
    getPureFn(key: CompTimeArgs<string>): any;
    getCompiledPureFn(key: CompTimeArgs<string>): any;
    hasPureFn(key: CompTimeArgs<string>): boolean;
    getPureFnByKey(key: string): any;
    hasPureFnByKey(key: string): boolean;
  }
  export function registerPureFnFactory(pureFnId: CompTimeArgs<PureFnId>, createPureFn: PureFunctionFactory<(utl: RTUtils) => any> | null): any;
  export function registerAnonymousPureFn<F extends (...args: any[]) => any>(fn: PureFunction<F> | null, hash?: InjectPureFnHash<F>): any;
}
`

// markerAndPureFnDiags narrows a response's diagnostics to the two families a
// pure-fn / marker scanner surfaces at a call site — FamilyMarker (CTA0xx /
// PFN0xx) and FamilyPureFn (PFE90xx) — so the "zero scanner diagnostics"
// acceptance assertions ignore unrelated families.
func markerAndPureFnDiags(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, d := range diags {
		if d.Family == diagnostics.FamilyMarker || d.Family == diagnostics.FamilyPureFn {
			out = append(out, d)
		}
	}
	return out
}

// hashInsertionReplacement finds the anonymous-lane hash splice: a point
// insertion (Start == End) whose text is a quoted `rt::<hash>` id (no
// ImportFrom, unlike the factory-arg rewrite).
func hashInsertionReplacement(reps []protocol.Replacement) (protocol.Replacement, bool) {
	for _, rep := range reps {
		if rep.ImportFrom == "" && rep.Start == rep.End && strings.Contains(rep.Text, "'rt::") {
			return rep, true
		}
	}
	return protocol.Replacement{}, false
}

// TestAnonymousPureFn_DirectCall_ZeroDiagnostics — a direct
// registerAnonymousPureFn(inlineFactory) call extracts cleanly: the factory arg
// is rewritten to its pf binding and the empty trailing slot is spliced with the
// content-hash id, with NO CTA/PFN/PFE diagnostics.
func TestAnonymousPureFn_DirectCall_ZeroDiagnostics(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": anonPureFnDTS,
		"a.ts": `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn((n: number): number => n * 2);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if diags := markerAndPureFnDiags(resp.Diagnostics); len(diags) != 0 {
		t.Fatalf("expected zero marker/pure-fn diagnostics, got: %+v", diags)
	}
	rep, ok := hashInsertionReplacement(resp.Replacements)
	if !ok {
		t.Fatalf("missing hash-insertion replacement in %+v", resp.Replacements)
	}
	// The splice is `, 'rt::<hash>'` — a leading comma (the call had one prior arg
	// and no trailing comma) plus the quoted content-hash id.
	if !strings.HasPrefix(rep.Text, ", 'rt::") || !strings.HasSuffix(rep.Text, "'") {
		t.Errorf("unexpected hash insertion text: %q", rep.Text)
	}
}

// TestAnonymousPureFn_LibraryWrapper_ZeroDiagnostics is the core acceptance
// test: a library wrapper forwarding the markers lets a consumer register a pure
// fn with ZERO scanner diagnostics (no CTA003 / PFN001) — the whole reason the
// anonymous lane exists. The consumer's call site is recognised by BRAND, the
// factory is rewritten, and the hash is spliced, all clean.
func TestAnonymousPureFn_LibraryWrapper_ZeroDiagnostics(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": anonPureFnDTS,
		// The wrapper — a library's own ergonomic register API. It forwards the
		// PureFunction + InjectPureFnHash markers, so injection happens at ITS
		// call sites (the mion `registerMionPureFn` shape from the spec).
		"toolkit.ts": `import {type PureFunction, type InjectPureFnHash} from '@ts-runtypes/core';
export function registerAcmePureFn<F extends (...args: any[]) => any>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  if (!hash) throw new Error('ts-runtypes plugin did not run');
  return {hash, fn};
}
`,
		"consumer.ts": `import {registerAcmePureFn} from './toolkit.ts';
export const cpf = registerAcmePureFn((s: string): string => s.toLowerCase());
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts", "toolkit.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if diags := markerAndPureFnDiags(resp.Diagnostics); len(diags) != 0 {
		t.Fatalf("library wrapper must produce ZERO scanner diagnostics, got: %+v", diags)
	}
	if _, ok := hashInsertionReplacement(resp.Replacements); !ok {
		t.Fatalf("wrapper consumer call must inject a hash, replacements: %+v", resp.Replacements)
	}
}

// TestAnonymousPureFn_NamedLaneCoexists confirms the additive anonymous lane
// does NOT cross-wire the named lane: with a named registerPureFnFactory and an
// anonymous registerAnonymousPureFn in the SAME program, each is routed to its
// own extractor — the named entry keeps its literal `app::slugify` key (factory
// rewritten, no hash splice) while the anonymous entry gets an `rt::<hash>` key
// with a hash splice. (The named lane's own PFE9012 dep tracking is unchanged
// and covered by the purefunctions ValidatePureFnDependencies unit tests.)
func TestAnonymousPureFn_NamedLaneCoexists(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": anonPureFnDTS,
		"named.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const named = registerPureFnFactory('app::slugify', function () {
  return function _slug(s: string): string { return s.toLowerCase(); };
});
`,
		"anon.ts": `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const anon = registerAnonymousPureFn((n: number): number => n * 2);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"named.ts", "anon.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if diags := markerAndPureFnDiags(resp.Diagnostics); len(diags) != 0 {
		t.Fatalf("expected zero marker/pure-fn diagnostics, got: %+v", diags)
	}
	// The named lane rewrites its factory arg to a pf binding but NEVER splices a
	// hash (only the anonymous lane does).
	hashReps := 0
	factoryReps := 0
	for _, rep := range resp.Replacements {
		if rep.ImportFrom != "" {
			factoryReps++
		} else if rep.Start == rep.End && strings.Contains(rep.Text, "'rt::") {
			hashReps++
		}
	}
	if factoryReps != 2 {
		t.Errorf("expected 2 factory rewrites (one per lane), got %d in %+v", factoryReps, resp.Replacements)
	}
	if hashReps != 1 {
		t.Errorf("expected exactly 1 hash splice (anonymous lane only), got %d in %+v", hashReps, resp.Replacements)
	}
}
