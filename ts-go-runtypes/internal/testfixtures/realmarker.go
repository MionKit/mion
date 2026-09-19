// Package testfixtures hosts the shared TypeScript fixtures for the Go test
// suites, plus RealMarkerPackage — the real `@mionjs/run-types` package served
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

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"sync"
)

// TemporalDTS is the canonical minimal `Temporal` ambient namespace
// (temporal.d.ts in this directory), for fixtures that USE Temporal types.
// The marker package itself degrades gracefully without it (guarded
// fallbacks in formats/datetime/temporalFormats.ts). Kept as ONE file,
// embedded, so no test carries its own hand-written mirror.
//
//go:embed temporal.d.ts
var TemporalDTS string

// MarkerPackagePrefix is the node_modules-relative directory every
// RealMarkerPackage key lives under.
const MarkerPackagePrefix = "node_modules/@mionjs/run-types/"

var (
	markerOnce  sync.Once
	markerFiles map[string]string
	markerErr   error
)

// artifactDirSegment matches anywhere under the dist: a dual ESM/CJS build writes one artifact per output dir.
const artifactDirSegment = string(filepath.Separator) + constants.PureFnArtifactDir + string(filepath.Separator)

// RealMarkerPackage returns the real `@mionjs/run-types` as overlay entries keyed under
// MarkerPackagePrefix: package.json, the dist .d.ts tree (dist/cjs/ too, a node16 CommonJS
// importer resolves the `require` condition), the pure-fn artifact and the src sources.
// Overlay them under a test cwd WITHOUT adding program roots; resolution pulls them in through
// the `@mionjs/run-types` import. Read once per process; errors when the dist is unbuilt
// (run `pnpm run check:builds`).
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
	pkgRoot := filepath.Join(repoRoot, "packages", "run-types")
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
		// The rest of the dist is the package's own runtime, which a consumer's build never reads.
		if entry.IsDir() || !(strings.HasSuffix(path, ".d.ts") || strings.Contains(path, artifactDirSegment)) {
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
	// The tarball ships `src` for the `source` export condition, so a fixture without it is not
	// the package a consumer installs.
	srcRoot := filepath.Join(pkgRoot, "src")
	srcErr := filepath.WalkDir(srcRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".spec.ts") || strings.HasSuffix(path, ".test.ts") {
			return nil
		}
		rel, relErr := filepath.Rel(srcRoot, path)
		if relErr != nil {
			return relErr
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		files[MarkerPackagePrefix+"src/"+filepath.ToSlash(rel)] = string(content)
		return nil
	})
	if srcErr != nil {
		return nil, fmt.Errorf("testfixtures: reading the marker sources under %s: %w", srcRoot, srcErr)
	}
	return files, nil
}
