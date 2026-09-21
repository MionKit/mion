// Package routerrules holds the mion route rules, the checks a JS lint plugin cannot make: the checker says
// a call is a route declaration when its RESOLVED signature is one of the helper interfaces `@mionjs/router`
// declares, so an alias, a namespace import and a local barrel match while a same-named call from another
// package does not, and it finds a handler through a named reference, a `Handler`-typed const, a `satisfies`
// expression or a `@mion:route` JSDoc tag as well as inline. The pass is opt-in and only the lint plugin
// asks for it: every code is Severity-Error and `mion compile` fails on one, so running these during a
// build would break the build of a team that had turned the rule off in its eslint config.
package routerrules

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// RouterModule declares the helper interfaces and the handler types, matched as in routerinit: the
// declaring file's nearest package.json name, or the ambient `declare module` form.
const RouterModule = "@mionjs/router"

// CoreModule declares the error classes the returned-error rule reads.
const CoreModule = "@mionjs/core"

// helperInterfaces maps the call signatures a route declaration goes through to the number of leading CALL
// CONTEXT parameters their handler takes; those never cross the wire, so the annotation rule exempts them.
// RawMiddleFnHelper is deliberately absent: a raw middleFn takes no typed params and declares no return
// type. This is the WHOLE table: the router writes each helper signature once on one of these interfaces
// and its own `lib/handlers.ts` bodies are consts TYPED BY them, so no helper is matched by name.
var helperInterfaces = map[string]int{
	"RouteHelper":     1,
	"MiddleFnHelper":  1,
	"HeadersFnHelper": 2,
}

// handlerTypes are the annotations that declare a handler without a helper call, to the same count.
var handlerTypes = map[string]int{
	"Handler":       1,
	"HeaderHandler": 2,
}

// jsdocTags declare a handler with neither a helper call nor a handler type; the tag names the helper.
var jsdocTags = map[string]struct {
	label     string
	ctxParams int
}{
	"@mion:route":     {"route", 1},
	"@mion:middleFn":  {"middleFn", 1},
	"@mion:headersFn": {"headersFn", 2},
}

// textSignals is the per-file pre-filter: a file naming none of them declares no handler this pass can
// find. The helper names carry their opening paren so the word `route` in prose does not force a walk.
var textSignals = []string{
	RouterModule, "route(", "query(", "mutation(", "middleFn(", "headersFn(",
	"Handler", "@mion:",
}

// handler is one function the rules run over, with the label the messages use and how many of its leading
// parameters are call context.
type handler struct {
	fn *ast.Node
	// origin is the node in THIS file that declared the handler.
	origin *ast.Node
	// external marks a handler whose body lives in another module, reported at origin instead: a lint
	// report carries a line and column but no file, so a position from another file would land on an
	// unrelated line of the file being linted.
	external  bool
	label     string
	ctxParams int
}

// at is the node a finding is reported at, or the handler's origin when the body is another module's.
func (discovered handler) at(node *ast.Node) *ast.Node {
	if discovered.external {
		return discovered.origin
	}
	return node
}

type fileScope struct {
	typeChecker *checker.Checker
	markerOpts  marker.Options
	sourceFile  *ast.SourceFile
	// filePath is the caller's spelling of the file, not the resolved one, so a site lines up with the request.
	filePath string
}

// diag anchors the site at the node's first TOKEN, not node.Pos(), which starts at the leading trivia: a
// site on the trivia lands on the user's own `eslint-disable-next-line` comment, so it would never silence.
func (scope *fileScope) diag(code string, node *ast.Node, args ...string) diagnostics.Diagnostic {
	return diagnostics.New(code, scope.site(node), args...)
}

// site is the token-anchored source range of a node.
func (scope *fileScope) site(node *ast.Node) diagnostics.Site {
	if node == nil {
		return diagnostics.Site{}
	}
	startLine, startCol := textpos.LineCol(scope.sourceFile, scanner.GetTokenPosOfNode(node, scope.sourceFile, false))
	endLine, endCol := textpos.LineCol(scope.sourceFile, node.End())
	return diagnostics.Site{
		FilePath:  scope.filePath,
		StartLine: startLine,
		StartCol:  startCol,
		EndLine:   endLine,
		EndCol:    endCol,
	}
}

// CheckSourceFile runs every mion route rule over one file, sorted by position; filePath is what the
// diagnostics echo.
func CheckSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, filePath string) []diagnostics.Diagnostic {
	if sourceFile == nil || sourceFile.IsDeclarationFile {
		return nil
	}
	scope := &fileScope{typeChecker: typeChecker, markerOpts: markerOpts, sourceFile: sourceFile, filePath: filePath}
	var found []diagnostics.Diagnostic
	// The unsafe-name rule reads declarations, not handlers, so it runs over every file: it reports the
	// declaration before any route reaches the type.
	found = append(found, scope.checkUnsafePropertyNames()...)
	if hasTextSignal(sourceFile.Text()) {
		for _, discovered := range scope.discoverHandlers() {
			found = append(found, scope.checkAnnotations(discovered)...)
			found = append(found, scope.checkThrows(discovered)...)
			found = append(found, scope.checkReturnedErrorType(discovered)...)
		}
	}
	sortDiagnostics(found)
	return found
}

// hasTextSignal is the pre-filter: no signal, no handler to find.
func hasTextSignal(text string) bool {
	for _, signal := range textSignals {
		if strings.Contains(text, signal) {
			return true
		}
	}
	return false
}

func sortDiagnostics(found []diagnostics.Diagnostic) {
	sort.SliceStable(found, func(i, j int) bool {
		left, right := found[i].Site, found[j].Site
		if left.StartLine != right.StartLine {
			return left.StartLine < right.StartLine
		}
		if left.StartCol != right.StartCol {
			return left.StartCol < right.StartCol
		}
		return found[i].Code < found[j].Code
	})
}
