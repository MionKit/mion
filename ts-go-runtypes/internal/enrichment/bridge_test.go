package enrichment_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// resolveFixture builds an inferred Program from in-memory sources, a resolver
// over it, and resolves typeName in relPath to a canonical RunType. Hermetic —
// no disk fixtures. Mirrors the resolver suite's setupInline overlay pattern.
func resolveFixture(t *testing.T, relPath, typeName string, sources map[string]string) *enrichment.Resolved {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	var absTarget string
	for rel, code := range sources {
		abs := tspath.ResolvePath(cwd, rel)
		overlay[abs] = code
		fileNames = append(fileNames, abs)
		if rel == relPath {
			absTarget = abs
		}
	}

	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay}, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	resolved, err := enrichment.ResolveType(prog, res.Checker(), res.Cache(), absTarget, typeName)
	if err != nil {
		t.Fatalf("ResolveType(%s): %v", typeName, err)
	}
	return resolved
}

// TestResolveType_TruncatedSource_WalkBudgetBounds pins the typeid walk
// backstop on the enrich path. The shape is the typemod fuzzer's
// dropClosingBrace corruption at seed 0x7a7179e2: tsgo error-recovers the
// truncation into a graph that mints a FRESH *checker.Type per member query, so
// the pointer cycle guard never fires and, pre-backstop, the structural-id walk
// re-expanded subtrees forever (`enrich --update` on this file hung — the
// release gate's R10 typemod finding). Completing AT ALL pins the fix; the
// DepthExceeded latch pins that the backstop (not chance) bounded the walk. The
// resolver-scan path does not reproduce the spiral (its program recovers this
// type differently), so the pin lives on the enrich path that hung.
//
// The spiralling member is a type this file DECLARES, and that is deliberate.
// The original fixture spiralled through the lib: first `Set` (whose ESNext
// iterator members did it), then `Promise` (whose `then` signature mentions
// `PromiseLike`). Both stopped spiralling as soon as those types were given the
// coverage they should always have had, and the test silently lost its teeth
// each time. Any lib type that still spirals is a bug we intend to fix, so
// pinning a backstop to one guarantees this test decays. `Spiral` below cannot
// decay: it is the pathology itself, written out.
//
// The latch is shared by both caps, and it is the DEPTH cap that fires here:
// a fresh-minting graph goes deep long before the op count climbs. The ops cap
// has its own pin in the typeid suite (TestWalkBudget_OpsCapRefusesTheSite),
// which lowers the cap because no source fixture reaches it.
func TestResolveType_TruncatedSource_WalkBudgetBounds(t *testing.T) {
	cwd := tspath.NormalizePath(t.TempDir())
	// target ESNext: the fuzz fixtures' tsconfig has no target, which is tsgo's
	// LatestStandard default, and older lib sets recover this type tamely.
	writeBridgeFixture(t, tspath.ResolvePath(cwd, "tsconfig.json"),
		`{"compilerOptions": {"target": "ESNext"}}`)
	writeBridgeFixture(t, tspath.ResolvePath(cwd, "models.ts"),
		"interface Spiral<T> {chain<U>(fn: (value: T) => U): Spiral<U>; peek(): Spiral<T>;}\n"+
			"export interface T_fb8z {value: ({m0_0: Array<undefined>; "+
			"readonly m0_1?: Spiral<boolean>; m0_2?: Spiral<bigint> & {m1_0: boolean}); lbl0: string; lbl1: number}\n")

	inferredConfig, err := program.ParseInferredConfig(cwd, "tsconfig.json", "source")
	if err != nil {
		t.Fatalf("ParseInferredConfig: %v", err)
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Config: inferredConfig, SingleThreaded: true},
		[]string{tspath.ResolvePath(cwd, "models.ts")})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	// A controlled refusal is as valid an outcome as a degraded resolve — only
	// the never-terminating walk was the bug.
	if _, err := enrichment.ResolveType(prog, res.Checker(), res.Cache(), tspath.ResolvePath(cwd, "models.ts"), "T_fb8z"); err != nil {
		t.Logf("ResolveType refused (controlled): %v", err)
	}
	if !res.Cache().DepthExceeded() {
		t.Fatal("the truncated type must latch the walk budget (DepthExceeded) — did the graph stop spiralling on its own?")
	}
}

func TestResolveType_UnknownTypeErrors(t *testing.T) {
	cwd := tspath.NormalizePath(t.TempDir())
	abs := tspath.ResolvePath(cwd, "user.ts")
	overlay := map[string]string{abs: "export interface User { name: string }\n"}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay}, []string{abs})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	if _, err := enrichment.ResolveType(prog, res.Checker(), res.Cache(), abs, "Missing"); err == nil {
		t.Fatal("ResolveType(Missing): expected error, got nil")
	}
}

// TestSkeletons_ObjectLiteralOnly pins the batch (`gen --files`) skeleton path:
// FriendlySkeleton / MockSkeleton return ONLY the object literal (no
// `export const … =` wrapper, no type annotation) so the test harness compares
// against a case's authored initializer.
func TestSkeletons_ObjectLiteralOnly(t *testing.T) {
	resolved := resolveFixture(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface User { name: string; tags: string[] }\n",
	})
	friendly := enrichment.FriendlySkeleton(resolved.Node, resolved.Resolve)
	mock := enrichment.MockSkeleton(resolved.Node, resolved.Resolve)

	if strings.Contains(friendly, "export const") || strings.Contains(friendly, "FriendlyText<") {
		t.Errorf("FriendlySkeleton should be a bare object literal; got:\n%s", friendly)
	}
	if !strings.HasPrefix(strings.TrimSpace(friendly), "{") {
		t.Errorf("FriendlySkeleton should start with '{'; got:\n%s", friendly)
	}
	for _, want := range []string{"rt$label: ''", "name:", "tags:", "rt$items"} {
		if !strings.Contains(friendly, want) {
			t.Errorf("FriendlySkeleton missing %q; got:\n%s", want, friendly)
		}
	}
	if strings.Contains(mock, "export const") {
		t.Errorf("MockSkeleton should be a bare object literal; got:\n%s", mock)
	}
	for _, want := range []string{"name: {pool: []}", "rt$length: [1, 3]"} {
		if !strings.Contains(mock, want) {
			t.Errorf("MockSkeleton missing %q; got:\n%s", want, mock)
		}
	}
}

// TestResolveTypeRaw_EsnextLibNeverWalksLibDecls — the decl-file walk must
// STOP at lib-declared types instead of AssignID-ing them: under lib.esnext
// (target esnext, or target unset — tsgo's LatestStandard default) the lib's
// deeply generic self-referential structures (the IteratorObject family)
// instantiate fresh types on every member query, which defeats pointer-based
// cycle detection and used to overflow the stack the moment the enrich lane
// honored such a tsconfig. Any completion at all pins the fix (the failure
// mode is a crash); the DeclFiles assertion pins that lib files never become
// mirror targets.
func TestResolveTypeRaw_EsnextLibNeverWalksLibDecls(t *testing.T) {
	cwd := tspath.NormalizePath(t.TempDir())
	writeBridgeFixture(t, tspath.ResolvePath(cwd, "tsconfig.json"),
		`{"compilerOptions": {"target": "ESNext"}}`)
	writeBridgeFixture(t, tspath.ResolvePath(cwd, "models.ts"),
		"export interface User { name: string; when: Map<string, User> }\n")

	inferredConfig, err := program.ParseInferredConfig(cwd, "tsconfig.json", "source")
	if err != nil {
		t.Fatalf("ParseInferredConfig: %v", err)
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Config: inferredConfig, SingleThreaded: true},
		[]string{tspath.ResolvePath(cwd, "models.ts")})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	resolved, err := enrichment.ResolveTypeRaw(prog, res.Checker(), res.Cache(), tspath.ResolvePath(cwd, "models.ts"), "User")
	if err != nil {
		t.Fatalf("ResolveTypeRaw under lib.esnext: %v", err)
	}
	sawUserFile := false
	for _, file := range resolved.DeclFiles {
		if strings.Contains(file, "lib.") && strings.HasSuffix(file, ".d.ts") {
			t.Errorf("DeclFiles must never point into the default libs; got %s", file)
		}
		if strings.HasSuffix(file, "models.ts") {
			sawUserFile = true
		}
	}
	if !sawUserFile {
		t.Errorf("DeclFiles should still record the user type's own file; got %v", resolved.DeclFiles)
	}
}

func writeBridgeFixture(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
