package mirror

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// staleVerbPatterns match a user-visible string that tells the reader to run a
// `gen` command. The CLI has no `gen` verb: the flag set is `enrich`, so every
// remedy spells `mion enrich …`.
var staleVerbPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(^|[^\w-])gen\s+--`),
	regexp.MustCompile(`(^|[^\w-])(re-)?run gen(\s|$)`),
}

// enrichmentSourceRoots are the trees whose string literals reach a user: the
// enrichment engine, the CLI that drives it, and the diagnostic catalog whose
// Detail prose is published on the website.
var enrichmentSourceRoots = []string{
	filepath.Join("..", ".."),
	filepath.Join("..", "..", "..", "cmd", "mion"),
	filepath.Join("..", "..", "..", "internal", "diagnostics"),
}

func TestNoStaleGenVerbInUserVisibleStrings(t *testing.T) {
	scanned := 0
	for _, root := range enrichmentSourceRoots {
		err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || !strings.HasSuffix(path, ".go") {
				return nil
			}
			// This file carries the patterns themselves.
			if filepath.Base(path) == "cli_verb_test.go" {
				return nil
			}
			scanned++
			fset := token.NewFileSet()
			file, parseErr := parser.ParseFile(fset, path, nil, 0)
			if parseErr != nil {
				return parseErr
			}
			ast.Inspect(file, func(node ast.Node) bool {
				lit, isLit := node.(*ast.BasicLit)
				if !isLit || lit.Kind != token.STRING {
					return true
				}
				text, unquoteErr := strconv.Unquote(lit.Value)
				if unquoteErr != nil {
					return true
				}
				for _, pattern := range staleVerbPatterns {
					if pattern.MatchString(text) {
						t.Errorf("%s: string names a `gen` command that does not exist; use `mion enrich`:\n  %s",
							fset.Position(lit.Pos()), text)
					}
				}
				return true
			})
			return nil
		})
		if err != nil {
			t.Fatalf("walking %s: %v", root, err)
		}
	}
	if scanned == 0 {
		t.Fatal("no Go sources scanned: the roots above stopped resolving")
	}
}

// TestBreadcrumbDriftMessagesNameTheEnrichVerb pins the GE002 / GE003 remedies
// a reader actually types.
func TestBreadcrumbDriftMessagesNameTheEnrichVerb(t *testing.T) {
	dir := t.TempDir()
	mirrorFile := filepath.Join(dir, "enriched", "user.ts")

	missingSource := "import type { User } from '../models/user';\n"
	findings := CheckBreadcrumbDrift(mirrorFile, missingSource, nil)
	if len(findings) != 1 {
		t.Fatalf("deleted source: want one finding; got %+v", findings)
	}
	assertEnrichVerb(t, "GE002", findings[0].Message)

	sourceDir := filepath.Join(dir, "models")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("creating %s: %v", sourceDir, err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "user.ts"), []byte("export interface Renamed {}\n"), 0o644); err != nil {
		t.Fatalf("writing the source: %v", err)
	}
	findings = CheckBreadcrumbDrift(mirrorFile, missingSource, nil)
	if len(findings) != 1 {
		t.Fatalf("renamed type: want one finding; got %+v", findings)
	}
	assertEnrichVerb(t, "GE003", findings[0].Message)
}

// TestParseMirrorErrorNamesTheEnrichVerb pins the same remedy on the reconcile
// path, which is where an unparsable mirror stops the run.
func TestParseMirrorErrorNamesTheEnrichVerb(t *testing.T) {
	_, err := ParseMirror("/rt/gen/broken.ts", []byte("export const friendlyUser: FriendlyText<User> = {"))
	if err == nil {
		t.Fatal("an unparsable mirror must error")
	}
	assertEnrichVerb(t, "parse failure", err.Error())
}

func assertEnrichVerb(t *testing.T, label, message string) {
	t.Helper()
	if !strings.Contains(message, "mion enrich") {
		t.Errorf("%s: message must name `mion enrich`; got %q", label, message)
	}
	for _, pattern := range staleVerbPatterns {
		if pattern.MatchString(message) {
			t.Errorf("%s: message still names a `gen` command; got %q", label, message)
		}
	}
}
