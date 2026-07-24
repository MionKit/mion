package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// countCode tallies diagnostics carrying the given code.
func countCode(diags []diagnostics.Diagnostic, code string) int {
	n := 0
	for _, diag := range diags {
		if diag.Code == code {
			n++
		}
	}
	return n
}

// TestScan_DeepFreshInstantiation_EmitsMKR008 pins the typeid walker depth
// backstop (docs/done/typeid-walk-depth-backstop.md). `Iter<T>`'s `map` method
// returns a FRESH instantiation `Iter<U>` on every level, so each spine level is
// a new *checker.Type pointer: the structural-id walk's pointer cycle guard never
// fires and, without a depth cap, Compute recurses until a fatal Go stack
// overflow. The cap turns that into a deterministic MKR008 (Error) at the call
// site — this test COMPLETING at all (no crash) is itself half the assertion.
// The top-level type argument is concrete (`Iter<string>`), so MKR003 does not
// pre-empt it; the free `U` that drives the fresh instantiation is nested inside
// `map`.
func TestScan_DeepFreshInstantiation_EmitsMKR008(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Iter<T> { map<U>(fn: (x: T) => U): Iter<U>; }
export const id = getRunTypeId<Iter<string>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan returned an op error (want a clean diagnostic, not a failed op): %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded); got != 1 {
		t.Fatalf("expected exactly one MKR008 (structural-id depth cap), got %d: %+v", got, resp.Diagnostics)
	}
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodeStructuralIdDepthExceeded && diag.Severity != diagnostics.SeverityError {
			t.Fatalf("MKR008 must be Error severity, got %d", diag.Severity)
		}
	}
}

// TestScan_DeepFreshInstantiation_ValueFirst_EmitsMKR008 is the value-first
// pair of the test above (Marker test-coverage rule): T is inferred from a value
// of type `Iter<string>` rather than supplied as a type argument. The depth cap
// lives in the shared structural-id walker, so both call shapes must trip it
// identically — same MKR008, same Error severity.
func TestScan_DeepFreshInstantiation_ValueFirst_EmitsMKR008(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Iter<T> { map<U>(fn: (x: T) => U): Iter<U>; }
declare const it: Iter<string>;
export const id = getRunTypeId(it);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan returned an op error (want a clean diagnostic, not a failed op): %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded); got != 1 {
		t.Fatalf("expected exactly one MKR008 for the value-first form, got %d: %+v", got, resp.Diagnostics)
	}
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodeStructuralIdDepthExceeded && diag.Severity != diagnostics.SeverityError {
			t.Fatalf("MKR008 must be Error severity, got %d", diag.Severity)
		}
	}
}

// TestScan_LegitDeepAndCyclic_NoMKR008 is the id-stability guard the todo asks
// for: the depth cap only ever fires on graphs that TODAY stack-overflow, so
// ordinary deep types AND genuinely-cyclic types must be untouched — each still
// resolves to a real id and emits ZERO MKR008. A real cycle (`L` referring to
// itself) is pointer-detected and closes long before the cap.
func TestScan_LegitDeepAndCyclic_NoMKR008(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
type L = { value: number; next: L | null };
type Deep = { a: { b: { c: { d: { e: { f: string } } } } } };
export const l = getRunTypeId<L>();
export const d = getRunTypeId<Deep>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded); got != 0 {
		t.Fatalf("legit deep/cyclic types must NOT trip the depth cap, got %d MKR008: %+v", got, resp.Diagnostics)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 injection sites (L, Deep), got %d", len(resp.Sites))
	}
	for _, site := range resp.Sites {
		if site.ID == "" {
			t.Fatalf("a legit type must resolve to a real id, got empty: %+v", site)
		}
	}
}
