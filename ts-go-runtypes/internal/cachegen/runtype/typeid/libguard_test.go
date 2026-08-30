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

// arraySugarSource is the shape CFG002 exists for. `Array<number>` would raise
// MKR013 (a written NAME that failed to resolve), but `number[]` writes no name,
// so the silent-`any` guard family never looks at it.
const arraySugarSource = `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{grid: number[][]; names: readonly string[]}>();
`

// TestLibGuard_NoBaseEditionIsRefused — the hole, and the guard that closes it.
//
// With no base ECMAScript edition TypeScript never declares the `Array` global,
// and the checker resolves `number[]` to an ordinary empty object rather than to
// the error type the silent-`any` guards key on. Before CFG002 this compiled
// clean and emitted a validator that accepted any value.
func TestLibGuard_NoBaseEditionIsRefused(t *testing.T) {
	for _, unsound := range []string{"", "es2015.core", "esnext.disposable"} {
		label := unsound
		if label == "" {
			label = "(empty)"
		}
		codes := codesUnderLib(t, unsound, arraySugarSource)
		if !slices.Contains(codes, "CFG002") {
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
		if slices.Contains(codes, "CFG002") {
			t.Errorf("lib %s is a real selection and must not be refused, got %v", sound, codes)
		}
	}
}

// TestLibGuard_ArraySugarIsWhyTheNameGuardIsNotEnough — pins the asymmetry the
// guard exists for, so nobody later concludes MKR013 already covered this.
// Under the same broken lib, the NAMED spelling is caught by the existing guard
// and the SUGAR spelling is not.
func TestLibGuard_ArraySugarIsWhyTheNameGuardIsNotEnough(t *testing.T) {
	named := codesUnderLib(t, "", `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{items: Array<number>}>();
`)
	if !slices.Contains(named, "MKR013") {
		t.Errorf("a written type name that fails to resolve is MKR013's job, got %v", named)
	}
	sugar := codesUnderLib(t, "", arraySugarSource)
	if slices.Contains(sugar, "MKR013") {
		t.Errorf("array sugar writes no name, so MKR013 cannot see it — if it can now, CFG002 may be redundant: %v", sugar)
	}
	if !slices.Contains(sugar, "CFG002") {
		t.Errorf("array sugar is exactly what CFG002 covers, got %v", sugar)
	}
}
