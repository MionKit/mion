package program_test

import (
	"os"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
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

// TestLibSet_EmptyReadsAsNone — `lib: []` loads nothing, and the CFG002 message
// has to say so in words rather than printing an empty list.
func TestLibSet_EmptyReadsAsNone(t *testing.T) {
	set := libSetFor(t, `,"lib":[]`)
	if !set.Empty() {
		t.Fatalf(`lib [] must load nothing, got %v`, set.Files)
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
