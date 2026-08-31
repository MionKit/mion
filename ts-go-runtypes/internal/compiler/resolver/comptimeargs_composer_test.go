package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// composerCTADTS overlays the composer builders with their real CompTimeArgs
// param marker — the variadic `tuple` (const T + CompTimeArgs<T>), the
// spread-form `union` (CompTimeArgs<readonly [...T]>), the variadic `func`
// (const P + CompTimeArgs<P>), and the simple-generic `array`
// (CompTimeArgs<RunType<T>>). The point of these tests is to prove tsgo DETECTS
// the CompTimeArgs marker on each of those param shapes and runs the literal
// validation (a builder call / array-of-builders / const-ref passes; a dynamic
// or spread child raises a CTA diagnostic). CompTimeArgs is the zero-cost
// identity `T` (matching markers.ts — the old `T & brand` intersection cost ~700
// instantiations on the tuple shapes), so detection is SYNTACTIC: the scanner
// reads the `CompTimeArgs<…>` annotation node (detectCompTimeArgsByNode), not a
// brand property on the resolved type. No Go production code beyond that
// detection is involved; the literal check is the existing isBuilderCallPredicate.
const composerCTADTS = `declare module '@mionjs/run-types' {
  export interface RunType<T = unknown> { readonly id: string; }
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T;
  export type InferType<R> = R extends RunType<infer T> ? T : never;
  export type MapTuple<T extends readonly RunType[]> = {-readonly [K in keyof T]: InferType<T[K]>};
  export function string(id?: InjectRunTypeId<string>): RunType<string>;
  export function number(id?: InjectRunTypeId<number>): RunType<number>;
  export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean>;
  export function array<T>(item: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
  export function tuple<const T extends readonly RunType[]>(items: CompTimeArgs<T>, id?: InjectRunTypeId<MapTuple<T>>): RunType<MapTuple<T>>;
  export function union<T extends readonly RunType[]>(members: CompTimeArgs<readonly [...T]>, id?: InjectRunTypeId<MapTuple<T>[number]>): RunType<MapTuple<T>[number]>;
  export function func<const P extends readonly RunType[] = []>(params?: CompTimeArgs<P>, id?: InjectRunTypeId<(...args: MapTuple<P>) => void>): RunType<(...args: MapTuple<P>) => void>;
  export type ObjectType<C> = {[K in keyof C]: C[K] extends RunType<infer T> ? T : C[K]};
  export function object<const C extends Record<string, unknown>>(config: CompTimeArgs<C>, id?: InjectRunTypeId<ObjectType<C>>): RunType<ObjectType<C>>;
}
`

// scanComposerCTA scans a single test.ts against composerCTADTS and returns the
// CTA-family diagnostics (CompTimeArgs gate only — MKR/other codes filtered out).
func scanComposerCTA(t *testing.T, code string) []diagnostics.Diagnostic {
	t.Helper()
	r := setupInline(t, map[string]string{"runtypes.d.ts": composerCTADTS, "test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var cta []diagnostics.Diagnostic
	for _, d := range filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker) {
		if strings.HasPrefix(d.Code, "CTA") {
			cta = append(cta, d)
		}
	}
	return cta
}

// TestComposerCTA_BuilderChildrenAccepted is the positive proof across every
// param shape: a composer fed builder-call children (directly, as an
// array-of-builders, or via a module-scope const bound to one) raises NO CTA
// diagnostic. Covers array (simple generic), tuple (const T), union (spread
// brand), and func (const P) in one pass.
func TestComposerCTA_BuilderChildrenAccepted(t *testing.T) {
	const code = `import {array, tuple, union, func, string, number} from '@mionjs/run-types';
const s = string();
const _arr = array(string());
const _arrConst = array(s);
const _tup = tuple({required: [string(), number()]});
const _uni = union([string(), number()]);
const _fn = func({params: [string(), number()]});
const _fn0 = func();
void _arr; void _arrConst; void _tup; void _uni; void _fn; void _fn0;
`
	if cta := scanComposerCTA(t, code); len(cta) != 0 {
		t.Fatalf("expected no CTA diagnostics for builder-call children, got %d: %+v", len(cta), cta)
	}
}

// TestComposerCTA_DynamicArrayChildRejected proves a dynamic (ternary) schema
// passed to a simple-generic composer (array) raises a CTA forbidden-construct
// diagnostic — i.e. tsgo detects CompTimeArgs on `CompTimeArgs<RunType<T>>`.
func TestComposerCTA_DynamicArrayChildRejected(t *testing.T) {
	const code = `import {array, string} from '@mionjs/run-types';
declare const cond: boolean;
const _bad = array(cond ? string() : string());
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for dynamic array child, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}

// TestComposerCTA_TupleSpreadAccepted proves the spread relaxation for the
// const-tuple brand (`CompTimeArgs<T>`): a spread of a module-scope `const`
// bound to an ARRAY literal of builder calls merges cleanly — the items array
// is statically resolvable, so no CTA diagnostic fires. (The pre-relaxation
// behavior rejected every spread; now a `const`-fragment spread is the
// supported split-and-merge pattern.)
func TestComposerCTA_TupleSpreadAccepted(t *testing.T) {
	const code = `import {tuple, string, number, boolean} from '@mionjs/run-types';
const base = [string(), number()];
const _ok = tuple({required: [...base, boolean()]});
void _ok;
`
	if cta := scanComposerCTA(t, code); len(cta) != 0 {
		t.Fatalf("expected no CTA diagnostics for tuple spread of a const array fragment, got %d: %+v", len(cta), cta)
	}
}

// TestComposerCTA_UnionSpreadAccepted is the union analogue: a spread of a
// `const` array fragment into the awkward `CompTimeArgs<readonly [...T]>` param
// is accepted (statically resolvable), proving the relaxation reaches that
// brand shape too.
func TestComposerCTA_UnionSpreadAccepted(t *testing.T) {
	const code = `import {union, string, number} from '@mionjs/run-types';
const base = [string()];
const _ok = union([...base, number()]);
void _ok;
`
	if cta := scanComposerCTA(t, code); len(cta) != 0 {
		t.Fatalf("expected no CTA diagnostics for union spread of a const array fragment, got %d: %+v", len(cta), cta)
	}
}

// TestComposerCTA_ObjectSpreadAccepted is the headline split-and-merge pattern:
// `object({...base, extra: …})` where `base` is a module-scope `const` bound to
// an object literal of field builders. TypeScript merges the spread at the type
// level, so once the spread validates the builder reflects the merged object.
func TestComposerCTA_ObjectSpreadAccepted(t *testing.T) {
	const code = `import {object, string, number} from '@mionjs/run-types';
const base = {id: number(), name: string()};
const _ok = object({...base, extra: string()});
void _ok;
`
	if cta := scanComposerCTA(t, code); len(cta) != 0 {
		t.Fatalf("expected no CTA diagnostics for object spread of a const fragment, got %d: %+v", len(cta), cta)
	}
}

// TestComposerCTA_SpreadCrossModuleAccepted pins Decision 2: the spread operand
// trace follows import aliases, so a shared fragment imported from another
// module merges just like a same-module one. The strongest form of the
// split-and-merge use case (shared schema fragments live in their own module).
func TestComposerCTA_SpreadCrossModuleAccepted(t *testing.T) {
	const fragment = `import {string, number} from '@mionjs/run-types';
export const base = {id: number(), name: string()};
`
	const code = `import {object, string} from '@mionjs/run-types';
import {base} from './fragment';
const _ok = object({...base, extra: string()});
void _ok;
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": composerCTADTS, "fragment.ts": fragment, "test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, d := range filterDiagsByFamily(resp.Diagnostics, diagnostics.FamilyMarker) {
		if strings.HasPrefix(d.Code, "CTA") {
			t.Fatalf("expected no CTA diagnostics for cross-module spread, got %s: %+v", d.Code, d)
		}
	}
}

// TestComposerCTA_SpreadDynamicRejected keeps the reject path: a spread whose
// operand can't be statically resolved to a container literal — here a
// `declare const` carrying only a TYPE (no initializer) — still raises a CTA
// forbidden-construct. The relaxation is for resolvable `const` fragments only.
func TestComposerCTA_SpreadDynamicRejected(t *testing.T) {
	const code = `import {tuple, string} from '@mionjs/run-types';
declare const parts: [import('@mionjs/run-types').RunType<string>];
const _bad = tuple({required: [...parts]});
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for spread of an unresolvable operand, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}

// Shape-mismatch / scalar / dynamic / non-`const` spread rejects are pinned by
// the reflection-free unit tests in internal/compiler/comptimeargs (CheckLiteral
// directly), since a deliberately malformed reject fixture (e.g. an object
// spread of an array) would otherwise reach typeid reflection here. See
// internal/compiler/comptimeargs/spread_test.go.

// TestComposerCTA_FuncDynamicParamsRejected proves the variadic func params
// brand (`CompTimeArgs<P>`, const P) is detected: a const bound to a ternary
// (non-builder, non-literal) traces to a forbidden construct.
func TestComposerCTA_FuncDynamicParamsRejected(t *testing.T) {
	const code = `import {func, string} from '@mionjs/run-types';
declare const cond: boolean;
const dyn = cond ? [string()] : [string()];
const _bad = func(dyn);
void _bad;
`
	cta := scanComposerCTA(t, code)
	if len(cta) != 1 {
		t.Fatalf("expected 1 CTA diagnostic for dynamic func params, got %d: %+v", len(cta), cta)
	}
	if cta[0].Code != diagnostics.CodeCompTimeArgsForbiddenConstruct {
		t.Fatalf("expected %s, got %q", diagnostics.CodeCompTimeArgsForbiddenConstruct, cta[0].Code)
	}
}
