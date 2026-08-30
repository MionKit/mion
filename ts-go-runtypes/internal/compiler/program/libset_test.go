package program_test

import (
	"os"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

// libSetFor builds a Program under one tsconfig `compilerOptions` fragment and
// returns the standard library it actually loaded.
func libSetFor(t *testing.T, optionsFragment string) program.LibSet {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	tsconfig := `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","strict":true` + optionsFragment + `}}`
	if err := os.WriteFile(tspath.ResolvePath(cwd, "tsconfig.json"), []byte(tsconfig), 0o644); err != nil {
		t.Fatalf("write tsconfig: %v", err)
	}
	sourcePath := tspath.ResolvePath(cwd, "a.ts")
	config, err := program.ParseInferredConfig(cwd, "tsconfig.json")
	if err != nil {
		t.Fatalf("ParseInferredConfig: %v", err)
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Config:         config,
		Overlay:        map[string]string{sourcePath: "export const a = 1;\n"},
	}, []string{sourcePath})
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	return prog.LoadedLibSet()
}

// TestLibSet_ReadsWhatTheProgramActuallyLoaded — the set is read from the
// Program's own source files, not re-derived from `lib` / `target`, and that is
// the whole point: the tsconfig spelling is a poor stand-in for the loaded set.
// `["es2022"]` pulls 50-odd files through its reference chain, `["dom"]` drags
// in the ES baseline it depends on, and a bare `target` selects a `full` lib.
func TestLibSet_ReadsWhatTheProgramActuallyLoaded(t *testing.T) {
	oneLib := libSetFor(t, `,"lib":["es2015"]`)
	if len(oneLib.Files) < 2 {
		t.Fatalf(`lib ["es2015"] pulls its reference chain, got only %v`, oneLib.Files)
	}
	// `dom` names no ES edition, yet cannot stand alone: the baseline comes too.
	domOnly := libSetFor(t, `,"lib":["dom"]`)
	if !hasBaseline(domOnly) {
		t.Errorf(`lib ["dom"] must still load the ES baseline, got %v`, domOnly.Files)
	}
	// No `lib` at all: the target picks one, and it is a real set.
	fromTarget := libSetFor(t, `,"target":"es2022"`)
	if fromTarget.Empty() {
		t.Error("a target with no explicit lib must still load a standard library")
	}
}

// TestLibSet_FingerprintSeparatesSelections — the fingerprint is what stops one
// lib's compiled entries being served under another, so selections that load
// different files must not collide, and the SAME selection must be stable.
func TestLibSet_FingerprintSeparatesSelections(t *testing.T) {
	es2022 := libSetFor(t, `,"lib":["es2022"]`).Fingerprint()
	es2022Dom := libSetFor(t, `,"lib":["es2022","dom"]`).Fingerprint()
	esnext := libSetFor(t, `,"lib":["esnext"]`).Fingerprint()
	again := libSetFor(t, `,"lib":["es2022"]`).Fingerprint()

	if es2022 != again {
		t.Errorf("the same lib selection must fingerprint the same: %q vs %q", es2022, again)
	}
	for _, other := range []struct {
		label string
		value string
	}{{`["es2022","dom"]`, es2022Dom}, {`["esnext"]`, esnext}} {
		if other.value == es2022 {
			t.Errorf(`%s must not share a fingerprint with ["es2022"]`, other.label)
		}
	}
	if es2022 == "" {
		t.Error("a real lib selection must fingerprint to something")
	}
}

// TestLibSet_NoBaseEditionIsRecognised — the unsound selections, and the whole
// reason CFG002 exists. Without a base ECMAScript edition TypeScript never
// declares `Array`, so `number[]` checks as an empty object and the generated
// validator accepts anything, with no diagnostic anywhere. A by-feature lib
// ADDS to a base edition; it cannot replace one.
func TestLibSet_NoBaseEditionIsRecognised(t *testing.T) {
	for _, unsound := range []string{`,"lib":[]`, `,"lib":["es2015.core"]`, `,"lib":["esnext.disposable"]`} {
		if set := libSetFor(t, unsound); hasBaseline(set) {
			t.Errorf("%s declares no base edition, got %v", unsound, set.Files)
		}
	}
	for _, sound := range []string{`,"lib":["es5"]`, `,"lib":["es2015"]`, `,"lib":["es2022"]`,
		`,"lib":["dom"]`, `,"lib":["esnext","dom"]`, `,"target":"es5"`, `,"target":"esnext"`} {
		if set := libSetFor(t, sound); !hasBaseline(set) {
			t.Errorf("%s is a real selection and must carry the base edition, got %v", sound, set.Files)
		}
	}
}

// TestLibSet_EmptyHasNoFingerprint — `lib: []` must not be handed a well-formed
// salt: there is no library to scope anything to, and CFG002 rejects it before
// it gets that far.
func TestLibSet_EmptyHasNoFingerprint(t *testing.T) {
	set := libSetFor(t, `,"lib":[]`)
	if !set.Empty() {
		t.Fatalf(`lib [] must load nothing, got %v`, set.Files)
	}
	if set.Fingerprint() != "" {
		t.Errorf("an empty lib set must not fingerprint, got %q", set.Fingerprint())
	}
	if set.String() != "(none)" {
		t.Errorf("an empty set must read as (none) in a diagnostic, got %q", set.String())
	}
}

func hasBaseline(set program.LibSet) bool {
	for _, file := range set.Files {
		if strings.EqualFold(file, "lib.es5.d.ts") {
			return true
		}
	}
	return false
}
