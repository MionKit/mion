package main

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// tsWalk writes the syntax tree minus trivia: every node as `(kind … )`, every token as `kind text`.
// The tree carries what a line break decides (automatic semicolons), so line breaks themselves drop out.
func tsWalk(path, text string, scriptKind core.ScriptKind, out *strings.Builder, onToken tokenHook) error {
	fileName := "/code-digest/" + path
	sourceFile := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: fileName, Path: tspath.Path(fileName)}, text, scriptKind)
	if sourceFile == nil || len(sourceFile.Diagnostics()) > 0 || len(sourceFile.JSDiagnostics()) > 0 {
		return errUnsure
	}
	// A checkJs package takes its types from JSDoc, so a JS file keeps its JSDoc blocks.
	walker := &tsWalker{text: text, out: out, scan: scanner.NewScanner(), onToken: onToken, keepJSDoc: scriptKind == core.ScriptKindJS}
	walker.scan.SetText(text)
	if err := walker.node(sourceFile.AsNode()); err != nil {
		return err
	}
	// Every non-trivia byte must have been emitted exactly once, so nothing the walk missed can hide a change.
	if scanner.SkipTrivia(text, walker.covered) != len(text) {
		return errUnsure
	}
	walker.trivia(len(text))
	return nil
}

// tsWalker's row per kind: a token is emitted whole, a JSDoc node is dropped (it lives in a comment),
// anything else is walked through (its children, plus the punctuation and keywords scanned between them).
func walkRow(kind ast.Kind) string {
	switch {
	case ast.IsJSDocKind(kind):
		return "dropped"
	case ast.IsTokenKind(kind):
		return "emitted whole"
	default:
		return "walked through"
	}
}

type tsWalker struct {
	text      string
	out       *strings.Builder
	scan      *scanner.Scanner
	covered   int
	onToken   tokenHook
	keepJSDoc bool
}

func (walker *tsWalker) node(node *ast.Node) error {
	var children []*ast.Node
	node.ForEachChild(func(child *ast.Node) bool {
		// Reparsed nodes are synthesized from JSDoc in JS files and sit inside comments.
		if child.Flags&ast.NodeFlagsReparsed == 0 && walkRow(child.Kind) != "dropped" {
			children = append(children, child)
		}
		return false
	})
	fmt.Fprintf(walker.out, "(%v\n", node.Kind)
	// A token node is emitted whole: its text may be a regex, a string or a template that a fresh scan would misread.
	if len(children) == 0 && walkRow(node.Kind) == "emitted whole" {
		if err := walker.token(node.Kind, scanner.SkipTrivia(walker.text, node.Pos()), node.End()); err != nil {
			return err
		}
	} else {
		for _, child := range children {
			if err := walker.gap(scanner.SkipTrivia(walker.text, child.Pos())); err != nil {
				return err
			}
			if err := walker.node(child); err != nil {
				return err
			}
		}
		if err := walker.gap(node.End()); err != nil {
			return err
		}
	}
	walker.out.WriteString(")\n")
	return nil
}

// gap emits the punctuation and keywords between two children, which are never regex or template text.
func (walker *tsWalker) gap(end int) error {
	if end < walker.covered {
		return errUnsure
	}
	walker.scan.ResetPos(walker.covered)
	for {
		kind := walker.scan.Scan()
		if kind == ast.KindEndOfFile || walker.scan.TokenStart() >= end {
			return nil
		}
		if err := walker.token(kind, walker.scan.TokenStart(), walker.scan.TokenEnd()); err != nil {
			return err
		}
	}
}

func (walker *tsWalker) token(kind ast.Kind, start, end int) error {
	if start == end {
		return nil
	}
	if start > end || scanner.SkipTrivia(walker.text, walker.covered) != start {
		return errUnsure
	}
	walker.trivia(start)
	walker.onToken(start, end)
	fmt.Fprintf(walker.out, "%v %d:%s\n", kind, end-start, walker.text[start:end])
	walker.covered = end
	return nil
}

// trivia emits the JSDoc blocks between the last token and end; that text is only whitespace and comments.
func (walker *tsWalker) trivia(end int) {
	if !walker.keepJSDoc {
		return
	}
	text := walker.text[:end]
	for at := walker.covered; at < end; {
		switch {
		case strings.HasPrefix(text[at:], "/*"):
			commentEnd := strings.Index(text[at+2:], "*/")
			if commentEnd == -1 {
				return
			}
			if block := text[at : at+commentEnd+4]; strings.HasPrefix(block, "/**") {
				fmt.Fprintf(walker.out, "jsdoc %d:%s\n", len(block), block)
			}
			at += commentEnd + 4
		case strings.HasPrefix(text[at:], "//"), strings.HasPrefix(text[at:], "#!"):
			lineEnd := strings.IndexByte(text[at:], '\n')
			if lineEnd == -1 {
				return
			}
			at += lineEnd
		default:
			at++
		}
	}
}
