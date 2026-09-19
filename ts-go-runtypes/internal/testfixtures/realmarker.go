// Package testfixtures hosts the shared TypeScript fixtures for the Go test
// suites, plus RealMarkerPackage — the real `@mionjs/run-types` package served
// as virtual-filesystem overlay entries so tests resolve the marker module
// exactly the way a consumer install does (package.json exports → dist .d.ts),
// with no hand-written stand-in to drift.
package testfixtures

import (
	_ "embed"
	"encoding/json"
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

	markerSrcOnce  sync.Once
	markerSrcFiles map[string]string
	markerSrcErr   error
)

// artifactDirSegment matches anywhere under the dist: a dual ESM/CJS build writes one artifact per output dir.
const artifactDirSegment = string(filepath.Separator) + constants.PureFnArtifactDir + string(filepath.Separator)

// RealMarkerPackage returns the real `@mionjs/run-types` as a CONSUMER INSTALL: overlay
// entries keyed under MarkerPackagePrefix holding the published package.json, the dist .d.ts
// tree (dist/cjs/ too, a node16 CommonJS importer resolves the `require` condition) and the
// pure-fn artifact. No sources, and no `source` export condition, because the tarball carries
// neither — a fixture that shipped them would resolve down a road no consumer has.
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
	published, stripErr := withoutSourceCondition(packageJSON)
	if stripErr != nil {
		return nil, fmt.Errorf("testfixtures: rewriting the marker package.json as published: %w", stripErr)
	}
	files[MarkerPackagePrefix+"package.json"] = published
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
	return files, nil
}

// withoutSourceCondition is scripts/lib/publish-manifest.mjs's twin: the manifest as npm
// serves it, with every `source` export condition removed at any depth.
func withoutSourceCondition(manifest []byte) (string, error) {
	var decoded any
	if err := json.Unmarshal(manifest, &decoded); err != nil {
		return "", err
	}
	stripped, err := json.Marshal(dropSourceKeys(decoded))
	if err != nil {
		return "", err
	}
	return string(stripped), nil
}

func dropSourceKeys(node any) any {
	switch typed := node.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, value := range typed {
			if key == "source" {
				continue
			}
			out[key] = dropSourceKeys(value)
		}
		return out
	case []any:
		for i, value := range typed {
			typed[i] = dropSourceKeys(value)
		}
		return typed
	default:
		return node
	}
}

// RealMarkerSources returns the marker package's own `src/**/*.ts` as overlay entries under
// MarkerPackagePrefix. Layer it OVER RealMarkerPackage to model the WORKSPACE shape, where a
// sibling resolves run-types through the `source` condition and its pure-fn bodies can be
// extracted straight from the sources. A consumer install has none of this, which is why it is
// a separate opt-in rather than part of the package fixture.
func RealMarkerSources() (map[string]string, error) {
	markerSrcOnce.Do(func() { markerSrcFiles, markerSrcErr = readMarkerSources() })
	return markerSrcFiles, markerSrcErr
}

func readMarkerSources() (map[string]string, error) {
	_, self, _, ok := runtime.Caller(0)
	if !ok {
		return nil, fmt.Errorf("testfixtures: runtime.Caller failed to locate the package directory")
	}
	srcRoot := filepath.Join(filepath.Dir(self), "..", "..", "..", "packages", "run-types", "src")
	files := map[string]string{}
	walkErr := filepath.WalkDir(srcRoot, func(path string, entry fs.DirEntry, err error) error {
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
	if walkErr != nil {
		return nil, fmt.Errorf("testfixtures: reading the marker sources under %s: %w", srcRoot, walkErr)
	}
	return files, nil
}
