// Package routerrules holds the mion route rules: the checks that used to ship
// as hand-written `@mionjs/*` ESLint rules over a route, query, mutation,
// middleFn or headersFn handler.
//
// They lived in TypeScript because OXlint's plugin host gives a JS rule no type
// information, so every one of them had to recognise the router by reading
// import specifiers and could only see a handler written straight into the
// helper call. Here the checker answers both questions: a call counts as a route
// declaration when its RESOLVED signature is one of the helper interfaces
// `@mionjs/router` declares, so an alias, a namespace import and a local barrel
// all match and a same-named call from another package does not; and a handler
// is found through a named reference, a `Handler`-typed const, a `satisfies`
// expression and a `@mion:route` JSDoc tag as well as inline.
//
// The pass is opt-in (protocol.Request.CheckRouterRules). Every code is
// Severity-Error, which is the level the rules ship at, and `mion compile` fails
// on an Error-severity diagnostic — so running these during a build would break
// the build of a team that had turned the rule off in its eslint config. Only
// the lint plugin asks for them.
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

// RouterModule declares the helper interfaces and the handler types. Matched
// against the nearest package.json name of the declaring file, or the
// `declare module '@mionjs/router'` ambient form, exactly like routerinit.
const RouterModule = "@mionjs/router"

// CoreModule declares the error classes the returned-error rule reads.
const CoreModule = "@mionjs/core"

// helperInterfaces are the call signatures a route declaration goes through,
// mapped to the number of leading CALL CONTEXT parameters their handler takes.
// Those never cross the wire, so they are exempt from the annotation rule.
// RawMiddleFnHelper is deliberately absent: a raw middleFn takes no typed
// params and declares no return type, so none of these rules apply to it.
//
// This is the WHOLE table. The router package writes each helper signature once,
// on one of these interfaces, and its own `lib/handlers.ts` bodies are consts
// TYPED BY them, so the framework's built-in routes resolve to the same call
// signatures a user's `mion.route(...)` does. There are no plain helper
// functions left to match by name.
var helperInterfaces = map[string]int{
	"RouteHelper":     1,
	"MiddleFnHelper":  1,
	"HeadersFnHelper": 2,
}

// handlerTypes are the annotations that declare a handler without a helper call
// (`const h: Handler = …`), mapped to the same context parameter count.
var handlerTypes = map[string]int{
	"Handler":       1,
	"HeaderHandler": 2,
}

// jsdocTags declare a handler that neither rides a helper call nor carries a
// handler type annotation. The tag names the helper the function is written for.
var jsdocTags = map[string]struct {
	label     string
	ctxParams int
}{
	"@mion:route":     {"route", 1},
	"@mion:middleFn":  {"middleFn", 1},
	"@mion:headersFn": {"headersFn", 2},
}

// textSignals is the cheap per-file pre-filter. A file that names none of them
// declares no handler this pass can find, so it never pays a symbol resolution.
// The helper names are probed with their opening paren so a plain identifier
// spelled `route` in prose does not force a walk.
var textSignals = []string{
	RouterModule, "route(", "query(", "mutation(", "middleFn(", "headersFn(",
	"Handler", "@mion:",
}

// handler is one function the rules run over, with the label the messages use
// (the helper it was declared through, or the handler type it was annotated
// with) and how many of its leading parameters are call context.
type handler struct {
	fn *ast.Node
	// origin is the node in THIS file that declared the handler: the helper
	// call, the annotated declaration, or the function itself.
	origin *ast.Node
	// external marks a handler whose body lives in another module. A lint
	// report carries a line and column but no file, so the host pins it to the
	// file it is linting: a position taken from another file would land on an
	// unrelated line of this one. Findings on such a handler are reported at
	// origin instead, which is where this file names it.
	external bool
	// call is the helper call that declared the handler, nil on the two roads
	// that have none (a `Handler`-typed const, a JSDoc tag). Rules about what
	// the CALL says — its options literal, the router it was declared through —
	// need it, and have nothing to say about a handler found the other ways.
	call      *ast.Node
	label     string
	ctxParams int
}

// at is where a finding about `discovered` is reported: the node it was found
// at, or the handler's origin in this file when the body is another module's.
func (discovered handler) at(node *ast.Node) *ast.Node {
	if discovered.external {
		return discovered.origin
	}
	return node
}

// fileScope carries everything the rules need for one source file.
type fileScope struct {
	typeChecker *checker.Checker
	markerOpts  marker.Options
	sourceFile  *ast.SourceFile
	// filePath is the path diagnostics echo — the caller's spelling of the
	// file, not the resolved one, so a site lines up with what was requested.
	filePath string
}

// diag builds one diagnostic at a node.
//
// The site starts at the node's first TOKEN, not at node.Pos(), which is the
// start of its leading trivia. These are lint findings a user silences with an
// `eslint-disable-next-line` comment, and a site that started at the trivia
// would land on that very comment, one line above the code — the rule would
// then report on the line the user was disabling and the comment would never
// take effect.
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

// CheckSourceFile runs every mion route rule over one file and returns the
// findings sorted by position. filePath is the path the diagnostics echo.
func CheckSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, filePath string) []diagnostics.Diagnostic {
	if sourceFile == nil || sourceFile.IsDeclarationFile {
		return nil
	}
	scope := &fileScope{typeChecker: typeChecker, markerOpts: markerOpts, sourceFile: sourceFile, filePath: filePath}
	var found []diagnostics.Diagnostic
	// The unsafe-name rule reads declarations, not handlers, so it runs over
	// every file — that is the whole point of it: it reports the declaration
	// before any route reaches the type.
	found = append(found, scope.checkUnsafePropertyNames()...)
	if hasTextSignal(sourceFile.Text()) {
		for _, discovered := range scope.discoverHandlers() {
			found = append(found, scope.checkAnnotations(discovered)...)
			found = append(found, scope.checkThrows(discovered)...)
			found = append(found, scope.checkReturnedErrorType(discovered)...)
			found = append(found, scope.checkUnreachableStrictTypes(discovered)...)
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
