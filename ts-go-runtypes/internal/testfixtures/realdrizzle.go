// realdrizzle.go — the REAL @mionjs drizzle packages (package.json + src
// trees) plus the marker package's SOURCES, keyed as virtual node_modules
// paths, for suites that exercise the drizzle conversion arm. Sources, not
// dists: the drizzle packages publish src/ behind the "source" export
// condition, so programs mounting this fixture must pass
// Conditions: ["source"] (which is also why the marker package rides along as
// src here — under that condition its dist .d.ts overlay would not resolve).
// Same "real files, never copies" rule as RealMarkerPackage.
package testfixtures

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var (
	drizzleOnce  sync.Once
	drizzleFiles map[string]string
	drizzleErr   error
)

// RealDrizzlePackages returns @mionjs/run-types, @mionjs/drizzle-orm and the
// @mionjs/drizzle-orm-<dialect>-core packages (pg, mysql, sqlite) as virtual
// node_modules entries (package.json + src/**/*.ts, test files skipped).
// Memoized per process.
func RealDrizzlePackages() (map[string]string, error) {
	drizzleOnce.Do(func() { drizzleFiles, drizzleErr = readDrizzlePackages() })
	return drizzleFiles, drizzleErr
}

func readDrizzlePackages() (map[string]string, error) {
	_, self, _, ok := runtime.Caller(0)
	if !ok {
		return nil, fmt.Errorf("testfixtures: runtime.Caller failed to locate the package directory")
	}
	repoRoot := filepath.Join(filepath.Dir(self), "..", "..", "..")
	packages := map[string]string{
		"node_modules/@mionjs/run-types/":               filepath.Join(repoRoot, "packages", "run-types"),
		"node_modules/@mionjs/drizzle-orm/":             filepath.Join(repoRoot, "packages", "drizzle-orm"),
		"node_modules/@mionjs/drizzle-orm-pg-core/":     filepath.Join(repoRoot, "packages", "drizzle-orm-pg-core"),
		"node_modules/@mionjs/drizzle-orm-mysql-core/":  filepath.Join(repoRoot, "packages", "drizzle-orm-mysql-core"),
		"node_modules/@mionjs/drizzle-orm-sqlite-core/": filepath.Join(repoRoot, "packages", "drizzle-orm-sqlite-core"),
	}
	files := map[string]string{}
	for prefix, pkgRoot := range packages {
		packageJSON, err := os.ReadFile(filepath.Join(pkgRoot, "package.json"))
		if err != nil {
			return nil, fmt.Errorf("testfixtures: reading %spackage.json: %w", prefix, err)
		}
		files[prefix+"package.json"] = string(packageJSON)
		srcRoot := filepath.Join(pkgRoot, "src")
		walkErr := filepath.WalkDir(srcRoot, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			name := entry.Name()
			if entry.IsDir() || !strings.HasSuffix(name, ".ts") ||
				strings.HasSuffix(name, ".spec.ts") || strings.HasSuffix(name, ".test.ts") || strings.HasSuffix(name, ".stub.ts") {
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
			files[prefix+"src/"+filepath.ToSlash(rel)] = string(content)
			return nil
		})
		if walkErr != nil {
			return nil, fmt.Errorf("testfixtures: walking %ssrc: %w", prefix, walkErr)
		}
	}
	return files, nil
}
