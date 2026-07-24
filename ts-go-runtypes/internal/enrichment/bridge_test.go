package enrichment_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
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
