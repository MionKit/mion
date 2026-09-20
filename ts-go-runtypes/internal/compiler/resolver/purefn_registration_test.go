package resolver_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// pureFnDTS declares the registrars so the resolver's scan + extraction
// recognises them by brand: a pure-fn form marker (direct or factory) followed
// by the id injection marker. It also carries the rtUtils lookups a body reaches
// another pure fn through.
const pureFnDTS = `declare module '@mionjs/run-types' {
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export type PureFunctionFactory<F> = F & {readonly __rtPureFunctionFactoryBrand?: never};
  export type InjectPureFnId<F> = string & {readonly __rtInjectPureFnIdBrand?: F};
  export type PureFnId<ID extends string = string> = ID & {readonly __rtPureFnIdBrand: true};
  export interface RTUtils {
    usePureFn(key: CompTimeArgs<PureFnId>): any;
    getPureFn(key: CompTimeArgs<PureFnId>): any;
    getCompiledPureFn(key: CompTimeArgs<PureFnId>): any;
    hasPureFn(key: CompTimeArgs<PureFnId>): boolean;
    getPureFnByKey(key: string): any;
    hasPureFnByKey(key: string): boolean;
  }
  export function registerPureFnFactory<F extends (utl: RTUtils) => any, ID extends string = string>(
    createPureFn: PureFunctionFactory<F> | null,
    id?: InjectPureFnId<F> & ID,
  ): PureFnId<ID>;
  export function registerPureFn<F extends (...args: any[]) => any, ID extends string = string>(
    fn: PureFunction<F> | null,
    id?: InjectPureFnId<F> & ID,
  ): PureFnId<ID>;
}
// The two register fns live on the /runtime subpath; the types stay on the main entry.
declare module '@mionjs/run-types/runtime' {
  export {registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
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

// idSpliceRE matches an injected id: a quoted owner (empty for a project with
// no package name) followed by the `#` hash half.
var idSpliceRE = regexp.MustCompile(`'[^']*#[^']+'`)

// idInsertionReplacement finds the id splice: a point insertion (Start == End)
// whose text is a quoted id (no ImportFrom, unlike the factory-arg rewrite).
func idInsertionReplacement(reps []protocol.Replacement) (protocol.Replacement, bool) {
	for _, rep := range reps {
		if rep.ImportFrom == "" && rep.Start == rep.End && idSpliceRE.MatchString(rep.Text) {
			return rep, true
		}
	}
	return protocol.Replacement{}, false
}

// TestPureFn_DirectCall_ZeroDiagnostics — a direct registerPureFn(inlineFn)
// call extracts cleanly: the fn arg is rewritten to its pf binding and the empty
// trailing slot is spliced with the id, with NO CTA/PFN/PFE diagnostics.
func TestPureFn_DirectCall_ZeroDiagnostics(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": pureFnDTS,
		"a.ts": `import {registerPureFn} from '@mionjs/run-types/runtime';
export const double = registerPureFn((n: number): number => n * 2);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if diags := markerAndPureFnDiags(resp.Diagnostics); len(diags) != 0 {
		t.Fatalf("expected zero marker/pure-fn diagnostics, got: %+v", diags)
	}
	rep, ok := idInsertionReplacement(resp.Replacements)
	if !ok {
		t.Fatalf("missing id-insertion replacement in %+v", resp.Replacements)
	}
	// The splice is `, '<id>'` — a leading comma (the call had one prior arg and
	// no trailing comma) plus the quoted id, whose name half is the binding.
	if !strings.HasPrefix(rep.Text, ", '#") || !strings.HasSuffix(rep.Text, "'") {
		t.Errorf("unexpected id insertion text: %q", rep.Text)
	}
}

// TestPureFn_LibraryWrapper_ZeroDiagnostics is the core acceptance test: a
// library wrapper forwarding the markers lets a consumer register a pure fn with
// ZERO scanner diagnostics (no CTA003 / PFN001). The consumer's call site is
// recognised by BRAND, the fn is rewritten, and the id is spliced, all clean.
func TestPureFn_LibraryWrapper_ZeroDiagnostics(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": pureFnDTS,
		// The wrapper — a library's own ergonomic register API. It forwards the
		// PureFunction + InjectPureFnId markers, so injection happens at ITS
		// call sites.
		"toolkit.ts": `import {type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
export function registerAcmePureFn<F extends (...args: any[]) => any>(fn: PureFunction<F>, id?: InjectPureFnId<F>) {
  if (!id) throw new Error('the mion build did not run');
  return {id, fn};
}
`,
		"consumer.ts": `import {registerAcmePureFn} from './toolkit.ts';
export const lower = registerAcmePureFn((s: string): string => s.toLowerCase());
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts", "toolkit.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if diags := markerAndPureFnDiags(resp.Diagnostics); len(diags) != 0 {
		t.Fatalf("library wrapper must produce ZERO scanner diagnostics, got: %+v", diags)
	}
	rep, ok := idInsertionReplacement(resp.Replacements)
	if !ok {
		t.Fatalf("wrapper consumer call must inject an id, replacements: %+v", resp.Replacements)
	}
	// The id belongs to the CONSUMER's package, not the wrapper's: a
	// registration belongs where it is written. This fixture has no package
	// name, so the owner half is empty.
	if !strings.Contains(rep.Text, "'#") {
		t.Errorf("wrapper call injected %q, want an id owned by the consumer", rep.Text)
	}
}

// TestPureFn_BothFormsInOneProgram confirms the two FORMS share one lane: a
// factory registration and a direct one in the same program each get their fn
// argument rewritten and their own id spliced.
func TestPureFn_BothFormsInOneProgram(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": pureFnDTS,
		"factory.ts": `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const slugify = registerPureFnFactory(function () {
  return function _slug(s: string): string { return s.toLowerCase(); };
});
`,
		"direct.ts": `import {registerPureFn} from '@mionjs/run-types/runtime';
export const double = registerPureFn((n: number): number => n * 2);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"factory.ts", "direct.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if diags := markerAndPureFnDiags(resp.Diagnostics); len(diags) != 0 {
		t.Fatalf("expected zero marker/pure-fn diagnostics, got: %+v", diags)
	}
	idReps, factoryReps := 0, 0
	for _, rep := range resp.Replacements {
		if rep.ImportFrom != "" {
			factoryReps++
		} else if rep.Start == rep.End && idSpliceRE.MatchString(rep.Text) {
			idReps++
		}
	}
	if factoryReps != 2 {
		t.Errorf("expected 2 fn rewrites (one per form), got %d in %+v", factoryReps, resp.Replacements)
	}
	if idReps != 2 {
		t.Errorf("expected 2 id splices (one per form), got %d in %+v", idReps, resp.Replacements)
	}
}
