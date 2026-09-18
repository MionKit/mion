package purefunctions

import (
	"context"
	"testing"

	chk "github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// programChecker fetches the type checker for a Program built by
// programForSources, releasing the lease on test cleanup. Mirrors
// extractFromOverlay's plumbing for the dispatch path.
func programChecker(t *testing.T, prog *program.Program) *chk.Checker {
	t.Helper()
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		t.Fatalf("program.TS.GetTypeChecker returned nil")
	}
	t.Cleanup(func() {
		if releaseLease != nil {
			releaseLease()
		}
	})
	return typeChecker
}

// programForSources builds an in-memory program for the supplied
// (relativePath → source) map and returns it plus the slice of absolute paths
// it ended up owning.
func programForSources(t *testing.T, files map[string]string) (*program.Program, []string) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	// A package.json at the root gives every fixture file a stable id: the id
	// rule names the package a file belongs to, and a test that asserts one
	// should not be reading a temp directory name.
	overlay := map[string]string{tspath.ResolvePath(cwd, "package.json"): `{"name": "` + testPackageName + `"}`}
	abs := []string{}
	for name, source := range files {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = source
		abs = append(abs, path)
	}
	// Overlay the real marker package; never a root (module resolution pulls
	// it in), so the caller's first file stays at abs[0] (some tests index in).
	for rel, content := range realMarkerFiles(t) {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, abs)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	return prog, abs
}

func TestNewIndex_Get(t *testing.T) {
	entries := []Entry{
		{ID: "@acme/app/src/a#asJSONString"},
		{ID: "@acme/app/src/a#safeKey"},
	}
	idx := NewIndex(entries)

	for _, id := range []string{"@acme/app/src/a#asJSONString", "@acme/app/src/a#safeKey"} {
		entry, ok := idx.Get(id)
		if !ok {
			t.Fatalf("expected to find %q", id)
		}
		if entry.Key() != id {
			t.Fatalf("entry.Key()=%q, want %q", entry.Key(), id)
		}
	}
	if _, ok := idx.Get("@acme/app/src/a#missing"); ok {
		t.Fatal("expected miss for unknown id")
	}
}

func TestValidatePureFnDependencies_AllSatisfied(t *testing.T) {
	prog, files := programForSources(t, map[string]string{
		"pure.ts": `import {registerPureFnFactory} from '@mionjs/run-types';
export const slugify = registerPureFnFactory(function () { return function () { return 1; }; });
`,
	})
	entries, _ := ExtractFromProgramCached(programChecker(t, prog), marker.WithDefaults(marker.Options{FS: prog.FS}), prog, files, nil)
	if len(entries) != 1 {
		t.Fatalf("expected one extracted registration, got %d", len(entries))
	}
	idx := NewIndex(entries)

	diags := ValidatePureFnDependencies([]protocol.PureFnDep{{ID: entries[0].Key()}}, idx)
	if len(diags) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", diags)
	}
}

func TestValidatePureFnDependencies_MissingID_PFE9012(t *testing.T) {
	idx := NewIndex(nil)
	diags := ValidatePureFnDependencies([]protocol.PureFnDep{{ID: "@acme/app/src/a#doesNotExist"}}, idx)
	if len(diags) != 1 {
		t.Fatalf("expected exactly 1 diagnostic, got %d (%+v)", len(diags), diags)
	}
	if diags[0].Code != CodeMissingPureFnDep {
		t.Fatalf("expected %s, got %s", CodeMissingPureFnDep, diags[0].Code)
	}
	if len(diags[0].Args) != 1 || diags[0].Args[0] != "@acme/app/src/a#doesNotExist" {
		t.Errorf("expected the missing id as the only arg, got %v", diags[0].Args)
	}
}

// TestValidatePureFnDependencies_PackageOwnedExempt pins the PFE9012
// false-positive fix: a reference to a @mionjs/run-types-owned pure fn must
// NEVER fire here — even against an EMPTY index, which is exactly the published
// consumer's shape (run-types resolved to its .d.ts, so no registration source
// is in the program). Those are checked at serve time instead. A user-owned
// miss in the same batch still fires, so the check keeps its value.
func TestValidatePureFnDependencies_PackageOwnedExempt(t *testing.T) {
	idx := NewIndex(nil)
	deps := []protocol.PureFnDep{
		{ID: purefnids.NewRunTypeErr},
		{ID: purefnids.CountEnumKeys},
		{ID: purefnids.IsUUID},
		{ID: "@acme/app/src/a#typoFn"}, // user typo — the only genuine miss
	}
	diags := ValidatePureFnDependencies(deps, idx)
	if len(diags) != 1 {
		t.Fatalf("expected exactly 1 diagnostic (the user typo only), got %d (%+v)", len(diags), diags)
	}
	if diags[0].Code != CodeMissingPureFnDep || diags[0].Args[0] != "@acme/app/src/a#typoFn" {
		t.Fatalf("expected the typo to be the sole miss, got %+v", diags[0].Args)
	}
}

func TestValidatePureFnDependencies_DedupesRepeatedMisses(t *testing.T) {
	idx := NewIndex(nil)
	missing := protocol.PureFnDep{ID: "@acme/app/src/a#missing"}
	diags := ValidatePureFnDependencies([]protocol.PureFnDep{missing, missing, missing, missing}, idx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 dedupe-collapsed diagnostic, got %d (%+v)", len(diags), diags)
	}
}

// An id an installed package owns is validated by the serve step against that
// package's compiled files, so the sink-based check must not call it missing;
// an id the predicate does not claim stays a PFE9012.
func TestValidatePureFnDependencies_LibraryDepExempt(t *testing.T) {
	idx := NewIndex(nil)
	idx.LibraryDep = func(id string) bool { return id == "@acme/text/src/slug#slugify" }
	diags := ValidatePureFnDependencies([]protocol.PureFnDep{{ID: "@acme/text/src/slug#slugify"}, {ID: "@acme/app/src/a#gone"}}, idx)
	if len(diags) != 1 || diags[0].Args[0] != "@acme/app/src/a#gone" {
		t.Fatalf("expected one PFE9012 for the program's own miss, got %+v", diags)
	}
}
