package typeid_test

import (
	"slices"
	"testing"
)

// codesUnderLib collects the diagnostic codes a scan produced under one lib.
func codesUnderLib(t *testing.T, lib string, code string) []string {
	t.Helper()
	_, response := scanUnderLib(t, lib, code)
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range response.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	return codes
}

// arraySugarSource is the shape config-lib-missing-base exists for. `Array<number>` would raise
// marker-any-from-unresolved-name (a written NAME that failed to resolve), but `number[]` writes no name,
// so the silent-`any` guard family never looks at it.
const arraySugarSource = `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{grid: number[][]; names: readonly string[]}>();
`

// TestLibGuard_NoBaseEditionIsRefused — the hole, and the guard that closes it.
//
// With no base ECMAScript edition TypeScript never declares the `Array` global,
// and the checker resolves `number[]` to an ordinary empty object rather than to
// the error type the silent-`any` guards key on. Before config-lib-missing-base this compiled
// clean and emitted a validator that accepted any value.
func TestLibGuard_NoBaseEditionIsRefused(t *testing.T) {
	for _, unsound := range []string{"", "es2015.core", "esnext.disposable"} {
		label := unsound
		if label == "" {
			label = "(empty)"
		}
		codes := codesUnderLib(t, unsound, arraySugarSource)
		if !slices.Contains(codes, "config-lib-missing-base") {
			t.Errorf("lib %s declares no base edition and must be refused, got %v", label, codes)
		}
	}
}

// TestLibGuard_RealSelectionsAreNotRefused — the other half, and the reason the
// guard tests for a base edition rather than checking a list of blessed lib
// selections. Every shape a consumer actually writes must pass, including the
// old editions, `dom` on its own, and a bare `target`.
func TestLibGuard_RealSelectionsAreNotRefused(t *testing.T) {
	for _, sound := range []string{"es5", "es2015", "es2020", "es2022", "esnext", "dom"} {
		codes := codesUnderLib(t, sound, arraySugarSource)
		if slices.Contains(codes, "config-lib-missing-base") {
			t.Errorf("lib %s is a real selection and must not be refused, got %v", sound, codes)
		}
	}
}

// TestLibGuard_ArraySugarIsWhyTheNameGuardIsNotEnough — pins the asymmetry the
// guard exists for, so nobody later concludes marker-any-from-unresolved-name already covered this.
// Under the same broken lib, the NAMED spelling is caught by the existing guard
// and the SUGAR spelling is not.
func TestLibGuard_ArraySugarIsWhyTheNameGuardIsNotEnough(t *testing.T) {
	named := codesUnderLib(t, "", `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{items: Array<number>}>();
`)
	if !slices.Contains(named, "marker-any-from-unresolved-name") {
		t.Errorf("a written type name that fails to resolve is marker-any-from-unresolved-name's job, got %v", named)
	}
	sugar := codesUnderLib(t, "", arraySugarSource)
	if slices.Contains(sugar, "marker-any-from-unresolved-name") {
		t.Errorf("array sugar writes no name, so marker-any-from-unresolved-name cannot see it — if it can now, config-lib-missing-base may be redundant: %v", sugar)
	}
	if !slices.Contains(sugar, "config-lib-missing-base") {
		t.Errorf("array sugar is exactly what config-lib-missing-base covers, got %v", sugar)
	}
}
