package marker

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
)

// Locks in the package.json walk used by DeclaredInModule. The Case 1
// path (ambient `declare module` declarations) is already covered
// end-to-end by the resolver test suite over internal/testfixtures —
// those fixtures rely on it for marker recognition. This file covers
// Case 2 (on-disk package.json with matching "name").

func TestPackageNameForFile_FindsEnclosingName(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "my-pkg-dir-name")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{"name": "@scope/published-name"}`)

	got := packageNameForFile(filepath.Join(srcDir, "index.ts"), nil)
	if got != "@scope/published-name" {
		t.Fatalf("expected @scope/published-name, got %q", got)
	}
}

func TestPackageNameForFile_OnDiskDirNameIgnored(t *testing.T) {
	// Regression for the workspace-self-import case: the on-disk dir
	// is `ts-runtypes/` but the package's published name is
	// `@mionjs/run-types`. The old path-fragment heuristic
	// missed this; the package.json walk gets it right.
	root := t.TempDir()
	pkgDir := filepath.Join(root, "mion")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{"name": "@mionjs/run-types"}`)

	got := packageNameForFile(filepath.Join(srcDir, "index.ts"), nil)
	if got != "@mionjs/run-types" {
		t.Fatalf("expected @mionjs/run-types, got %q", got)
	}
}

func TestPackageNameForFile_NoPackageJson(t *testing.T) {
	root := t.TempDir()
	srcDir := filepath.Join(root, "src")
	mustMkdir(t, srcDir)

	got := packageNameForFile(filepath.Join(srcDir, "orphan.ts"), nil)
	if got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestPackageNameForFile_PackageJsonWithoutName(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "pkg")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{"version": "1.0.0"}`)
	// A monorepo root above with a name — the walk must STOP at the
	// nameless package.json, not continue up to this one.
	writeFile(t, filepath.Join(root, "package.json"), `{"name": "monorepo-root"}`)

	got := packageNameForFile(filepath.Join(srcDir, "file.ts"), nil)
	if got != "" {
		t.Fatalf("expected empty (nameless boundary halts walk), got %q", got)
	}
}

func TestPackageNameForFile_MalformedJson(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "pkg")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{not json`)

	got := packageNameForFile(filepath.Join(srcDir, "file.ts"), nil)
	if got != "" {
		t.Fatalf("expected empty on malformed json, got %q", got)
	}
}

func TestPackageNameForFile_NestedPackageWins(t *testing.T) {
	// Inner package.json takes precedence over outer one. Mirrors
	// node_modules-style nesting.
	root := t.TempDir()
	outerSrc := filepath.Join(root, "outer-src")
	mustMkdir(t, outerSrc)
	writeFile(t, filepath.Join(root, "package.json"), `{"name": "outer"}`)

	innerPkg := filepath.Join(root, "node_modules", "inner-pkg")
	innerSrc := filepath.Join(innerPkg, "dist")
	mustMkdir(t, innerSrc)
	writeFile(t, filepath.Join(innerPkg, "package.json"), `{"name": "@vendor/inner"}`)

	outer := packageNameForFile(filepath.Join(outerSrc, "a.ts"), nil)
	if outer != "outer" {
		t.Fatalf("outer-src: expected outer, got %q", outer)
	}
	inner := packageNameForFile(filepath.Join(innerSrc, "b.ts"), nil)
	if inner != "@vendor/inner" {
		t.Fatalf("inner: expected @vendor/inner, got %q", inner)
	}
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// --- configurable marker package -------------------------------------------
// PackageSet is the set the module-of-origin gate matches against, so these
// pin the two knobs a project has: adding packages, and turning the gate off.

func TestPackageSet_DefaultsToTheMarkerPackage(t *testing.T) {
	got := WithDefaults(Options{}).PackageSet()
	if len(got) != 1 || got[0] != DefaultModule {
		t.Fatalf("expected exactly [%s], got %v", DefaultModule, got)
	}
}

func TestPackageSet_ZeroValueStillGatesOnTheDefault(t *testing.T) {
	// A zero-value Options (no WithDefaults) must not degrade into "accept
	// nothing" — an empty set would make DeclaredInAnyModule reject everything
	// and silently drop every marker.
	got := Options{}.PackageSet()
	if len(got) != 1 || got[0] != DefaultModule {
		t.Fatalf("expected exactly [%s], got %v", DefaultModule, got)
	}
}

func TestPackageSet_ConfiguredPackagesAreAdditive(t *testing.T) {
	// The configured package must be ACCEPTED ALONGSIDE the default, never
	// instead of it: a project declaring its own markers keeps working with
	// markers imported from ts-runtypes.
	got := WithDefaults(Options{Packages: []string{"@my-org/markers"}}).PackageSet()
	if len(got) != 2 || got[0] != DefaultModule || got[1] != "@my-org/markers" {
		t.Fatalf("expected [%s @my-org/markers], got %v", DefaultModule, got)
	}
}

func TestPackageSet_DedupesAndDropsBlanks(t *testing.T) {
	got := WithDefaults(Options{Packages: []string{"@a/b", "", "  ", "@a/b", DefaultModule}}).PackageSet()
	if len(got) != 2 || got[0] != DefaultModule || got[1] != "@a/b" {
		t.Fatalf("expected [%s @a/b], got %v", DefaultModule, got)
	}
}

func TestDeclaredInMarkerPackage_SkipPackageCheckAcceptsAnyDeclaration(t *testing.T) {
	// With the gate off the symbol's declarations are never consulted, so even
	// a symbol with NO declarations at all passes on its name alone.
	opts := WithDefaults(Options{SkipPackageCheck: true})
	if !opts.DeclaredInMarkerPackage(&ast.Symbol{Name: DefaultName}) {
		t.Fatal("expected SkipPackageCheck to accept a declaration from anywhere")
	}
}

func TestDeclaredInMarkerPackage_NilSymbolIsRejectedEvenWithTheGateOff(t *testing.T) {
	opts := WithDefaults(Options{SkipPackageCheck: true})
	if opts.DeclaredInMarkerPackage(nil) {
		t.Fatal("expected a nil symbol to be rejected")
	}
}

func TestDeclaredInAnyModule_EmptyModuleSetRejects(t *testing.T) {
	if DeclaredInAnyModule(&ast.Symbol{Name: DefaultName}, nil, nil) {
		t.Fatal("expected an empty module set to reject")
	}
	if DeclaredInAnyModule(&ast.Symbol{Name: DefaultName}, []string{"", " "}, nil) {
		t.Fatal("expected a blanks-only module set to reject")
	}
}
