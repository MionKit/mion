package main

import (
	"fmt"
	"go/scanner"
	"go/token"
	"regexp"
	"strings"
)

// Comments that are code in Go: a cgo preamble, and the `// Output:` block an example test asserts on.
var goCommentsAreCode = regexp.MustCompile(`(?m)^import "C"|^func Example`)

// goTokens writes every Go token with comments off; the scanner already emits the automatic semicolons.
func goTokens(text string, out *strings.Builder) error {
	if goCommentsAreCode.MatchString(text) {
		return errUnsure
	}
	fileSet := token.NewFileSet()
	file := fileSet.AddFile("", fileSet.Base(), len(text))
	var goScanner scanner.Scanner
	failed := false
	goScanner.Init(file, []byte(text), func(token.Position, string) { failed = true }, 0)
	for {
		_, tok, lit := goScanner.Scan()
		if tok == token.EOF {
			break
		}
		fmt.Fprintf(out, "%v %d:%s\n", tok, len(lit), lit)
	}
	if failed {
		return errUnsure
	}
	return nil
}
