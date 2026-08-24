package purefunctions

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// extractDeps walks factoryFn's body for `<utlName>.<method>(<keyLit>)`
// patterns and collects the literal keys as the entry's
// pureFnDependencies. The recognised methods are discovered via the
// `CompTimeArgs<string>` brand on their first parameter (see the brand
// annotations on rtUtils' pure-fn lookup methods in
// packages/ts-runtypes/src/runtypes/rtUtils.ts). The string-literal
// `<keyLit>` is resolved against a factory-local symbol table first
// (fast path for `const KEY = '…'` declared inside the factory body),
// then via `comptimeargs.ResolveLiteralString` (covers file-level /
// imported const bindings via the checker).
//
// When utlName is empty (factory has no first parameter), returns
// (nil, nil) — the caller is free to register the entry without deps.
//
// For findCompiledPureFn the literal is a bare fnName; we emit it with
// an empty namespace prefix (`"::" + fnName`) so the runtime's
// cross-namespace resolver treats it the same way as a suffix match.
// This mirrors the historical behaviour of the tracking proxy.
func extractDeps(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, factoryFn *ast.Node, utlName string) ([]string, []diagnostics.Diagnostic) {
	if utlName == "" {
		return nil, nil
	}
	localTable := buildFactoryLocalTable(factoryFn)
	depSet := map[string]bool{}
	var diags []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			handleCall(typeChecker, markerOpts, sourceFile, node, localTable, utlName, depSet, &diags)
		}
		node.ForEachChild(visit)
		return false
	}
	body := factoryFn.Body()
	if body == nil {
		return nil, nil
	}
	body.ForEachChild(visit)
	if len(depSet) == 0 {
		return nil, diags
	}
	deps := make([]string, 0, len(depSet))
	for key := range depSet {
		deps = append(deps, key)
	}
	sort.Strings(deps)
	return deps, diags
}

// handleCall checks one CallExpression. When the callee is a
// property access (`<utlName>.<method>(...)`) AND the called method's
// first parameter is branded `CompTimeArgs<string>` (the brand-based
// allowlist for rtUtils pure-fn lookup methods), resolves the first
// argument to a string literal and records it; otherwise it's a no-op.
func handleCall(
	typeChecker *checker.Checker,
	markerOpts marker.Options,
	sourceFile *ast.SourceFile,
	call *ast.Node,
	localTable symbolTable,
	utlName string,
	depSet map[string]bool,
	diags *[]diagnostics.Diagnostic,
) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindPropertyAccessExpression {
		return
	}
	propAccess := callee.AsPropertyAccessExpression()
	if propAccess == nil {
		return
	}
	receiver := propAccess.Expression
	if receiver == nil || receiver.Kind != ast.KindIdentifier || receiver.Text() != utlName {
		return
	}
	methodName := propAccess.Name()
	if methodName == nil || methodName.Kind != ast.KindIdentifier {
		return
	}
	method := methodName.Text()
	if !calleeFirstParamIsCompTimeArgs(typeChecker, markerOpts, call) {
		return
	}
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return
	}
	arg := callExpr.Arguments.Nodes[0]
	literal, _ := resolveDepArg(typeChecker, localTable, arg)
	if literal == nil {
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePurityDepNotLiteral,
			siteFromNode(sourceFile, arg),
			utlName,
			method,
		))
		return
	}
	depKey := literal.Text()
	if method == "findCompiledPureFn" {
		// Bare fnName; no namespace available statically. Use the
		// `"::" + fnName` form so the runtime's suffix-matching
		// findCompiledPureFn resolves it across all registered
		// namespaces — same semantics the tracking proxy used to
		// record.
		depKey = "::" + depKey
	}
	depSet[depKey] = true
}

// calleeFirstParamIsCompTimeArgs reports whether the resolved
// signature of call has its first parameter branded
// `CompTimeArgs<string>` (via marker.DetectAny). Brand-driven
// discovery avoids a hard-coded rtUtils-method allowlist.
func calleeFirstParamIsCompTimeArgs(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return false
	}
	first := parameters[0]
	if first == nil {
		return false
	}
	paramType := checker.Checker_getTypeOfSymbol(typeChecker, first)
	if kind, _, matched := marker.DetectAny(typeChecker, paramType, markerOpts); matched {
		return kind == marker.KindCompTimeArgs
	}
	// CompTimeArgs is the zero-cost identity marker (markers.ts) — invisible to
	// DetectAny on the resolved type, so recognise it off the parameter's
	// `CompTimeArgs<…>` annotation node (matches the resolver's scan path).
	return comptimeargs.IsCompTimeArgsParamNode(typeChecker, first, markerOpts)
}

// resolveDepArg traces argNode through the factory-local table first
// (covers `const FOO = 'rt::foo'; utl.getPureFn(FOO)` inside the
// factory) and falls back to comptimeargs.ResolveLiteralString
// (checker-driven trace, covers file-level / imported bindings) when
// the identifier isn't in the local table.
func resolveDepArg(typeChecker *checker.Checker, localTable symbolTable, argNode *ast.Node) (*ast.Node, string) {
	if argNode == nil {
		return nil, "argument missing"
	}
	// Fast path: literal at the call site.
	if argNode.Kind == ast.KindStringLiteral || argNode.Kind == ast.KindNoSubstitutionTemplateLiteral {
		return argNode, ""
	}
	// Factory-local identifier hop: `const FOO = '...'` inside the
	// factory body. This shadows checker-driven resolution because the
	// inner const isn't a module-level symbol the checker tracks the
	// same way.
	if argNode.Kind == ast.KindIdentifier {
		if decl, found := localTable[argNode.Text()]; found {
			return resolveDeclLocal(typeChecker, localTable, decl, maxTraceDepth)
		}
	}
	// Fallback: file-level / imported / wrapped identifier — let the
	// shared comptimeargs trace walk the checker symbol graph.
	literal, result := comptimeargs.ResolveLiteralString(typeChecker, argNode)
	if !result.Ok {
		return nil, result.Reason
	}
	return literal, ""
}

func resolveDeclLocal(typeChecker *checker.Checker, localTable symbolTable, decl *ast.Node, depth int) (*ast.Node, string) {
	if depth <= 0 {
		return nil, "tracing depth exceeded"
	}
	switch decl.Kind {
	case ast.KindVariableDeclaration:
		varDecl := decl.AsVariableDeclaration()
		if varDecl == nil || varDecl.Initializer == nil {
			return nil, "binding has no initializer"
		}
		init := varDecl.Initializer
		if init.Kind == ast.KindStringLiteral || init.Kind == ast.KindNoSubstitutionTemplateLiteral {
			return init, ""
		}
		// Initializer is another identifier — resolve recursively
		// through the local table, falling back to the checker trace.
		return resolveDepArg(typeChecker, localTable, init)
	}
	return nil, "binding is not a const literal"
}

// buildFactoryLocalTable indexes every `const x = <literal>` declared
// at any nesting level inside factoryFn's body, mapping name →
// VariableDeclaration node. `let` and `var` are intentionally skipped —
// mutable bindings can't be reduced to a literal at scan time.
//
// Why walk past function boundaries? The dep extractor walks the whole
// factory body looking for utl.<method>(...) calls; if a `const KEY =
// 'rt::foo'` lives in an outer block but the call lives in a nested
// arrow, both should resolve to the same value. Pure-fn semantics
// guarantee no rebinding, so the simple top-down walk is correct.
func buildFactoryLocalTable(factoryFn *ast.Node) symbolTable {
	table := symbolTable{}
	body := factoryFn.Body()
	if body == nil {
		return table
	}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindVariableStatement {
			vs := node.AsVariableStatement()
			if vs.DeclarationList != nil {
				declList := vs.DeclarationList.AsVariableDeclarationList()
				if declList.Flags&ast.NodeFlagsConst != 0 {
					for _, decl := range declList.Declarations.Nodes {
						varDecl := decl.AsVariableDeclaration()
						if varDecl.Name() != nil && varDecl.Name().Kind == ast.KindIdentifier && varDecl.Initializer != nil {
							table[varDecl.Name().Text()] = decl
						}
					}
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	body.ForEachChild(visit)
	return table
}

// Shared types used by the factory-local dep extractor in deps.go.
// The previous file-level symbol-table + traceIdentifier helpers
// have been moved to internal/compiler/comptimeargs — call
// `comptimeargs.ResolveLiteralString` for the checker-driven
// string-literal trace and `comptimeargs.CheckLiteralFunction` for
// the inline-function trace.

// maxTraceDepth bounds the factory-local identifier-chasing recursion
// inside deps.resolveDeclLocal so a `const a = b; const b = c; ...`
// chain (or a self-referential cycle) can't loop forever. Distinct
// from comptimeargs.DepthCap because the factory-local scope is
// guaranteed bounded by the factory body's nesting, so a smaller cap
// is fine here.
const maxTraceDepth = 8

// symbolTable maps identifier name → declaration node within a single
// scope. Built per-factory by buildFactoryLocalTable for the dep
// extractor — the file-level trace is now delegated to comptimeargs.
type symbolTable map[string]*ast.Node
