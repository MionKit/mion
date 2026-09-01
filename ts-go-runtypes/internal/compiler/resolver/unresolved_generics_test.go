package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// unresolved_generics_test.go pins the unresolved-generics rejection model
// (the typeid-walk depth-backstop addendum): a marker call must
// reflect a FULLY RESOLVED type. Bare free params are MKR003 (existing);
// free params CONTAINED in data positions are MKR010; a written generic
// reference MISSING required (default-less) type arguments is MKR011; and
// type-parameter DEFAULTS resolve at use sites (checker-applied), so
// defaulted generics used bare work and must keep working.

// firstOf returns the first diagnostic with the code, or nil.
func firstOf(diags []diagnostics.Diagnostic, code string) *diagnostics.Diagnostic {
	for i := range diags {
		if diags[i].Code == code {
			return &diags[i]
		}
	}
	return nil
}

// requireRelatedContaining asserts one of the diagnostic's Related entries has
// a message containing want and a real position.
func requireRelatedContaining(t *testing.T, diag *diagnostics.Diagnostic, want string) {
	t.Helper()
	for _, related := range diag.Related {
		if strings.Contains(related.Message, want) {
			if related.FilePath == "" || related.StartLine <= 0 {
				t.Fatalf("Related %q must carry a real declaration position, got %+v", want, related)
			}
			return
		}
	}
	t.Fatalf("expected a Related entry containing %q, got %+v", want, diag.Related)
}

// --- MKR010: contained free type parameters -------------------------------

// TestScan_ContainedFreeParam_Static — `A<T>` in a generic body: the free `T`
// is NESTED in the type argument (the bare-T MKR003 gate doesn't see it), and
// before this model it silently collapsed to `unknown`, aliasing every
// instantiation context onto one id. Now: MKR010 naming `T`, Related pointing
// at `T`'s declaration, and NO injection site.
func TestScan_ContainedFreeParam_Static(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A<PropA> { a: PropA }
export function wrap<T>() {
  return getRunTypeId<A<T>>();
}
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedTypeParameter)
	if diag == nil {
		t.Fatalf("expected MKR010 for A<T> in a generic body, got %+v", resp.Diagnostics)
	}
	if diag.Severity != diagnostics.SeverityError {
		t.Fatalf("MKR010 must be Error severity, got %d", diag.Severity)
	}
	if len(diag.Args) < 1 || diag.Args[0] != "T" {
		t.Fatalf("MKR010 must name the free parameter T, got %v", diag.Args)
	}
	requireRelatedContaining(t, diag, "type parameter `T` is declared here")
	if len(resp.Sites) != 0 {
		t.Fatalf("no site must be emitted for an unresolved generic, got %d", len(resp.Sites))
	}
}

// TestScan_ContainedFreeParam_ValueFirst is the value-first pair (Marker
// test-coverage rule): T inferred from a parameter's value type `A<T>`.
func TestScan_ContainedFreeParam_ValueFirst(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A<PropA> { a: PropA }
export function wrap<T>(value: A<T>) {
  return getRunTypeId(value);
}
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedTypeParameter)
	if diag == nil {
		t.Fatalf("expected MKR010 for the value-first form, got %+v", resp.Diagnostics)
	}
	if len(diag.Args) < 1 || diag.Args[0] != "T" {
		t.Fatalf("MKR010 must name the free parameter T, got %v", diag.Args)
	}
	if len(resp.Sites) != 0 {
		t.Fatalf("no site must be emitted, got %d", len(resp.Sites))
	}
}

// TestScan_ContainedFreeParam_ArrayAndInline covers the other data positions:
// `T[]` and an inline `{a: T}` — both nested free params, both MKR010.
func TestScan_ContainedFreeParam_ArrayAndInline(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
export function wrapArray<T>() {
  return getRunTypeId<T[]>();
}
export function wrapInline<T>() {
  return getRunTypeId<{a: T}>();
}
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedTypeParameter); got != 2 {
		t.Fatalf("expected MKR010 for both T[] and {a: T}, got %d: %+v", got, resp.Diagnostics)
	}
	if len(resp.Sites) != 0 {
		t.Fatalf("no sites must be emitted, got %d", len(resp.Sites))
	}
}

// TestScan_ContainedFreeParam_DeepChain_RelatedHops — the free param sits two
// NAMED types down (`Outer<T>` → `Inner<V>` → `v: V=T`); the diagnostic's
// Related must carry the param declaration AND the chain hops so the user can
// follow where the unresolved parameter came from.
func TestScan_ContainedFreeParam_DeepChain_RelatedHops(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface Inner<U> { u: U }
interface Outer<V> { inner: Inner<V> }
export function wrap<T>() {
  return getRunTypeId<Outer<T>>();
}
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedTypeParameter)
	if diag == nil {
		t.Fatalf("expected MKR010, got %+v", resp.Diagnostics)
	}
	if len(diag.Args) < 1 || diag.Args[0] != "T" {
		t.Fatalf("must name the ROOT free parameter T, got %v", diag.Args)
	}
	requireRelatedContaining(t, diag, "type parameter `T` is declared here")
	requireRelatedContaining(t, diag, "reached via `Outer`")
}

// TestScan_BodyDefaultDoesNotResolve — a parameter DEFAULT applies where a
// CALLER omits the argument, never inside the generic's own body: `A<T>` under
// `function f<T = string>` is still unresolved and still MKR010.
func TestScan_BodyDefaultDoesNotResolve(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A<PropA> { a: PropA }
export function wrap<T = string>() {
  return getRunTypeId<A<T>>();
}
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedTypeParameter); got != 1 {
		t.Fatalf("a default on the BODY's type param must not resolve it — expected MKR010, got %+v", resp.Diagnostics)
	}
}

// TestScan_GenericMethodExempt — a generic METHOD on a concrete type
// (`find<Row>(...): Row[]`) is a signature interior: its own type parameters
// are bound per call of the method and methods aren't data, so the type
// resolves cleanly with zero diagnostics (both marker shapes, same id).
func TestScan_GenericMethodExempt(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface Repo { name: string; find<Row>(query: string): Row[]; }
declare const repo: Repo;
export const a = getRunTypeId<Repo>();
export const b = getRunTypeId(repo);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedTypeParameter); got != 0 {
		t.Fatalf("generic METHOD params are exempt — got %d MKR010: %+v", got, resp.Diagnostics)
	}
	if len(resp.Sites) != 2 || resp.Sites[0].ID == "" || resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("Repo must resolve to one real id from both shapes, got %+v", resp.Sites)
	}
}

// --- Defaults: checker-resolved at use sites (must keep working) ----------

// TestScan_DefaultedGeneric_BareResolves — `interface A<S extends string =
// string>` written BARE is legal TS: the checker applies the default before
// the scan sees the type, so bare `A` and explicit `A<string>` converge on the
// SAME id with zero diagnostics.
func TestScan_DefaultedGeneric_BareResolves(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A<S extends string = string> { a: S }
export const bare = getRunTypeId<A>();
export const explicit = getRunTypeId<A<string>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("defaulted bare generic must scan clean, got %+v", resp.Diagnostics)
	}
	if len(resp.Sites) != 2 || resp.Sites[0].ID == "" || resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("bare A and explicit A<string> must share one id, got %+v", resp.Sites)
	}
}

// TestScan_DefaultChain_Resolves — defaults chained through generics THREE
// levels deep (`C` defaults to `B<A<'hi'>>`, whose own param defaults through
// `A`): bare use of the outermost resolves through the whole chain.
func TestScan_DefaultChain_Resolves(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A<S extends string = 'hi'> { a: S }
interface B<X extends A = A> { b: X }
interface C<Y extends B = B> { c: Y }
export const c = getRunTypeId<C>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("a fully-defaulted generics chain must scan clean, got %+v", resp.Diagnostics)
	}
	if len(resp.Sites) != 1 || resp.Sites[0].ID == "" {
		t.Fatalf("expected one resolved site, got %+v", resp.Sites)
	}
}

// TestScan_PartialDefaults_Resolve — trailing defaulted params may be omitted:
// `P<string>` over `interface P<S, T = number>` resolves (equal to the fully
// explicit form), while omitting the REQUIRED `S` is MKR011 (next section).
func TestScan_PartialDefaults_Resolve(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface P<S, T = number> { s: S; t: T }
export const partial = getRunTypeId<P<string>>();
export const full = getRunTypeId<P<string, number>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("partial application with trailing defaults must scan clean, got %+v", resp.Diagnostics)
	}
	if len(resp.Sites) != 2 || resp.Sites[0].ID == "" || resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("P<string> and P<string, number> must share one id, got %+v", resp.Sites)
	}
}

// --- MKR011: written generic missing required type arguments --------------

// TestScan_MissingTypeArgs_Bare — bare `A2` over `interface A2<S>` (no
// default) is TS2314 territory, but the dev lane doesn't typecheck and the
// checker yields plain `any` (pinned empirically — the semantic walks can't
// see it). The syntactic guard reports MKR011 naming type + parameter, with
// Related at the default-less parameter's declaration; no site.
func TestScan_MissingTypeArgs_Bare(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A2<S> { a: S }
export const w = getRunTypeId<A2>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedGenericType)
	if diag == nil {
		t.Fatalf("expected MKR011 for bare un-defaulted generic, got %+v", resp.Diagnostics)
	}
	if diag.Severity != diagnostics.SeverityError {
		t.Fatalf("MKR011 must be Error severity, got %d", diag.Severity)
	}
	if len(diag.Args) < 2 || diag.Args[0] != "A2" || diag.Args[1] != "S" {
		t.Fatalf("MKR011 args must be [type, param] = [A2, S], got %v", diag.Args)
	}
	requireRelatedContaining(t, diag, "type parameter `S` is declared here without a default")
	if len(resp.Sites) != 0 {
		t.Fatalf("no site must be emitted for a missing-args generic, got %d", len(resp.Sites))
	}
}

// TestScan_MissingTypeArgs_ConstrainedNoDefault is the user's exact chain
// example: `interface B<X extends A<'hello'>>` — a CONSTRAINT does not permit
// omission (only a default does). Bare `B` is MKR011 pointing at `X`;
// explicitly instantiated `B<A<'hello'>>` resolves clean.
func TestScan_MissingTypeArgs_ConstrainedNoDefault(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A<S extends string = string> { a: S }
interface B<X extends A<'hello'>> { b: X }
export const bad = getRunTypeId<B>();
export const good = getRunTypeId<B<A<'hello'>>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedGenericType)
	if diag == nil {
		t.Fatalf("expected MKR011 for bare B (constraint != default), got %+v", resp.Diagnostics)
	}
	if len(diag.Args) < 2 || diag.Args[0] != "B" || diag.Args[1] != "X" {
		t.Fatalf("MKR011 args must be [B, X], got %v", diag.Args)
	}
	requireRelatedContaining(t, diag, "type parameter `X` is declared here without a default")
	// The explicit instantiation must still produce its site.
	if len(resp.Sites) != 1 || resp.Sites[0].ID == "" {
		t.Fatalf("B<A<'hello'>> must resolve to a real site, got %+v", resp.Sites)
	}
}

// TestScan_MissingTypeArgs_NestedWritten — the offender NESTED inside a
// written argument (`Box<A2>`): the syntactic walk descends written type
// arguments.
func TestScan_MissingTypeArgs_NestedWritten(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A2<S> { a: S }
interface Box<V> { v: V }
export const w = getRunTypeId<Box<A2>>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedGenericType)
	if diag == nil {
		t.Fatalf("expected MKR011 for nested bare A2, got %+v", resp.Diagnostics)
	}
	if len(diag.Args) < 2 || diag.Args[0] != "A2" {
		t.Fatalf("must name the nested offender A2, got %v", diag.Args)
	}
}

// TestScan_MissingTypeArgs_ThroughAlias — the offender buried behind a type
// ALIAS (`type X = A2` → marker over `X`): the walk follows alias bodies and
// the Related chain carries the alias hop.
func TestScan_MissingTypeArgs_ThroughAlias(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A2<S> { a: S }
type X = A2;
export const w = getRunTypeId<X>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	diag := firstOf(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedGenericType)
	if diag == nil {
		t.Fatalf("expected MKR011 through the alias chain, got %+v", resp.Diagnostics)
	}
	if len(diag.Args) < 2 || diag.Args[0] != "A2" || diag.Args[1] != "S" {
		t.Fatalf("must name the CHAIN-END offender [A2, S], got %v", diag.Args)
	}
	requireRelatedContaining(t, diag, "reached via alias `X`")
	requireRelatedContaining(t, diag, "type parameter `S` is declared here without a default")
}

// TestScan_MissingTypeArgs_ValueFirstResidual documents the accepted residual:
// the value-first shape has NO written type-argument nodes, and the value's
// declaration (`declare const x: A2`) is itself the TS error the user sees in
// their editor — the scan sees plain `any` and stays silent. Pinned so a
// future fix (if any) shows up as a deliberate change.
func TestScan_MissingTypeArgs_ValueFirstResidual(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface A2<S> { a: S }
declare const value: A2;
export const w = getRunTypeId(value);
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countCode(resp.Diagnostics, diagnostics.CodeMarkerUnresolvedGenericType); got != 0 {
		t.Fatalf("value-first missing-args is a documented residual (TS errors at the declaration); got %d MKR011", got)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected the residual silent site, got %d", len(resp.Sites))
	}
}
