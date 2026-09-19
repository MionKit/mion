package purefunctions

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
)

// extractDeps walks factoryFn's body for `<utlName>.<method>(<idArg>)` patterns
// and collects the pure-fn ids they reach. The recognised methods are
// discovered via the `CompTimeArgs<string>` brand on their first parameter (see
// the brand annotations on rtUtils' pure-fn lookup methods in
// packages/run-types/src/runtypes/rtUtils.ts).
//
// It returns three things beside the diagnostics:
//
//   - deps: the sorted, deduped ids, which drive the dependency graph.
//   - lowerings: the argument spans to replace with a quoted id when the body
//     is stripped. An id reached by IMPORT has no meaning in the emitted
//     module, which carries the body alone, so the body must carry the literal.
//   - exempt: those spans plus every branded name from an unbuilt package, handed to the purity check so
//     neither is reported as a captured outer binding.
//
// When utlName is empty (factory has no first parameter), returns nothing — the
// caller is free to register the entry without deps.
func (ctx *resolveCtx) extractDeps(sourceFile *ast.SourceFile, factoryFn *ast.Node, utlName string) ([]string, []textRange, []textRange, []diagnostics.Diagnostic) {
	if utlName == "" {
		return nil, nil, nil, nil
	}
	localTable := buildFactoryLocalTable(factoryFn)
	depSet := map[string]bool{}
	var lowerings, exempt []textRange
	var diags []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			ctx.handleCall(sourceFile, node, localTable, utlName, depSet, &lowerings, &exempt, &diags)
		}
		node.ForEachChild(visit)
		return false
	}
	body := factoryFn.Body()
	if body == nil {
		return nil, nil, nil, nil
	}
	body.ForEachChild(visit)
	if len(depSet) == 0 {
		return nil, lowerings, exempt, diags
	}
	deps := make([]string, 0, len(depSet))
	for id := range depSet {
		deps = append(deps, id)
	}
	sort.Strings(deps)
	return deps, lowerings, exempt, diags
}

// handleCall checks one CallExpression. When the callee is a property access
// (`<utlName>.<method>(...)`) AND the called method's first parameter is branded
// `CompTimeArgs<string>` (the brand-based allowlist for rtUtils pure-fn lookup
// methods), resolves the first argument to a pure-fn id and records it;
// otherwise it's a no-op.
func (ctx *resolveCtx) handleCall(
	sourceFile *ast.SourceFile,
	call *ast.Node,
	localTable symbolTable,
	utlName string,
	depSet map[string]bool,
	lowerings *[]textRange,
	exempt *[]textRange,
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
	if !ctx.calleeFirstParamIsCompTimeArgs(call) {
		return
	}
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return
	}
	arg := callExpr.Arguments.Nodes[0]
	id, lower, cycle, cycleFile := ctx.resolveDepArg(localTable, arg)
	if cycle {
		// Both ends by name: the dependency and the file it is declared in, plus
		// the file holding this reference back into it. The two files are the
		// same one when the cycle is written inside a single module.
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePureFnDependencyCycle,
			siteFromNode(sourceFile, arg),
			unwrapExpression(arg).Text(),
			cycleFile,
			sourceFile.FileName(),
		))
		return
	}
	if id == "" {
		inner := unwrapExpression(arg)
		// A branded name from a package that ships nothing to serve is that package's fault, not the call's.
		if packageName, unbuilt := ctx.unbuiltPackageOf(inner); unbuilt {
			*diags = append(*diags, diagnostics.New(diagnostics.CodePureFnDepUnbuilt, siteFromNode(sourceFile, arg), inner.Text(), packageName))
			*exempt = append(*exempt, textRange{Start: inner.Pos(), End: inner.End(), Text: inner.Text()})
			return
		}
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePurityDepNotLiteral,
			siteFromNode(sourceFile, arg),
			utlName,
			method,
		))
		return
	}
	depSet[id] = true
	if lower {
		inner := unwrapExpression(arg)
		lowering := textRange{Start: inner.Pos(), End: inner.End(), Text: jsquote.Single(id)}
		*lowerings = append(*lowerings, lowering)
		*exempt = append(*exempt, lowering)
	}
}

// unbuiltPackageOf names the package of an identifier declared in a `.d.ts` with the PureFnId brand when that
// package ships no compiled pure fns and no sources: the name is a pure fn, only nothing can serve it.
func (ctx *resolveCtx) unbuiltPackageOf(identifier *ast.Node) (string, bool) {
	if identifier.Kind != ast.KindIdentifier || ctx.markerOpts.PureFnBindings == nil || ctx.typeChecker == nil {
		return "", false
	}
	kind, _, matched := marker.DetectAny(ctx.typeChecker, ctx.typeChecker.GetTypeAtLocation(identifier), ctx.markerOpts)
	if !matched || kind != marker.KindPureFnId {
		return "", false
	}
	symbol := comptimeargs.ResolveImportAlias(ctx.typeChecker, ctx.typeChecker.GetSymbolAtLocation(identifier))
	packageName, unbuilt := "", false
	comptimeargs.EachConstVariableDeclaration(symbol, func(variableDecl *ast.VariableDeclaration) bool {
		declFile := ast.GetSourceFileOfNode(variableDecl.AsNode())
		if declFile == nil || !declFile.IsDeclarationFile {
			return true
		}
		packageName, unbuilt = ctx.markerOpts.PureFnBindings.UnbuiltPackage(declFile.FileName())
		return !unbuilt
	})
	return packageName, unbuilt
}

// calleeFirstParamIsCompTimeArgs reports whether the resolved
// signature of call has its first parameter branded
// `CompTimeArgs<string>` (via marker.DetectAny). Brand-driven
// discovery avoids a hard-coded rtUtils-method allowlist.
func (ctx *resolveCtx) calleeFirstParamIsCompTimeArgs(call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(ctx.typeChecker, call, nil, 0)
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
	paramType := checker.Checker_getTypeOfSymbol(ctx.typeChecker, first)
	if kind, _, matched := marker.DetectAny(ctx.typeChecker, paramType, ctx.markerOpts); matched && kind == marker.KindCompTimeArgs {
		return true
	}
	// CompTimeArgs is the zero-cost identity marker (markers.ts): TS keeps its
	// alias only sometimes, and what survives is whatever the type it wraps
	// carries — for a pure-fn lookup that is the PureFnId brand. So a match on
	// another marker settles nothing, and the annotation NODE is what decides
	// (the same rule the resolver's scan path applies).
	return comptimeargs.IsCompTimeArgsParamNode(ctx.typeChecker, first, ctx.markerOpts)
}

// resolveDepArg turns one lookup argument into the pure-fn id it names, and
// says whether that argument must be LOWERED to the quoted id when the body is
// stripped. Five ways in, in order:
//
//  1. A string literal written at the call site. Nothing to lower.
//  2. A factory-local `const` bound to a string literal. The declaration is
//     inside the body being emitted, so nothing to lower either.
//  3. An identifier whose declaration is a `const` in a source file of THIS
//     program, initialised by a registrar call: the id is that declaration's
//     own, by the same rule the extractor used on it. This is the
//     `import {slugify} from './slug'` case, and it lowers.
//  4. An expression whose TYPE is a string literal, which is how a `.d.ts`
//     carries an id (`declare const x: PureFnId<'…'>`). It lowers too.
//  5. An identifier declared in a `.d.ts` WITHOUT a literal type
//     (`declare const x: PureFnId<string>`, what tsc emits when the build
//     injected the id): the package's compiled files say which id that name
//     registers (marker.Options.PureFnBindings). It lowers too.
//
// An empty id means none of the five applied; the caller reports PFE9013.
func (ctx *resolveCtx) resolveDepArg(localTable symbolTable, argNode *ast.Node) (id string, lower, cycle bool, cycleFile string) {
	if argNode == nil {
		return "", false, false, ""
	}
	// Fast path: literal at the call site.
	if argNode.Kind == ast.KindStringLiteral || argNode.Kind == ast.KindNoSubstitutionTemplateLiteral {
		return argNode.Text(), false, false, ""
	}
	// Factory-local identifier hop: `const FOO = '...'` inside the factory
	// body. This shadows checker-driven resolution because the inner const
	// isn't a module-level symbol the checker tracks the same way.
	if argNode.Kind == ast.KindIdentifier {
		if decl, found := localTable[argNode.Text()]; found {
			if literal := resolveDeclLocal(ctx.typeChecker, localTable, decl, maxTraceDepth); literal != nil {
				return literal.Text(), false, false, ""
			}
		}
	}
	inner := unwrapExpression(argNode)
	if inner.Kind == ast.KindIdentifier {
		id, found, inCycle, inCycleFile := ctx.registrationIDOfBinding(inner)
		if inCycle {
			return "", false, true, inCycleFile
		}
		if found {
			return id, true, false, ""
		}
	}
	// A `.d.ts`-declared id carries its value in the TYPE, which is also what a
	// generated constants file exports. Read it off the expression.
	if id, found := stringLiteralTypeOf(ctx.typeChecker, inner); found {
		return id, true, false, ""
	}
	if inner.Kind == ast.KindIdentifier {
		if id, found := ctx.declaredBindingID(inner); found {
			return id, true, false, ""
		}
	}
	// Last resort: the shared checker-driven trace, which covers a same-module
	// `const` chain ending in a literal.
	if literal, result := comptimeargs.ResolveLiteralString(ctx.typeChecker, argNode); result.Ok {
		return literal.Text(), false, false, ""
	}
	return "", false, false, ""
}

// registrationIDOfBinding resolves an identifier to the `const` declaration it
// names — through an import alias, so a binding imported from another file of
// this program resolves to that file's declaration — and returns the id of the
// registration that declaration initialises. False when the identifier names
// something else, which keeps an ordinary imported string from passing as an
// id.
//
// The declaring registration is EXTRACTED to answer this, because an id is the
// hash of a body that only exists once its own dependencies are lowered in.
// That work is memoised and is the same work the emitted module needs, so the
// dependency is rendered once however many dependents reach it.
//
// cycle is true when the declaration is already being resolved further up the
// stack. Its id would have to contain itself, so there is nothing to return;
// cycleFile is the file that declaration lives in, which is the far end of the
// cycle and the second file the diagnostic names.
func (ctx *resolveCtx) registrationIDOfBinding(identifier *ast.Node) (id string, found, cycle bool, cycleFile string) {
	symbol := comptimeargs.ResolveImportAlias(ctx.typeChecker, ctx.typeChecker.GetSymbolAtLocation(identifier))
	comptimeargs.EachConstVariableDeclaration(symbol, func(variableDecl *ast.VariableDeclaration) bool {
		nameNode := variableDecl.Name()
		if nameNode == nil || nameNode.Kind != ast.KindIdentifier || variableDecl.Initializer == nil {
			return true
		}
		initializer := unwrapExpression(variableDecl.Initializer)
		if initializer.Kind != ast.KindCallExpression {
			return true
		}
		declFile := ast.GetSourceFileOfNode(variableDecl.AsNode())
		if declFile == nil {
			return true
		}
		if matched, _, _, _ := ctx.isPureFnRegistration(initializer); !matched {
			return true
		}
		entry, _, inCycle := ctx.entryFor(declFile, initializer)
		if inCycle {
			cycle, cycleFile = true, declFile.FileName()
			return false
		}
		if entry == nil {
			return true
		}
		id, found = entry.ID, true
		return false
	})
	return id, found, cycle, cycleFile
}

// declaredBindingID resolves an identifier, through its import alias, to a
// `const` declared in a `.d.ts` and asks the declaring package's compiled files
// for the id that name registers. False when the declaration is not in a
// `.d.ts`, no resolver is wired, or the package ships no such binding.
func (ctx *resolveCtx) declaredBindingID(identifier *ast.Node) (string, bool) {
	if ctx.markerOpts.PureFnBindings == nil {
		return "", false
	}
	symbol := comptimeargs.ResolveImportAlias(ctx.typeChecker, ctx.typeChecker.GetSymbolAtLocation(identifier))
	id, found := "", false
	comptimeargs.EachConstVariableDeclaration(symbol, func(variableDecl *ast.VariableDeclaration) bool {
		nameNode := variableDecl.Name()
		declFile := ast.GetSourceFileOfNode(variableDecl.AsNode())
		if nameNode == nil || nameNode.Kind != ast.KindIdentifier || declFile == nil || !declFile.IsDeclarationFile {
			return true
		}
		id, found = ctx.markerOpts.PureFnBindings.BindingID(declFile.FileName(), nameNode.Text())
		return !found
	})
	return id, found
}

// stringLiteralTypeOf reads the string value off an expression's TYPE. A branded
// id (`PureFnId<'…'>`) resolves to an intersection of the literal and its brand
// object, so the constituents are scanned as well.
func stringLiteralTypeOf(typeChecker *checker.Checker, node *ast.Node) (string, bool) {
	if typeChecker == nil || node == nil {
		return "", false
	}
	return stringLiteralOfType(typeChecker.GetTypeAtLocation(node))
}

func stringLiteralOfType(tsType *checker.Type) (string, bool) {
	if tsType == nil {
		return "", false
	}
	if tsType.Flags()&checker.TypeFlagsStringLiteral != 0 {
		if value, ok := tsType.AsLiteralType().Value().(string); ok {
			return value, true
		}
		return "", false
	}
	if tsType.Flags()&checker.TypeFlagsIntersection != 0 {
		for _, member := range tsType.AsUnionOrIntersectionType().Types() {
			if value, ok := stringLiteralOfType(member); ok {
				return value, true
			}
		}
	}
	return "", false
}

// unwrapExpression peels the wrappers that carry no runtime meaning —
// parentheses, `as`, `satisfies`, a legacy type assertion and `!` — so the
// expression underneath is what gets resolved and what gets lowered. Lowering
// the inner node keeps the replacement span clear of the type-stripping ranges,
// which start exactly where it ends.
func unwrapExpression(node *ast.Node) *ast.Node {
	for node != nil {
		switch node.Kind {
		case ast.KindParenthesizedExpression:
			node = node.AsParenthesizedExpression().Expression
		case ast.KindAsExpression:
			node = node.AsAsExpression().Expression
		case ast.KindSatisfiesExpression:
			node = node.AsSatisfiesExpression().Expression
		case ast.KindTypeAssertionExpression:
			node = node.AsTypeAssertion().Expression
		case ast.KindNonNullExpression:
			node = node.AsNonNullExpression().Expression
		default:
			return node
		}
	}
	return node
}

// resolveDeclLocal walks a factory-local `const` chain to the string literal it
// ends at, or nil when it ends anywhere else.
func resolveDeclLocal(typeChecker *checker.Checker, localTable symbolTable, decl *ast.Node, depth int) *ast.Node {
	if depth <= 0 || decl.Kind != ast.KindVariableDeclaration {
		return nil
	}
	varDecl := decl.AsVariableDeclaration()
	if varDecl == nil || varDecl.Initializer == nil {
		return nil
	}
	init := varDecl.Initializer
	if init.Kind == ast.KindStringLiteral || init.Kind == ast.KindNoSubstitutionTemplateLiteral {
		return init
	}
	// Initializer is another identifier — resolve recursively through the local
	// table.
	if init.Kind == ast.KindIdentifier {
		if next, found := localTable[init.Text()]; found {
			return resolveDeclLocal(typeChecker, localTable, next, depth-1)
		}
	}
	return nil
}

// buildFactoryLocalTable indexes every `const x = <literal>` declared
// at any nesting level inside factoryFn's body, mapping name →
// VariableDeclaration node. `let` and `var` are intentionally skipped —
// mutable bindings can't be reduced to a literal at scan time.
//
// Why walk past function boundaries? The dep extractor walks the whole
// factory body looking for utl.<method>(...) calls; if a `const ID =
// '@acme/app/src/fns#foo'` lives in an outer block but the call lives in a nested
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
