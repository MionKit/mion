package purefunctions

import (
	"context"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	chk "github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/protocol"
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

// countingLookup wraps a SourceFileLookup and tallies how many times
// SourceFile is invoked per path. Used by
// TestValidatePureFnDependencies_FileNeverReparsed to prove the lazy
// expansion path is single-shot per file.
type countingLookup struct {
	inner SourceFileLookup
	calls map[string]int
}

func newCountingLookup(inner SourceFileLookup) *countingLookup {
	return &countingLookup{inner: inner, calls: map[string]int{}}
}

func (c *countingLookup) SourceFile(absPath string) *ast.SourceFile {
	c.calls[absPath]++
	return c.inner.SourceFile(absPath)
}

// programForSources builds an in-memory program for the supplied
// (relativePath → source) map and returns the lookup plus the slice of
// absolute paths it ended up owning. Mirrors extractFromOverlay's
// pattern but exposes the lookup so tests can wrap it for counting.
func programForSources(t *testing.T, files map[string]string) (*program.Program, []string) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	abs := []string{}
	for name, source := range files {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = source
		abs = append(abs, path)
	}
	// Inject the marker ambient declaration AFTER user files so the
	// caller's first file stays at abs[0] (some tests index in).
	runtypesPath := tspath.ResolvePath(cwd, "runtypes.d.ts")
	overlay[runtypesPath] = runtypesDts
	abs = append(abs, runtypesPath)
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

func TestNewIndex_GetAndScanned(t *testing.T) {
	entries := []Entry{
		{Namespace: "rt", FunctionName: "asJSONString", BodyHash: "h1"},
		{Namespace: "rt", FunctionName: "safeKey", BodyHash: "h2"},
	}
	idx := NewIndex(entries, []string{"/a.ts", "/b.ts"})

	for _, key := range []string{"rt::asJSONString", "rt::safeKey"} {
		entry, ok := idx.Get(key)
		if !ok {
			t.Fatalf("expected to find %q", key)
		}
		if entry.Key() != key {
			t.Fatalf("entry.Key()=%q, want %q", entry.Key(), key)
		}
	}
	if _, ok := idx.Get("rt::missing"); ok {
		t.Fatal("expected miss for unknown key")
	}
	if !idx.Scanned("/a.ts") || !idx.Scanned("/b.ts") {
		t.Fatal("expected provided files to count as scanned")
	}
	if idx.Scanned("/c.ts") {
		t.Fatal("unprovided files must not be scanned")
	}
}

// NOTE: these mechanism tests (lazy expansion, dedup, miss detection) use a
// USER namespace ("app") deliberately. Built-in namespaces (rt::, rtFormats::)
// are exempt from validation — see TestValidatePureFnDependencies_BuiltinNamespacesExempt
// — so only user-owned deps exercise the miss path the mechanism implements.
func TestValidatePureFnDependencies_AllSatisfied(t *testing.T) {
	prog, files := programForSources(t, map[string]string{
		"pure.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('app::slugify', function () { return function () { return 1; }; });
`,
	})
	entries, _ := ExtractFromProgramCached(programChecker(t, prog), marker.WithDefaults(marker.Options{}), prog, files, nil)
	idx := NewIndex(entries, files)

	deps := []protocol.PureFnDep{
		{Namespace: "app", FunctionName: "slugify", FilePath: files[0]},
	}
	diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, prog)
	if len(diags) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", diags)
	}
}

func TestValidatePureFnDependencies_MissingKey_PFE9012(t *testing.T) {
	// Empty index, dep references a user key that doesn't exist anywhere.
	prog, files := programForSources(t, map[string]string{
		"empty.ts": `export const x = 1;`,
	})
	entries, _ := ExtractFromProgramCached(programChecker(t, prog), marker.WithDefaults(marker.Options{}), prog, files, nil)
	idx := NewIndex(entries, files)

	deps := []protocol.PureFnDep{
		{Namespace: "app", FunctionName: "doesNotExist", FilePath: ""},
	}
	diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, prog)
	if len(diags) != 1 {
		t.Fatalf("expected exactly 1 diagnostic, got %d (%+v)", len(diags), diags)
	}
	if diags[0].Code != CodeMissingPureFnDep {
		t.Fatalf("expected %s, got %s", CodeMissingPureFnDep, diags[0].Code)
	}
	if len(diags[0].Args) == 0 || diags[0].Args[0] != "app::doesNotExist" {
		t.Errorf("expected args[0]=app::doesNotExist (the missing key), got %v", diags[0].Args)
	}
}

// TestValidatePureFnDependencies_BuiltinNamespacesExempt pins the PFE9012
// false-positive fix: a reference to a @ts-runtypes/core-owned built-in
// (rt::, rtFormats::) must NEVER fire — even against an EMPTY index, which is
// exactly the published-package consumer's shape (core resolved to its .d.ts,
// so no registration source is in the program). A user-namespace miss in the
// same batch still fires, so the check keeps its value for genuine user typos.
func TestValidatePureFnDependencies_BuiltinNamespacesExempt(t *testing.T) {
	idx := NewIndex(nil, nil)
	deps := []protocol.PureFnDep{
		{Namespace: "rt", FunctionName: "newRunTypeErr"},
		{Namespace: "rt", FunctionName: "asJSONString"},
		{Namespace: "rtFormats", FunctionName: "isUUID"},
		{Namespace: "app", FunctionName: "typoFn"}, // user typo — the only genuine miss
	}
	// nil checker/lookup is safe: built-ins short-circuit before any lookup, and
	// the user miss carries no FilePath so it never triggers lazy expansion.
	diags := ValidatePureFnDependencies(nil, marker.WithDefaults(marker.Options{}), deps, idx, nil)
	if len(diags) != 1 {
		t.Fatalf("expected exactly 1 diagnostic (the user typo only), got %d (%+v)", len(diags), diags)
	}
	if diags[0].Code != CodeMissingPureFnDep || diags[0].Args[0] != "app::typoFn" {
		t.Fatalf("expected app::typoFn to be the sole miss, got %+v", diags[0].Args)
	}
}

func TestIsBuiltinPureFnNamespace(t *testing.T) {
	for _, ns := range []string{"rt", "rtFormats"} {
		if !IsBuiltinPureFnNamespace(ns) {
			t.Errorf("expected %q to be a built-in namespace", ns)
		}
	}
	for _, ns := range []string{"app", "cfn", "", "RT", "rtformats"} {
		if IsBuiltinPureFnNamespace(ns) {
			t.Errorf("expected %q NOT to be a built-in namespace", ns)
		}
	}
}

func TestValidatePureFnDependencies_LazyExpansion_FindsRegistration(t *testing.T) {
	// File a.ts is in the program but NOT in the original scan set.
	// b.ts is the only file scanned at extract time. The dep references
	// a key that's registered in a.ts. Validation lazily parses a.ts,
	// finds the registration, and emits NO diagnostic.
	prog, _ := programForSources(t, map[string]string{
		"a.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const r = registerPureFnFactory('app::slugify', function () { return function () { return 1; }; });
`,
		"b.ts": `export const x = 1;`,
	})
	// Manually find the absolute paths from the program.
	var aPath, bPath string
	for _, sf := range prog.TS.SourceFiles() {
		if sf == nil {
			continue
		}
		if strings.HasSuffix(sf.FileName(), "/a.ts") {
			aPath = sf.FileName()
		}
		if strings.HasSuffix(sf.FileName(), "/b.ts") {
			bPath = sf.FileName()
		}
	}
	if aPath == "" || bPath == "" {
		t.Fatalf("expected to resolve both a.ts and b.ts, got a=%q b=%q", aPath, bPath)
	}

	// Initial scan covers ONLY b.ts.
	entries, _ := ExtractFromProgramCached(programChecker(t, prog), marker.WithDefaults(marker.Options{}), prog, []string{bPath}, nil)
	idx := NewIndex(entries, []string{bPath})
	if _, ok := idx.Get("app::slugify"); ok {
		t.Fatal("setup: key should NOT yet be in the index — it lives in unscanned a.ts")
	}

	// Dep points at the unscanned a.ts; lazy expansion should find it.
	deps := []protocol.PureFnDep{
		{Namespace: "app", FunctionName: "slugify", FilePath: aPath},
	}
	diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, prog)
	if len(diags) != 0 {
		t.Fatalf("lazy expansion should satisfy the dep, got %+v", diags)
	}
	if _, ok := idx.Get("app::slugify"); !ok {
		t.Fatal("after lazy expansion, the key must be in the index")
	}
	if !idx.Scanned(aPath) {
		t.Fatal("after lazy expansion, the file must be marked scanned")
	}
}

func TestValidatePureFnDependencies_LazyExpansion_StillMissing(t *testing.T) {
	// File a.ts is in the program but doesn't contain the expected
	// registration. Lazy expansion parses it, finds nothing matching
	// the key, and emits PFE9012.
	prog, files := programForSources(t, map[string]string{
		"a.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const x = registerPureFnFactory('app::somethingElse', function () { return function () {}; });
`,
	})
	// Initial scan covers no files so a.ts is unscanned from idx's perspective.
	idx := NewIndex(nil, nil)

	deps := []protocol.PureFnDep{
		{Namespace: "app", FunctionName: "slugify", FilePath: files[0]},
	}
	diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, prog)
	if len(diags) != 1 || diags[0].Code != CodeMissingPureFnDep {
		t.Fatalf("expected one PFE9012 diagnostic, got %+v", diags)
	}
	if len(diags[0].Args) == 0 || diags[0].Args[0] != "app::slugify" {
		t.Errorf("expected args[0]=app::slugify (the missing key), got %v", diags[0].Args)
	}
	if !idx.Scanned(files[0]) {
		t.Fatal("the file must still be marked scanned (so future passes don't re-parse)")
	}
}

func TestValidatePureFnDependencies_DedupesRepeatedMisses(t *testing.T) {
	prog, files := programForSources(t, map[string]string{
		"empty.ts": `export const x = 1;`,
	})
	entries, _ := ExtractFromProgramCached(programChecker(t, prog), marker.WithDefaults(marker.Options{}), prog, files, nil)
	idx := NewIndex(entries, files)

	// Same missing key referenced four times — should produce only one diagnostic.
	deps := []protocol.PureFnDep{
		{Namespace: "app", FunctionName: "missing", FilePath: ""},
		{Namespace: "app", FunctionName: "missing", FilePath: ""},
		{Namespace: "app", FunctionName: "missing", FilePath: ""},
		{Namespace: "app", FunctionName: "missing", FilePath: ""},
	}
	diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, prog)
	if len(diags) != 1 {
		t.Fatalf("expected 1 dedupe-collapsed diagnostic, got %d (%+v)", len(diags), diags)
	}
}

func TestValidatePureFnDependencies_FileNeverReparsed(t *testing.T) {
	// Call validate twice with the same missing-but-pointing-at-a-file
	// dep. The lookup should be invoked exactly ONCE for the dep's
	// filePath — once expanded, the scanned flag prevents re-parse.
	prog, files := programForSources(t, map[string]string{
		"a.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const r = registerPureFnFactory('app::slugify', function () { return function () {}; });
`,
	})
	idx := NewIndex(nil, nil) // start empty so a.ts is unscanned

	counter := newCountingLookup(prog)
	deps := []protocol.PureFnDep{
		{Namespace: "app", FunctionName: "slugify", FilePath: files[0]},
	}

	// First pass — should trigger one lookup on files[0].
	if diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, counter); len(diags) != 0 {
		t.Fatalf("first pass should satisfy via lazy expand, got %+v", diags)
	}
	firstCallCount := counter.calls[files[0]]
	if firstCallCount == 0 {
		t.Fatalf("expected lookup to be called at least once on first pass, got %d", firstCallCount)
	}

	// Second pass with the same deps — must NOT re-parse, since the
	// file is already in idx.scanned. Lookup call count for files[0]
	// stays unchanged.
	if diags := ValidatePureFnDependencies(programChecker(t, prog), marker.WithDefaults(marker.Options{}), deps, idx, counter); len(diags) != 0 {
		t.Fatalf("second pass should be satisfied without re-parse, got %+v", diags)
	}
	if counter.calls[files[0]] != firstCallCount {
		t.Fatalf("second pass re-parsed: lookup count went from %d to %d", firstCallCount, counter.calls[files[0]])
	}
}
