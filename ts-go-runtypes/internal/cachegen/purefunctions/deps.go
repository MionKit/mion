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

// extractDeps collects the pure-fn ids `<utlName>.<method>(<idArg>)` calls in factoryFn's body
// reach. A recognised method is one whose first parameter carries the `CompTimeArgs<string>` brand
// (the annotations on rtUtils' pure-fn lookup methods, packages/run-types/src/runtypes/rtUtils.ts).
//
// Beside the diagnostics it returns the sorted, deduped deps; the lowerings, argument spans to
// replace with a quoted id when the body is stripped, since an imported id means nothing in a
// module carrying the body alone; and exempt, the lowerings plus branded names from unbuilt
// packages, which the purity check must not report as captured.
//
// An empty utlName (the factory has no first parameter) returns nothing.
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

// handleCall records the pure-fn id the first argument of one `<utlName>.<method>(...)` call
// names, the brand on the method's first parameter being the allowlist.
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
		// The package that ships nothing to serve is at fault, not the call.
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

// unbuiltPackageOf names the package of a PureFnId-branded `.d.ts` name when it ships no compiled pure fns and no sources.
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

// calleeFirstParamIsCompTimeArgs reports whether the call's resolved signature brands its first
// parameter `CompTimeArgs<string>`, which is what avoids a hard-coded rtUtils-method allowlist.
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
	// CompTimeArgs is the zero-cost identity marker (markers.ts): TS keeps its alias only
	// sometimes, and what survives is whatever the wrapped type carries, the PureFnId brand for
	// a pure-fn lookup. So a match on another marker settles nothing and the annotation NODE
	// decides, the same rule the resolver's scan path applies.
	return comptimeargs.IsCompTimeArgsParamNode(ctx.typeChecker, first, ctx.markerOpts)
}

// resolveDepArg turns one lookup argument into the pure-fn id it names, and
// says whether that argument must be LOWERED to the quoted id when the body is
// stripped. Five ways in, in order:
//
//  1. A string literal at the call site. Nothing to lower.
//  2. A factory-local `const` bound to a string literal: the declaration is inside the body being
//     emitted, so nothing to lower either.
//  3. An identifier declared `const` in a source file of THIS program and initialised by a
//     registrar call (the `import {slugify} from './slug'` case): the id is that declaration's
//     own, by the rule the extractor used on it. It lowers.
//  4. An expression whose TYPE is a string literal, which is how a `.d.ts` carries an id
//     (`declare const x: PureFnId<'…'>`). It lowers.
//  5. An identifier declared in a `.d.ts` WITHOUT a literal type (`declare const x:
//     PureFnId<string>`, what tsc emits when the build injected the id): the package's compiled
//     files say which id that name registers (marker.Options.PureFnBindings). It lowers.
//
// An empty id means none of the five applied; the caller reports PFE9013, or PFE9016 when the
// package ships nothing to serve.
func (ctx *resolveCtx) resolveDepArg(localTable symbolTable, argNode *ast.Node) (id string, lower, cycle bool, cycleFile string) {
	if argNode == nil {
		return "", false, false, ""
	}
	// Fast path: literal at the call site.
	if argNode.Kind == ast.KindStringLiteral || argNode.Kind == ast.KindNoSubstitutionTemplateLiteral {
		return argNode.Text(), false, false, ""
	}
	// A factory-local `const` shadows checker-driven resolution: the inner const is no
	// module-level symbol the checker tracks the same way.
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
	// A `.d.ts`-declared id carries its value in the TYPE, as does a generated constants file.
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

// registrationIDOfBinding returns the id of the registration the `const` an identifier names
// initialises, following an import alias so a binding from another file of this program resolves
// to that file's declaration. False when the identifier names anything else, which keeps an
// ordinary imported string from passing as an id.
//
// The declaring registration is EXTRACTED to answer this, an id being the hash of a body that only
// exists once its dependencies are lowered in. That work is memoised and is the work the emitted
// module needs, so a dependency is rendered once however many dependents reach it.
//
// cycle is true when the declaration is already being resolved further up the stack: its id would
// have to contain itself. cycleFile is that declaration's file, the far end of the cycle and the
// second file the diagnostic names.
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

// unwrapExpression peels the wrappers that carry no runtime meaning, so the expression underneath
// is what gets resolved and lowered: that keeps the replacement span clear of the type-stripping
// ranges, which start exactly where it ends.
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

// resolveDeclLocal walks a factory-local `const` chain to the string literal it ends at.
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
	// Another identifier: resolve through the local table.
	if init.Kind == ast.KindIdentifier {
		if next, found := localTable[init.Text()]; found {
			return resolveDeclLocal(typeChecker, localTable, next, depth-1)
		}
	}
	return nil
}

// buildFactoryLocalTable indexes every `const` declared at any nesting level inside factoryFn's
// body. `let` and `var` are skipped: a mutable binding cannot be reduced to a literal at scan time.
//
// It walks past function boundaries because a `const ID = '…'` in an outer block and a
// `utl.<method>(ID)` call in a nested arrow must resolve to the same value; pure-fn semantics
// guarantee no rebinding, so the top-down walk is correct.
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

// maxTraceDepth bounds resolveDeclLocal's identifier chasing, so a `const a = b; const b = c`
// chain or a self-referential cycle cannot loop forever. Smaller than comptimeargs.DepthCap: the
// factory body's nesting already bounds a factory-local scope.
const maxTraceDepth = 8

// symbolTable maps an identifier name to its declaration node within a single scope; the
// file-level trace is comptimeargs' job.
type symbolTable map[string]*ast.Node
