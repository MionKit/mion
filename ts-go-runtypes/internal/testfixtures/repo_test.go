package testfixtures

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// TestRepoLinks_ResolveToTheRealPaths pins testdata/repo to RepoLinks: each link exists and points at its repo path.
func TestRepoLinks_ResolveToTheRealPaths(t *testing.T) {
	root, err := filepath.EvalSymlinks(RepoRoot())
	if err != nil {
		t.Fatal(err)
	}
	for _, rel := range RepoLinks {
		info, err := os.Lstat(Repo(rel))
		if err != nil {
			t.Fatalf("%s has no link under testdata/repo: %v", rel, err)
		}
		if info.Mode()&fs.ModeSymlink == 0 {
			t.Errorf("testdata/repo/%s is not a symlink", rel)
		}
		resolved, err := filepath.EvalSymlinks(Repo(rel))
		if err != nil {
			t.Fatalf("testdata/repo/%s does not resolve: %v", rel, err)
		}
		if resolved != filepath.Join(root, filepath.FromSlash(rel)) {
			t.Errorf("testdata/repo/%s points at %s, not the repo's %s", rel, resolved, rel)
		}
	}
	var links []string
	err = filepath.WalkDir(filepath.Join(packageDir(), "testdata", "repo"), func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.Type()&fs.ModeSymlink == 0 {
			return err
		}
		rel, relErr := filepath.Rel(filepath.Join(packageDir(), "testdata", "repo"), path)
		links = append(links, filepath.ToSlash(rel))
		return relErr
	})
	if err != nil {
		t.Fatal(err)
	}
	want := append([]string(nil), RepoLinks...)
	sort.Strings(want)
	sort.Strings(links)
	if strings.Join(links, "\n") != strings.Join(want, "\n") {
		t.Errorf("testdata/repo holds %v, RepoLinks lists %v", links, want)
	}
}

// climbsOut is a path built by stepping three or more directories up, which from any package leaves the module.
var climbsOut = regexp.MustCompile(`"\.\.", "\.\.", "\.\."|\("\.\./\.\./\.\.`)

// TestRepoReads_GoThroughTheLinks keeps Go's test cache honest: it re-checks only files inside the module, so a test
// reading the repo must use Repo, or RepoRoot together with DeclareInputs for what a tool reads there.
func TestRepoReads_GoThroughTheLinks(t *testing.T) {
	module := filepath.Join(packageDir(), "..", "..")
	for _, dir := range []string{"internal", "cmd"} {
		err := filepath.WalkDir(filepath.Join(module, dir), func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() && entry.Name() == "testdata" {
				return filepath.SkipDir
			}
			inFixtures := filepath.Dir(path) == packageDir()
			if entry.IsDir() || !strings.HasSuffix(path, ".go") || (!strings.HasSuffix(path, "_test.go") && !inFixtures) {
				return nil
			}
			if inFixtures && (entry.Name() == "repo.go" || entry.Name() == "repo_test.go") {
				return nil
			}
			source, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(module, path)
			if climbsOut.Match(source) {
				t.Errorf("%s steps out of the module by hand: read through testfixtures.Repo or declare with DeclareInputs", rel)
			}
			if strings.Contains(string(source), "testfixtures.RepoRoot()") && !strings.Contains(string(source), "testfixtures.DeclareInputs(") {
				t.Errorf("%s hands repo paths to a tool without testfixtures.DeclareInputs", rel)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}

// TestDeclareInputs_StatsFilesAndSkipsInstalls covers a directory link, a file link and a missing path.
func TestDeclareInputs_StatsFilesAndSkipsInstalls(t *testing.T) {
	if err := DeclareInputs("packages/run-types/package.json", "version.json"); err != nil {
		t.Fatal(err)
	}
	if err := DeclareInputs("packages/run-types/src"); err != nil {
		t.Fatal(err)
	}
	if err := DeclareInputs("packages/run-types/no-such-dir"); err == nil {
		t.Error("a missing input must fail, or a renamed package silently declares nothing")
	}
}
