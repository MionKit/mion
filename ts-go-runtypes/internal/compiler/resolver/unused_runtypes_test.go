package resolver_test

// Pins the unused-builder-const elision (always on, no flag): a value-first
// builder call whose result is provably unused in its own file emits NO
// reflection graph. BOTH spellings of the unused const are elidable —
//
//	type X = InferType<typeof myRT>; createValidateFn<X>()  → fn cache only
//	createValidateFn(myRT)                                  → fn cache only
//
// because a createXFn resolves its own injected entry tuple and never reads the
// schema it was handed. Every positive "used" signal (a composing builder, a
// property access, an export modifier, an export specifier, a let binding)
// keeps the graph, and the id-lookup escapes (getRunType / getRunTypeId) are
// exempt — they throw without an injected id.

import (
	"strings"
	"testing"
)

const builderPrelude = `import {createValidateFn, createJsonEncoderFn, createBinaryEncoderFn, getRunType, getRunTypeId, type InferType} from '@ts-runtypes/core';
import {object, array, circular, self, partial} from '@ts-runtypes/core/builders';
import {string, number} from '@ts-runtypes/core/formats';
`

// bundleEmitted reports whether the response carries the runtype data bundle.
// The bundle's entry KEY is `rts_<hash>` but its MODULE basename is the fixed
// `runtypes` (entrymodules.ModuleName special-cases KindRunTypeBundle); check
// both so the assertion survives either representation.
func bundleEmitted(t *testing.T, code string) (bundle bool, valEntries int) {
	t.Helper()
	resp := scopeScan(t, code)
	for basename := range resp.EntryModules {
		if basename == "runtypes" || strings.HasPrefix(basename, "rts_") {
			bundle = true
		}
	}
	return bundle, len(familyEntryKeys(resp, "validate"))
}

// reflectionSites counts the reflection-only sites (empty FnId) the scan
// produced — the per-site view of the elision verdict, for files where a
// reflection root of their own keeps the bundle present regardless.
func reflectionSites(t *testing.T, code string) int {
	t.Helper()
	count := 0
	for _, site := range scopeScan(t, code).Sites {
		if site.FnId == "" && len(site.FnIds) == 0 {
			count++
		}
	}
	return count
}

// TestElision_TypeOnlyUseEmitsNoGraph — the acceptance pair, static side.
func TestElision_TypeOnlyUseEmitsNoGraph(t *testing.T) {
	bundle, valEntries := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
type X = InferType<typeof myRT>;
export const isX = createValidateFn<X>();
`)
	if bundle {
		t.Error("a type-only-used builder const must not emit the runtype bundle")
	}
	if valEntries == 0 {
		t.Error("the createValidateFn<X>() site must still emit its val entries")
	}
}

// TestElision_FactoryArgumentElided — the acceptance pair, value side: handing
// the const straight to a createXFn is NOT a value use (the factory resolves its
// own injected entry tuple), so the graph goes too.
func TestElision_FactoryArgumentElided(t *testing.T) {
	bundle, valEntries := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(myRT);
`)
	if bundle {
		t.Error("a const only handed to createValidateFn must not emit the runtype bundle")
	}
	if valEntries == 0 {
		t.Error("the createValidateFn(myRT) site must still emit its val entries")
	}
}

// TestElision_FactoryArgumentElidedEveryFamily — the exemption is keyed on the
// InjectTypeFnArgs marker, not on a name list, so every createXFn family gets
// it.
func TestElision_FactoryArgumentElidedEveryFamily(t *testing.T) {
	for _, call := range []string{
		"createValidateFn(myRT)",
		"createJsonEncoderFn(myRT)",
		"createBinaryEncoderFn(myRT)",
	} {
		if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const fn = `+call+`;
`); bundle {
			t.Errorf("%s must not keep the builder graph", call)
		}
	}
}

// TestElision_FactoryArgumentSharedByTwoFactories — several factories over one
// const are all non-uses, so the const stays elidable.
func TestElision_FactoryArgumentSharedByTwoFactories(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(myRT);
export const toJson = createJsonEncoderFn(myRT);
`); bundle {
		t.Error("a const handed to two factories and nothing else must not keep its graph")
	}
}

// TestElision_CircularFactoryArgumentElided — the runtime substitutes a live
// schema's own `.id` into the cache key, which the elision removes. A recursive
// schema is where that substitution was documented to matter, so pin that the
// value form still elides and still gets its val entries (behavior is pinned
// front-end in unusedBuilderElision.test.ts).
func TestElision_CircularFactoryArgumentElided(t *testing.T) {
	bundle, valEntries := bundleEmitted(t, builderPrelude+`
const myRT = circular(object({id: number(), children: array(self())}));
export const isX = createValidateFn(myRT);
`)
	if bundle {
		t.Error("a circular const only handed to createValidateFn must not emit the runtype bundle")
	}
	if valEntries == 0 {
		t.Error("the circular createValidateFn(myRT) site must still emit its val entries")
	}
}

// TestElision_ComposingBuilderArgumentKept — the exemption is for DIRECT factory
// arguments only: a composing builder really does read the value.
func TestElision_ComposingBuilderArgumentKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(partial(myRT));
`); !bundle {
		t.Error("a const composed by another builder must keep its runtype graph")
	}
}

// TestElision_ThirdPartyWrapperArgumentKept — the exemption covers the marker
// package's OWN factories only. A user wrapper declaring the same
// InjectTypeFnArgs marker may still read its RunType argument (walk it, key a
// map by its id), so handing the const to one stays a value use.
func TestElision_ThirdPartyWrapperArgumentKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
import type {InjectTypeFnArgs, RunType} from '@ts-runtypes/core';
function myWrapper<T>(rt: RunType<T>, fns?: InjectTypeFnArgs<T, 'val'>) {
  return {kind: (rt as {kind?: unknown}).kind, fns};
}
const myRT = object({a: string(), b: number()});
export const wrapped = myWrapper(myRT);
`); !bundle {
		t.Error("a const handed to a THIRD-PARTY wrapper must keep its runtype graph — the wrapper may read it")
	}
}

// TestElision_FactoryArgumentPlusValueUseKept — default-deny: one unrecognized
// position is enough to keep the graph.
func TestElision_FactoryArgumentPlusValueUseKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(myRT);
export const kind = myRT.kind;
`); !bundle {
		t.Error("a const both handed to a factory and read must keep its runtype graph")
	}
}

// TestElision_ExportedConstKept — an export modifier makes the const
// externally reachable; per-file analysis keeps it unconditionally.
func TestElision_ExportedConstKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
export const myRT = object({a: string()});
`); !bundle {
		t.Error("an exported builder const must keep its runtype graph")
	}
}

// TestElision_ExportSpecifierKept — `export {myRT}` counts as a use.
func TestElision_ExportSpecifierKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string()});
export {myRT};
`); !bundle {
		t.Error("an export-specifier reference must keep the runtype graph")
	}
}

// TestElision_PropertyAccessKept — reading off the const is a value use.
func TestElision_PropertyAccessKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string()});
export const kind = myRT.kind;
`); !bundle {
		t.Error("a property access on the builder const must keep the runtype graph")
	}
}

// TestElision_LetBindingKept — only plain `const` bindings are analyzable.
func TestElision_LetBindingKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
let myRT = object({a: string()});
type X = InferType<typeof myRT>;
export const isX = createValidateFn<X>();
`); !bundle {
		t.Error("a let-bound builder result must keep the runtype graph")
	}
}

// TestElision_DiscardedResultElided — a bare expression-statement builder call
// binds nothing, so nothing can use it.
func TestElision_DiscardedResultElided(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
object({a: string()});
export const keep = 1;
`); bundle {
		t.Error("a discarded builder result must not emit the runtype bundle")
	}
}

// TestElision_GetRunTypeNeverElided — getRunType looks the injected id up and
// throws without it, so its sites are exempt even when the result is unused.
func TestElision_GetRunTypeNeverElided(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
interface User { name: string }
const node = getRunType<User>();
type X = InferType<typeof node>;
export const keep = 1;
`); !bundle {
		t.Error("getRunType sites must never be elided (the call throws without an injected id)")
	}
}

// TestElision_GetRunTypeArgumentKept — the id-lookup escape is not a createXFn:
// it carries an InjectRunTypeId marker, so handing the const to it stays a value
// use and the graph the lookup returns is emitted.
func TestElision_GetRunTypeArgumentKept(t *testing.T) {
	if bundle, _ := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const node = getRunType(myRT);
`); !bundle {
		t.Error("getRunType(myRT) must keep the builder graph")
	}
}

// TestElision_GetRunTypeIdStaticFormElided — marker coverage rule, static shape.
// A getRunTypeId site is itself a reflection root, so the bundle is present
// either way; the verdict on the CONST shows in the reflection-site count.
// `getRunTypeId<X>()` names the type only, so only its own site remains.
func TestElision_GetRunTypeIdStaticFormElided(t *testing.T) {
	if sites := reflectionSites(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
type X = InferType<typeof myRT>;
export const id = getRunTypeId<X>();
`); sites != 1 {
		t.Errorf("want 1 reflection site (the getRunTypeId call), got %d — the builder const was not elided", sites)
	}
}

// TestElision_GetRunTypeIdValueFormKept — marker coverage rule, value shape:
// `getRunTypeId(myRT)` is an id-lookup escape like getRunType, so the const's
// own builder site is kept alongside it.
func TestElision_GetRunTypeIdValueFormKept(t *testing.T) {
	if sites := reflectionSites(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const id = getRunTypeId(myRT);
`); sites != 2 {
		t.Errorf("want 2 reflection sites (getRunTypeId + the kept builder), got %d", sites)
	}
}
