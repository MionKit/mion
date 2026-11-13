package testfixtures

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// repoLinks are the outside-module paths Go tests read, via testdata/repo/ symlinks: the test cache sees only the module.
var repoLinks = []string{
	"packages/core",
	"packages/devtools/src/core/go-generated",
	"packages/drizzle-orm",
	"packages/drizzle-orm-mysql-core",
	"packages/drizzle-orm-pg-core",
	"packages/drizzle-orm-sqlite-core",
	"packages/platform-node",
	"packages/private-drizzle-example-app",
	"packages/rpc-router",
	"packages/run-types",
	"pnpm-lock.yaml",
	"version.json",
}

func packageDir() string {
	_, self, _, ok := runtime.Caller(0)
	if !ok {
		panic("testfixtures: runtime.Caller failed to locate the package directory")
	}
	return filepath.Dir(self)
}

// Repo returns rel (a repo-relative path under one of repoLinks) as a path inside the module, through its link.
func Repo(rel string) string {
	return filepath.Join(packageDir(), "testdata", "repo", filepath.FromSlash(rel))
}

// RepoRoot is the real repo root for paths handed to a tool; Go's test cache misses those reads, so DeclareInputs too.
func RepoRoot() string {
	return filepath.Join(packageDir(), "..", "..", "..")
}

// DeclareInputs stats every file under each path through its link, so Go's test cache keys on reads outside the module.
// A path is repo-relative, or absolute under RepoRoot.
func DeclareInputs(paths ...string) error {
	for _, path := range paths {
		rel, err := repoRelative(path)
		if err != nil {
			return err
		}
		info, err := os.Stat(Repo(rel))
		if err != nil {
			return err
		}
		if !info.IsDir() {
			continue
		}
		// The trailing separator makes WalkDir follow the link at the root.
		root := Repo(rel) + string(filepath.Separator)
		err = filepath.WalkDir(root, func(walked string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() && (entry.Name() == "node_modules" || strings.HasPrefix(entry.Name(), ".")) && walked != root {
				return filepath.SkipDir
			}
			if entry.IsDir() {
				return nil
			}
			_, statErr := os.Stat(walked)
			return statErr
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func repoRelative(path string) (string, error) {
	if !filepath.IsAbs(path) {
		return path, nil
	}
	rel, err := filepath.Rel(filepath.Clean(RepoRoot()), filepath.Clean(path))
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("testfixtures: %s is outside the repo", path)
	}
	return filepath.ToSlash(rel), nil
}
