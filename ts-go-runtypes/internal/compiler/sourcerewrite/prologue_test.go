package sourcerewrite

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
)

func parseForTest(file, code string) *ast.SourceFile {
	kind := core.ScriptKindTS
	if strings.HasSuffix(file, ".tsx") {
		kind = core.ScriptKindTSX
	}
	return parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/" + file, Path: tspath.Path("/" + file)}, code, kind)
}

// TestPrologueEnd_Fixtures re-derives every fixture's prologueEnd from a real parse, so the committed offsets
// are what the resolver would pass, not values the generator happened to write.
func TestPrologueEnd_Fixtures(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join("testdata", "*.json"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no fixture testdata/*.json: %v", err)
	}
	for _, path := range paths {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		var tc fixtureCase
		if err := json.Unmarshal(raw, &tc); err != nil {
			t.Fatalf("unmarshal %s: %v", path, err)
		}
		if got := PrologueEnd(parseForTest(tc.File, tc.Code)); got != tc.PrologueEnd {
			t.Errorf("%s: PrologueEnd = %d, want %d", filepath.Base(path), got, tc.PrologueEnd)
		}
	}
}

func TestPrologueEnd_Shapes(t *testing.T) {
	cases := []struct {
		name, code string
		want       int
	}{
		{"none", "const a = 1;\n", 0},
		{"shebang only", "#!/usr/bin/env node", len("#!/usr/bin/env node")},
		{"shebang line", "#!/usr/bin/env node\nconst a = 1;\n", len("#!/usr/bin/env node")},
		{"parenthesized is no directive", "(\"use client\");\nconst a = 1;\n", 0},
		{"directive after code is no prologue", "const a = 1;\n\"use client\";\n", 0},
		{"stops at first statement", "\"use client\";\nconst a = 1;\n\"use strict\";\n", len("\"use client\";")},
		{"template literal is no directive", "`use client`;\n", 0},
	}
	for _, tc := range cases {
		if got := PrologueEnd(parseForTest("a.ts", tc.code)); got != tc.want {
			t.Errorf("%s: PrologueEnd = %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestPlaceImportBlock(t *testing.T) {
	const block = "import {x} from 'm';\n"
	cases := []struct {
		name, source string
		prologueEnd  int
		wantAt       int
		wantBlock    string
	}{
		{"no prologue prepends", "a;\n", 0, 0, block},
		{"next line", "'use client';\na;\n", 13, 14, block},
		{"crlf", "'use client';\r\na;\r\n", 13, 15, block},
		{"line comment at eof", "'use client' // c", 12, 12, "\n" + block},
		{"directive at eof", "'use client'", 12, 12, "\n" + block},
		{"unclosed block comment", "'use client' /* c", 12, 12, "\n" + block},
	}
	for _, tc := range cases {
		at, gotBlock := placeImportBlock(tc.source, tc.prologueEnd, block)
		if at != tc.wantAt || gotBlock != tc.wantBlock {
			t.Errorf("%s: got (%d, %q), want (%d, %q)", tc.name, at, gotBlock, tc.wantAt, tc.wantBlock)
		}
	}
}
