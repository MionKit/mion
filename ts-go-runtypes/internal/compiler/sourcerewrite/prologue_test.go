package sourcerewrite

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// parseForTest gives PrologueEnd the real AST the resolver hands it, so no fixture pins its prologue by hand.
func parseForTest(file, code string) *ast.SourceFile {
	return parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/" + file, Path: tspath.Path("/" + file)}, code, core.GetScriptKindFromFileName(file))
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
		{"comment then code", "'use client'; /* c */ a;\n", 13, 13, "\n" + block},
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
