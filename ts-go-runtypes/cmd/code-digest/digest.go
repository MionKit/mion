package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"go/scanner"
	"go/token"
	"path"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/core"
)

// Bump when the token rules change, so every marker saved under the old rules stops matching.
// The marker tables are folded into the digest too, so editing them re-keys without a bump.
const toolVersion = "2"

var errUnsure = errors.New("unsure")

// tokenHook is told the [start, end) of every code token; the property test inserts comments before them.
type tokenHook func(start, end int)

func noHook(int, int) {}

// A line holding one of these markers counts as code, because a tool reads it.
var tsDirectives = []string{
	"@",                   // JSDoc tags the resolver reads (@nonEnumerable), @ts-*, @mion-expect-error, @vite-ignore, @vitest-environment, enrichment tags
	"#!",                  // the shebang picks the interpreter of a bin
	"eslint-",             // lint suppressions
	"oxlint-",             // lint suppressions
	"/// <",               // triple-slash references
	"__PURE__",            // bundlers drop calls marked pure
	"__NO_SIDE_EFFECTS__", // bundlers drop calls to functions marked side-effect free
	"webpack",             // webpack magic comments change chunking
	"istanbul",            // coverage hints
	"c8 ignore",           // coverage hints
	"v8 ignore",           // coverage hints
	"prettier-ignore",     // the formatter leaves the next node alone
	"oxfmt-ignore",        // the formatter leaves the next node alone
	"sourceMappingURL",    // points tools at a source map
}

var goDirectives = []string{
	"//go:",     // build constraints, embed, generate, linkname and compiler pragmas
	"//line ",   // line directives change reported positions
	"// +build", // old-style build constraints
	"//export ", // cgo exports
	"//nolint",  // linter suppressions
}

// directiveLines returns every line holding a marker, trimmed. A marker inside a string also counts,
// which can only cost a re-run.
func directiveLines(text string, directives []string) []string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		for _, marker := range directives {
			if strings.Contains(line, marker) {
				lines = append(lines, strings.TrimSpace(line))
				break
			}
		}
	}
	return lines
}

// language is how a path is digested: "ts", "js", "go", or "" to hash it raw. JSX stays raw.
func language(filePath string) string {
	switch path.Ext(filePath) {
	case ".ts", ".mts", ".cts":
		return "ts"
	case ".js", ".mjs", ".cjs":
		return "js"
	case ".go":
		return "go"
	}
	return ""
}

// digest hashes a file's code without its comments and blank lines; ok is false when the file must hash raw.
func digest(filePath, text string) (string, bool) {
	var out strings.Builder
	var err error
	var directives []string
	switch language(filePath) {
	case "ts":
		err, directives = tsWalk(filePath, text, core.ScriptKindTS, &out, noHook), tsDirectives
	case "js":
		err, directives = tsWalk(filePath, text, core.ScriptKindJS, &out, noHook), tsDirectives
	case "go":
		err, directives = goTokens(text, &out, noHook), goDirectives
	default:
		return "", false
	}
	if err != nil {
		return "", false
	}
	sum := sha256.New()
	fmt.Fprintf(sum, "code-digest %s %q\n", toolVersion, directives)
	sum.Write([]byte(out.String()))
	for _, line := range directiveLines(text, directives) {
		fmt.Fprintf(sum, "directive %d:%s\n", len(line), line)
	}
	return hex.EncodeToString(sum.Sum(nil)), true
}

// Comments that are code in Go: a cgo preamble (plain or grouped import), and the `// Output:` block an example test asserts on.
var goCommentsAreCode = regexp.MustCompile(`(?m)^\s*(import\s+)?"C"\s*$|^func Example`)

// goTokens writes every Go token with comments off; the scanner already emits the automatic semicolons.
func goTokens(text string, out *strings.Builder, onToken tokenHook) error {
	if goCommentsAreCode.MatchString(text) {
		return errUnsure
	}
	fileSet := token.NewFileSet()
	file := fileSet.AddFile("", fileSet.Base(), len(text))
	var goScanner scanner.Scanner
	failed := false
	goScanner.Init(file, []byte(text), func(token.Position, string) { failed = true }, 0)
	for {
		pos, tok, lit := goScanner.Scan()
		if tok == token.EOF {
			break
		}
		fmt.Fprintf(out, "%v %d:%s\n", tok, len(lit), lit)
		// An automatic semicolon has no text of its own.
		if tok == token.SEMICOLON && lit == "\n" {
			continue
		}
		width := len(lit)
		if width == 0 {
			width = len(tok.String())
		}
		onToken(file.Offset(pos), file.Offset(pos)+width)
	}
	if failed {
		return errUnsure
	}
	return nil
}
