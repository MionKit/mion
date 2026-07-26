// extract-fn-bodies parses a TypeScript file and emits the original source
// text of every arrow-function body found inside a named top-level const
// declaration. The output JSON mirrors the const's object-literal nesting,
// with every leaf being either an arrow-function-body string or omitted
// entirely (non-function properties are skipped).
//
// The Node-side docs pipeline (scripts/website/bench-data/gen-serialization.mjs)
// spawns this binary, parses stdout, and merges the bodies with the runtime
// suite structure. Keeping the Go side narrow — bodies only — lets the Node side
// own the docs output shape and extend later (performance measurement, running
// validators, evaluated samples).
//
// Run:
//
//	go run ./cmd/extract-fn-bodies --file <path.ts> --identifier <NAME>
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
)

func main() {
	fileFlag := flag.String("file", "", "TypeScript file to parse (required)")
	identifierFlag := flag.String("identifier", "", "Top-level const identifier to extract from (required)")
	flag.Parse()
	if *fileFlag == "" || *identifierFlag == "" {
		fmt.Fprintln(os.Stderr, "usage: extract-fn-bodies --file <path.ts> --identifier <NAME>")
		os.Exit(2)
	}

	absPath, err := filepath.Abs(*fileFlag)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	sourceBytes, err := os.ReadFile(absPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	sourceText := string(sourceBytes)

	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: absPath, Path: tspath.Path(absPath)},
		sourceText,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		fmt.Fprintf(os.Stderr, "parse failed: %s\n", *fileFlag)
		os.Exit(1)
	}

	initializer := findConstInitializer(sourceFile, *identifierFlag)
	if initializer == nil {
		fmt.Fprintf(os.Stderr, "identifier not found at top level: %s\n", *identifierFlag)
		os.Exit(1)
	}
	initializer = unwrapAsExpression(initializer)
	if initializer.Kind != ast.KindObjectLiteralExpression {
		fmt.Fprintf(os.Stderr, "%s initializer is not an object literal (kind=%v)\n", *identifierFlag, initializer.Kind)
		os.Exit(1)
	}

	result := walk(sourceText, initializer)
	out, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Stdout.Write(out)
	os.Stdout.Write([]byte{'\n'})
}

// findConstInitializer locates a top-level `const <name> = <initializer>`
// (export-prefixed or not) and returns the initializer expression.
func findConstInitializer(sourceFile *ast.SourceFile, name string) *ast.Node {
	var found *ast.Node
	sourceFile.AsNode().ForEachChild(func(stmt *ast.Node) bool {
		if stmt.Kind != ast.KindVariableStatement {
			return false
		}
		varStmt := stmt.AsVariableStatement()
		if varStmt.DeclarationList == nil {
			return false
		}
		declList := varStmt.DeclarationList.AsVariableDeclarationList()
		for _, decl := range declList.Declarations.Nodes {
			varDecl := decl.AsVariableDeclaration()
			declName := varDecl.Name()
			if declName == nil || declName.Kind != ast.KindIdentifier {
				continue
			}
			if declName.Text() == name && varDecl.Initializer != nil {
				found = varDecl.Initializer
				return true
			}
		}
		return false
	})
	return found
}

// unwrapAsExpression strips outer type-only wrappers (`as const`, `satisfies T`,
// and parens) so the caller sees the underlying value expression. The
// validation suite uses `} as const satisfies { … }`, hence handling both.
func unwrapAsExpression(node *ast.Node) *ast.Node {
	for node != nil {
		switch node.Kind {
		case ast.KindAsExpression:
			node = node.AsAsExpression().Expression
		case ast.KindSatisfiesExpression:
			node = node.AsSatisfiesExpression().Expression
		case ast.KindParenthesizedExpression:
			node = node.AsParenthesizedExpression().Expression
		default:
			return node
		}
	}
	return node
}

// walk recurses an expression. Returns:
//   - map[string]any for ObjectLiteralExpression (with non-nil/non-empty leaves only)
//   - string for ArrowFunction (the normalized body text)
//   - nil for anything else
func walk(sourceText string, node *ast.Node) any {
	switch node.Kind {
	case ast.KindObjectLiteralExpression:
		obj := node.AsObjectLiteralExpression()
		out := make(map[string]any)
		if obj.Properties == nil {
			return out
		}
		for _, prop := range obj.Properties.Nodes {
			if prop.Kind != ast.KindPropertyAssignment {
				continue
			}
			pa := prop.AsPropertyAssignment()
			nameNode := pa.Name()
			if nameNode == nil || pa.Initializer == nil {
				continue
			}
			key := propertyKeyText(nameNode)
			if key == "" {
				continue
			}
			result := walk(sourceText, pa.Initializer)
			if result == nil {
				continue
			}
			// Prune empty inner objects — a property whose subtree has no
			// arrow functions adds noise to consumers.
			if inner, ok := result.(map[string]any); ok && len(inner) == 0 {
				continue
			}
			out[key] = result
		}
		return out
	case ast.KindArrowFunction:
		body := node.Body()
		if body == nil {
			return nil
		}
		return extractBodyText(sourceText, body)
	default:
		return nil
	}
}

// propertyKeyText resolves an object-literal property name to its source key.
// Handles identifier keys (`foo:`) and string-literal keys (`"foo":`). The
// validation suite only uses identifier keys.
func propertyKeyText(name *ast.Node) string {
	if name == nil {
		return ""
	}
	return name.Text()
}

// extractBodyText slices the source for an arrow-function body and normalizes:
//   - Block body `{ … }` → drop outer braces.
//   - ParenthesizedExpression `(…)` → drop outer parens (the `() => ({…})`
//     pattern wrapping an object literal).
//   - Plain expression body → take as-is.
//
// In all cases, dedent and strip leading/trailing blank lines.
func extractBodyText(sourceText string, body *ast.Node) string {
	raw := strings.TrimSpace(sourceText[body.Pos():body.End()])
	switch body.Kind {
	case ast.KindBlock:
		if len(raw) >= 2 && raw[0] == '{' && raw[len(raw)-1] == '}' {
			raw = raw[1 : len(raw)-1]
		}
	case ast.KindParenthesizedExpression:
		if len(raw) >= 2 && raw[0] == '(' && raw[len(raw)-1] == ')' {
			raw = raw[1 : len(raw)-1]
		}
	}
	return dedent(raw)
}

// dedent drops a leading and trailing blank line, then strips a common
// leading-space prefix from every line.
//
// The reference indent is normally the minimum across all non-blank lines.
// Exception: if the LAST line is a pure structural bracket (`}`, `)`, or
// `]`), its own indent is used as the reference and the bracket lines
// themselves are TrimLeft'd. This handles the asymmetric layout left
// behind by stripping outer parens around a multi-line object literal —
// the `{` ends up at column 0 while the matching `}` sits at the original
// indent of the closing paren, and the inner members are one level deeper.
// Picking the closing bracket's indent re-aligns everything so the result
// reads as a self-contained snippet.
func dedent(s string) string {
	lines := strings.Split(s, "\n")
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "" {
		lines = lines[1:]
	}
	if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	if len(lines) == 0 {
		return ""
	}
	refIndent := -1
	if len(lines) > 1 && isStructuralBracket(strings.TrimSpace(lines[len(lines)-1])) {
		refIndent = leadingSpaces(lines[len(lines)-1])
	} else {
		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			indent := leadingSpaces(line)
			if refIndent < 0 || indent < refIndent {
				refIndent = indent
			}
		}
	}
	if refIndent <= 0 {
		return strings.Join(lines, "\n")
	}
	for i, line := range lines {
		if len(line) >= refIndent {
			lines[i] = line[refIndent:]
		} else {
			lines[i] = strings.TrimLeft(line, " ")
		}
	}
	return strings.Join(lines, "\n")
}

func leadingSpaces(line string) int {
	n := 0
	for n < len(line) && line[n] == ' ' {
		n++
	}
	return n
}

// isStructuralBracket reports whether s is a single closing bracket (`}`,
// `)`, or `]`), optionally followed by a comma — the typical shapes left
// by Prettier on the trailing line of a multi-line literal.
func isStructuralBracket(s string) bool {
	if s == "" {
		return false
	}
	if s[len(s)-1] == ',' {
		s = s[:len(s)-1]
	}
	return s == "}" || s == ")" || s == "]"
}
