package testfixtures

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// RepoLinks are the repo paths outside this Go module that the Go tests read, each reached through a symlink
// under testdata/repo/: Go's test cache only re-checks files whose path lies inside the module.
var RepoLinks = []string{
	"packages/core",
	"packages/drizzle-orm",
	"packages/drizzle-orm-mysql-core",
	"packages/drizzle-orm-pg-core",
	"packages/drizzle-orm-sqlite-core",
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

// Repo returns rel (a repo-relative path under one of RepoLinks) as a path inside the module, through its link.
func Repo(rel string) string {
	return filepath.Join(packageDir(), "testdata", "repo", filepath.FromSlash(rel))
}

// RepoRoot is the real repo root, for a test that hands repo paths to a tool. Go's test cache cannot see what the
// tool reads there, so that test also calls DeclareInputs for it.
func RepoRoot() string {
	return filepath.Join(packageDir(), "..", "..", "..")
}

// DeclareInputs stats every file under each rel through its link, so Go's test cache keys on them even when the
// test's real reads go through a path outside the module (a temp dir symlinked into a package).
func DeclareInputs(rels ...string) error {
	for _, rel := range rels {
		info, err := os.Stat(Repo(rel))
		if err != nil {
			return err
		}
		if !info.IsDir() {
			continue
		}
		// The trailing separator makes WalkDir follow the link at the root.
		root := Repo(rel) + string(filepath.Separator)
		err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() && (entry.Name() == "node_modules" || strings.HasPrefix(entry.Name(), ".")) && path != root {
				return filepath.SkipDir
			}
			if entry.IsDir() {
				return nil
			}
			_, statErr := os.Stat(path)
			return statErr
		})
		if err != nil {
			return err
		}
	}
	return nil
}
