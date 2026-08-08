// Package testfixtures hosts the shared TypeScript fixtures for the Go test
// suites, plus RealMarkerPackage — the real `@ts-runtypes/core` package served
// as virtual-filesystem overlay entries so tests resolve the marker module
// exactly the way a consumer install does (package.json exports → dist .d.ts),
// with no hand-written stand-in to drift.
package testfixtures

import (
	_ "embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// TemporalDTS is the canonical minimal `Temporal` ambient namespace
// (temporal.d.ts in this directory) — the marker package's declaration graph
// references the global Temporal (formats/datetime), so programs that mount
// RealMarkerPackage overlay this alongside it. Kept as ONE file, embedded,
// so no test carries its own hand-written mirror.
//
//go:embed temporal.d.ts
var TemporalDTS string

// MarkerPackagePrefix is the node_modules-relative directory every
// RealMarkerPackage key lives under.
const MarkerPackagePrefix = "node_modules/@ts-runtypes/core/"

var (
	markerOnce  sync.Once
	markerFiles map[string]string
	markerErr   error
)

// RealMarkerPackage returns the real `@ts-runtypes/core` package — its
// package.json plus the built dist/**/*.d.ts declaration tree (both the esm
// surface and dist/cjs/, since a node16-style CommonJS importer resolves the
// `require` export condition) — keyed by node_modules-relative path under
// MarkerPackagePrefix. Callers overlay the entries under a test cwd WITHOUT
// adding them as program roots: module resolution pulls them in through the
// `@ts-runtypes/core` import. Read once per process; errors when the marker
// dist is unbuilt (run `pnpm run check:builds`).
func RealMarkerPackage() (map[string]string, error) {
	markerOnce.Do(func() { markerFiles, markerErr = readMarkerPackage() })
	return markerFiles, markerErr
}

func readMarkerPackage() (map[string]string, error) {
	_, self, _, ok := runtime.Caller(0)
	if !ok {
		return nil, fmt.Errorf("testfixtures: runtime.Caller failed to locate the package directory")
	}
	repoRoot := filepath.Join(filepath.Dir(self), "..", "..", "..")
	pkgRoot := filepath.Join(repoRoot, "packages", "ts-runtypes")
	files := map[string]string{}
	packageJSON, err := os.ReadFile(filepath.Join(pkgRoot, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("testfixtures: reading the marker package.json: %w", err)
	}
	files[MarkerPackagePrefix+"package.json"] = string(packageJSON)
	distRoot := filepath.Join(pkgRoot, "dist")
	walkErr := filepath.WalkDir(distRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".d.ts") {
			return nil
		}
		rel, relErr := filepath.Rel(distRoot, path)
		if relErr != nil {
			return relErr
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		files[MarkerPackagePrefix+"dist/"+filepath.ToSlash(rel)] = string(content)
		return nil
	})
	if walkErr != nil {
		return nil, fmt.Errorf("testfixtures: reading the marker dist under %s (unbuilt? run `pnpm run check:builds`): %w", distRoot, walkErr)
	}
	if len(files) < 2 {
		return nil, fmt.Errorf("testfixtures: no .d.ts files under %s — build the marker dist with `pnpm run check:builds`", distRoot)
	}
	return files, nil
}
