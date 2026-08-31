package resolver_test

// Pins the unused-builder-const elision (always on, no flag): a value-first
// builder call whose result is provably unused in its own file emits NO
// reflection graph — the acceptance pair being
//
//	type X = InferType<typeof myRT>; createValidateFn<X>()  → fn cache only
//	createValidateFn(myRT)                                  → both caches
//
// and every positive "used" signal (value position, property access, export
// modifier, export specifier, let binding) keeps the graph. getRunType is
// never elided — it throws without an injected id.

import (
	"strings"
	"testing"
)

const builderPrelude = `import {createValidateFn, getRunType, type InferType} from '@mionjs/run-types';
import {object} from '@mionjs/run-types/builders';
import {string, number} from '@mionjs/run-types/formats';
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

// TestElision_ValueFormKeepsGraph — the acceptance pair, value side.
func TestElision_ValueFormKeepsGraph(t *testing.T) {
	bundle, valEntries := bundleEmitted(t, builderPrelude+`
const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(myRT);
`)
	if !bundle {
		t.Error("createValidateFn(myRT) is a value use — the builder graph must be emitted")
	}
	if valEntries == 0 {
		t.Error("the createValidateFn(myRT) site must emit its val entries")
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
