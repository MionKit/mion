package resolver_test

import (
	"strings"
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

// requireSingle asserts exactly one diagnostic with the code, Error severity,
// and (when expectedArg != "") the expected first arg, returning it.
func requireSingle(t *testing.T, diags []diagnostics.Diagnostic, code, expectedArg string) {
	t.Helper()
	if got := countCode(diags, code); got != 1 {
		t.Fatalf("expected exactly one %s, got %d: %+v", code, got, diags)
	}
	for _, diag := range diags {
		if diag.Code != code {
			continue
		}
		if diag.Severity != diagnostics.SeverityError {
			t.Fatalf("%s must be Error severity, got %d", code, diag.Severity)
		}
		if expectedArg != "" {
			if len(diag.Args) < 1 || diag.Args[0] != expectedArg {
				t.Fatalf("%s must carry arg[0]=%q, got %v", code, expectedArg, diag.Args)
			}
		}
	}
}

// TestScan_SelfInstantiatingGeneric_EmitsMKR009 pins the typeid walker depth
// backstop's cause classification (docs/done/typeid-walk-depth-backstop.md).
// `Iter<T>`'s `map` method returns a FRESH instantiation `Iter<U>` on every
// level, so each spine level is a new *checker.Type pointer: the structural-id
// walk's pointer cycle guard never fires and, without the cap, Compute recursed
// until a fatal Go stack overflow. The cap now classifies the overflowing stack
// — instantiations of ONE named type dominating it — and reports MKR009 naming
// the self-instantiating generic (`Iter`), at the call site, deterministically.
// This test COMPLETING at all (no crash) is itself half the assertion. The
// top-level type argument is concrete, so neither MKR003 nor MKR010 pre-empts
// it: the free `U` lives in `map`'s own signature, which is exempt by design.
func TestScan_SelfInstantiatingGeneric_EmitsMKR009(t *testing.T) {
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
	requireSingle(t, resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric, "Iter")
	if got := countCode(resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded); got != 0 {
		t.Fatalf("classified spiral must report MKR009, not the MKR008 fallback; got %d MKR008", got)
	}
}

// TestScan_SelfInstantiatingGeneric_ValueFirst_EmitsMKR009 is the value-first
// pair of the test above (Marker test-coverage rule): T is inferred from a
// value of type `Iter<string>` rather than supplied as a type argument. The cap
// lives in the shared structural-id walker, so both call shapes classify
// identically.
func TestScan_SelfInstantiatingGeneric_ValueFirst_EmitsMKR009(t *testing.T) {
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
	requireSingle(t, resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric, "Iter")
}

// TestScan_RenamedTypeParams_StillSelfInstantiating pins that renaming the type
// PARAMETERS to `String` / `Number` does not resolve anything — inside the
// interface those names are the parameters (shadowing the globals), so the
// shape is exactly as generic as `<T>` / `<U>` and still spirals to MKR009.
// The resolved fix is a MONOMORPHIC interface (next test), not a rename.
func TestScan_RenamedTypeParams_StillSelfInstantiating(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface Iter<String> { map<Number>(fn: (x: String) => Number): Iter<Number>; }
export const id = getRunTypeId<Iter<string>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	requireSingle(t, resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric, "Iter")
}

// TestScan_MonomorphicRecursiveIter_Resolves pins the RESOLVED form of the
// shape: with no type parameters the recursion closes BY REFERENCE (same
// *checker.Type pointer, the ordinary cycle guard), so the type reflects to a
// real id with zero depth diagnostics — from BOTH marker call shapes, which
// must converge on the same id (form-equivalence, Marker test-coverage rule).
func TestScan_MonomorphicRecursiveIter_Resolves(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
interface NumberIter { map(fn: (x: string) => number): NumberIter; }
declare const it: NumberIter;
export const a = getRunTypeId<NumberIter>();
export const b = getRunTypeId(it);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric) +
		countCode(resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded); got != 0 {
		t.Fatalf("a monomorphic recursive interface must not trip the depth backstop, got %d depth diagnostics: %+v", got, resp.Diagnostics)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 injection sites (static + value-first), got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID == "" || resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("both call shapes must resolve to the SAME real id, got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}

// TestScan_GrowingArgumentAlias_EmitsMKR009 covers the second unbounded shape:
// an alias that re-instantiates itself with a GROWING type argument each level
// (`Nest<[T]>`). No structure ever repeats, so this is unbounded even for a
// structural detector — the cap classifies the dominating alias symbol and
// names it.
func TestScan_GrowingArgumentAlias_EmitsMKR009(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
type Nest<T> = { value: T; next: Nest<[T]> };
export const id = getRunTypeId<Nest<string>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	requireSingle(t, resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric, "Nest")
}

// TestScan_DeepAnonymousNesting_FallsBackToMKR008 pins the residual fallback:
// literally written nesting past the cap with NO named type dominating the
// stack (every level a distinct anonymous literal). No spiral to name, so the
// plain too-deep MKR008 fires.
func TestScan_DeepAnonymousNesting_FallsBackToMKR008(t *testing.T) {
	const depth = 520 // just past maxWalkDepth (512)
	code := "import {getRunTypeId} from '@ts-runtypes/core';\n" +
		"type Deep = " + strings.Repeat("{a: ", depth) + "string" + strings.Repeat("}", depth) + ";\n" +
		"export const d = getRunTypeId<Deep>();\n"
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	requireSingle(t, resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded, "")
	if got := countCode(resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric); got != 0 {
		t.Fatalf("anonymous nesting has no culprit to name — must fall back to MKR008, got %d MKR009", got)
	}
}

// TestScan_LegitDeepAndCyclic_NoDepthDiagnostics is the id-stability guard the
// todo asks for: the depth cap only fires on graphs that previously
// stack-overflowed (or absurd written nesting past the cap), so ordinary deep
// types AND genuinely-cyclic types must be untouched — each still resolves to a
// real id and emits ZERO depth diagnostics. A real cycle (`L` referring to
// itself) is pointer-detected and closes long before the cap.
func TestScan_LegitDeepAndCyclic_NoDepthDiagnostics(t *testing.T) {
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
	if got := countCode(resp.Diagnostics, diagnostics.CodeStructuralIdDepthExceeded) +
		countCode(resp.Diagnostics, diagnostics.CodeMarkerSelfInstantiatingGeneric); got != 0 {
		t.Fatalf("legit deep/cyclic types must NOT trip the depth backstop, got %d depth diagnostics: %+v", got, resp.Diagnostics)
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
