package convert

// callsites.go converts marker CALL SITES, the counterpart to recognize.go's declarations: a type
// written as a factory call's type argument (`createValidateFn<{id: string}>()`) has no declaration
// for that pass to touch. Every factory's FIRST parameter is a `RunType<T>` (the type-first shape is
// a second overload, see packages/run-types/src/createRTFunctions.ts), so the conversion is a
// rewrite of the call itself, with no name to invent and no collision to resolve, and the structural
// id is identical across the two shapes by construction.
//
// Recognition keys on the MARKER, never on a function name: a call qualifies when its resolved
// signature carries an `InjectRunTypeId<T>` / `InjectTypeFnArgs<T, …>` parameter, the same contract
// resolver/scan.go's analyzeCall runs on, so a user-defined factory declaring the marker is covered
// for free.

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/builders"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// callSite is one marker call the converter can rewrite.
type callSite struct {
	// label names the callee for diagnostics (`createValidateFn`).
	label string
	// node is the reflection projection of the call's T.
	node *reflection.RunType
	// form is the shape the call is CURRENTLY written in.
	form Target
	// start / end delimit the replaced span, from the type-argument list's `<` (type form) or the
	// argument list's `(` (value form) through the call's closing `)`.
	start int
	end   int
	// keepArgs is the surviving arguments' source text, already comma-prefixed, or "" when only the
	// runtype slot was occupied.
	keepArgs string
	// inScope is the names spellable AT THIS CALL: the file's top level plus everything the
	// enclosing blocks declare, unlike a declaration, which only ever sees the top level. Printing a
	// LIVE symbol checks this set, so a call inside a thunk that declares its own class or enum
	// would otherwise refuse as "not in scope here".
	inScope map[string]bool
}

// recognizeCallSites returns every call the target would rewrite, in source order. It walks the
// WHOLE file because marker calls live inside object literals and arrow bodies, which recognizeFile's
// top-level statement loop never reaches.
func recognizeCallSites(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	markerOpts marker.Options,
	set *Set,
	target Target,
) []*callSite {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	source := sourceFile.Text()
	markerOpts = marker.WithDefaults(markerOpts)
	fileScope := inScopeNames(sourceFile)
	var sites []*callSite
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			scope := scopeNamesAt(node, fileScope)
			if site := recognizeCall(source, node, typeChecker, cache, set, target, markerOpts, scope); site != nil {
				site.inScope = scope
				sites = append(sites, site)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
	return sites
}

// scopeNamesAt returns the names spellable at a node: the file's top level plus everything an
// enclosing block declares, which is what makes a thunk-local `class Invoice` visible to the call
// that reflects it.
func scopeNamesAt(node *ast.Node, fileScope map[string]bool) map[string]bool {
	names := make(map[string]bool, len(fileScope))
	for name := range fileScope {
		names[name] = true
	}
	for ancestor := node.Parent; ancestor != nil; ancestor = ancestor.Parent {
		if !ast.IsBlock(ancestor) && !ast.IsCaseClause(ancestor) && !ast.IsModuleBlock(ancestor) {
			continue
		}
		for _, statement := range ancestor.Statements() {
			addDeclaredName(statement, names)
		}
	}
	return names
}

// addDeclaredName records the name a statement binds, when it binds one.
func addDeclaredName(statement *ast.Node, names map[string]bool) {
	if statement == nil {
		return
	}
	record := func(nameNode *ast.Node) {
		if nameNode != nil && ast.IsIdentifier(nameNode) {
			names[nameNode.Text()] = true
		}
	}
	if ast.IsVariableStatement(statement) {
		variableStatement := statement.AsVariableStatement()
		if variableStatement == nil || variableStatement.DeclarationList == nil {
			return
		}
		declarationList := variableStatement.DeclarationList.AsVariableDeclarationList()
		if declarationList == nil {
			return
		}
		for _, declarator := range declarationList.Declarations.Nodes {
			record(declarator.Name())
		}
		return
	}
	switch statement.Kind {
	case ast.KindClassDeclaration, ast.KindEnumDeclaration, ast.KindFunctionDeclaration,
		ast.KindInterfaceDeclaration, ast.KindTypeAliasDeclaration, ast.KindModuleDeclaration:
		record(statement.Name())
	}
}

// recognizeCall classifies one call expression, returning nil when it is not a
// marker call the target would rewrite.
func recognizeCall(
	source string,
	call *ast.Node,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	set *Set,
	target Target,
	markerOpts marker.Options,
	inScope map[string]bool,
) *callSite {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return nil
	}
	if !hasInjectMarker(typeChecker, call, markerOpts) {
		return nil
	}
	// A call that RETURNS a RunType is a builder or the `getRunType<T>()` escape: both carry the
	// marker, and neither is a conversion site, being the value form's own vocabulary printed by the
	// declaration pass. Without this gate the value-form branch rewrites a builder and overlaps the
	// enclosing declaration's own edit.
	if returnType := typeChecker.GetTypeAtLocation(call); returnType != nil &&
		builders.IsRunType(returnType, markerOpts) {
		return nil
	}
	// The rewrite moves T into the FIRST value slot, which only means the same thing when the callee
	// declares a `RunType<T>` there. Every shipped factory does, but a marker-bearing function need
	// not: one with the reflection form ONLY would take the builder as a VALUE and infer T as
	// `RunType<…>`.
	if !hasRunTypeFirstParameter(typeChecker, callExpression, markerOpts) {
		return nil
	}
	arguments := callArguments(callExpression)
	if callExpression.TypeArguments != nil && len(callExpression.TypeArguments.Nodes) == 1 {
		return recognizeTypeFormCall(source, call, callExpression, arguments, typeChecker, cache, set, target, inScope)
	}
	if callExpression.TypeArguments == nil && len(arguments) > 0 {
		return recognizeValueFormCall(source, call, callExpression, arguments, typeChecker, cache, target, markerOpts)
	}
	return nil
}

// recognizeTypeFormCall handles the type-first `fn<T>()`. It converts only to a VALUE target and
// only when the runtype slot is empty; an explicit `undefined` counts as empty, being how the
// type-first overload carries options, and anything else is the REFLECTION form, which survives
// verbatim.
func recognizeTypeFormCall(
	source string,
	call *ast.Node,
	callExpression *ast.CallExpression,
	arguments []*ast.Node,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	set *Set,
	target Target,
	inScope map[string]bool,
) *callSite {
	if target == TargetType {
		return nil
	}
	if len(arguments) > 0 && !isUndefinedKeyword(arguments[0]) {
		return nil
	}
	typeArgumentNode := callExpression.TypeArguments.Nodes[0]
	if typeArgumentNode == nil {
		return nil
	}
	tsType := checker.Checker_getTypeFromTypeNode(typeChecker, typeArgumentNode)
	if tsType == nil {
		return nil
	}
	node := cache.SerializeTopLevel(tsType)
	if node == nil {
		return nil
	}
	// A type argument that NAMES a declaration this run converts is left alone: the declaration pass
	// rewrites it, the reference keeps working through the printed `InferType<typeof …>` alias, and
	// rewriting the call would swap a clean name for the escape.
	if typeArgumentIsSpelledName(typeArgumentNode, node, set, inScope) {
		return nil
	}
	start := typeArgumentListStart(source, callExpression)
	if start < 0 {
		return nil
	}
	return &callSite{
		label:    calleeLabel(source, callExpression),
		node:     node,
		form:     TargetType,
		start:    start,
		end:      call.End(),
		keepArgs: trailingArgumentText(source, arguments, 1),
	}
}

// recognizeValueFormCall handles the value-first `fn(<runtype expr>)`. It converts only to the TYPE
// target and only when the first argument really is a `RunType<T>`, which excludes the reflection
// form's plain value.
func recognizeValueFormCall(
	source string,
	call *ast.Node,
	callExpression *ast.CallExpression,
	arguments []*ast.Node,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	target Target,
	markerOpts marker.Options,
) *callSite {
	if target != TargetType {
		return nil
	}
	// `builders.IsRunType`, not a bare "generic reference" test: the REFLECTION form passes an
	// ordinary value and plenty of those are generic references too, so a loose check rewrites
	// `getRunTypeId(promiseProbe)` to `getRunTypeId<undefined>()` and moves the id.
	runTypeRef := typeChecker.GetTypeAtLocation(arguments[0])
	if runTypeRef == nil || !builders.IsRunType(runTypeRef, markerOpts) {
		return nil
	}
	if runTypeRef.ObjectFlags()&checker.ObjectFlagsReference == 0 {
		return nil
	}
	typeArguments := typeChecker.GetTypeArguments(runTypeRef)
	if len(typeArguments) == 0 || typeArguments[0] == nil {
		return nil
	}
	node := cache.SerializeTopLevel(typeArguments[0])
	if node == nil {
		return nil
	}
	start := argumentListStart(source, callExpression, arguments)
	if start < 0 {
		return nil
	}
	return &callSite{
		label:    calleeLabel(source, callExpression),
		node:     node,
		form:     TargetBuilders, // any non-type form; only `form != target` matters
		start:    start,
		end:      call.End(),
		keepArgs: trailingArgumentText(source, arguments, 1),
	}
}

// printCallSite renders the replacement text for one call site.
func printCallSite(
	site *callSite,
	opts Options,
	names *nameTable,
	fileCtx *fileContext,
	resolve func(id string) *reflection.RunType,
) (*printedDecl, *Diagnostic) {
	ctx := &printContext{names: names, opts: opts, decl: &declaration{Name: site.label}, resolve: resolve,
		set: fileCtx.set, bindings: fileCtx.bindings, inScope: site.inScope,
		currentFile: fileCtx.path, rootID: site.node.ID}
	switch opts.Target {
	case TargetType:
		// A call has no name to close a cycle on, so a recursive type refuses here (selfName stays
		// empty) as it does inside an embedded type expression.
		typeExpr, diag := ctx.typeExpr(site.node)
		if diag != nil {
			return nil, diag
		}
		// The type-first overload takes the value slot FIRST, so surviving options need the
		// `undefined` placeholder back.
		args := ""
		if site.keepArgs != "" {
			args = "undefined" + site.keepArgs
		}
		return &printedDecl{text: "<" + typeExpr + ">(" + args + ")", needs: ctx.needs}, nil

	case TargetBuilders:
		builderExpr, diag := ctx.builderExpr(site.node)
		if diag != nil {
			return nil, diag
		}
		if ctx.usedSelf {
			if tupleDiag := ctx.eagerTupleCycleDiag(site.node, ctx.decl, "RT.circular"); tupleDiag != nil {
				return nil, tupleDiag
			}
			ctx.needs.useRT = true
			builderExpr = ctx.names.RT + ".circular(" + builderExpr + ")"
		}
		return &printedDecl{text: "(" + builderExpr + site.keepArgs + ")", needs: ctx.needs}, nil

	}
	return nil, nil
}

// hasRunTypeFirstParameter reports whether ANY call signature of the callee takes a `RunType<…>` in
// slot 0, the precondition for moving a type argument into the value slot.
func hasRunTypeFirstParameter(typeChecker *checker.Checker, callExpression *ast.CallExpression, markerOpts marker.Options) bool {
	calleeType := typeChecker.GetTypeAtLocation(callExpression.Expression)
	if calleeType == nil {
		return false
	}
	for _, signature := range typeChecker.GetSignaturesOfType(calleeType, checker.SignatureKindCall) {
		parameters := checker.Signature_parameters(signature)
		if len(parameters) == 0 || parameters[0] == nil {
			continue
		}
		parameterType := checker.Checker_getTypeOfSymbol(typeChecker, parameters[0])
		if parameterType != nil && builders.IsRunType(parameterType, markerOpts) {
			return true
		}
	}
	return false
}

// hasInjectMarker reports whether the call's resolved signature carries an injection marker
// parameter, the one contract that makes a call convertible.
func hasInjectMarker(typeChecker *checker.Checker, call *ast.Node, markerOpts marker.Options) bool {
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	for _, parameter := range checker.Signature_parameters(signature) {
		if parameter == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(typeChecker, parameter)
		kind, _, matched := marker.DetectAny(typeChecker, paramType, markerOpts)
		if matched && (kind == marker.KindInjectRunTypeId || kind == marker.KindInjectTypeFnArgs) {
			return true
		}
	}
	return false
}

// typeArgumentIsSpelledName reports whether the call already NAMES its type rather than writing an
// inline shape. Converting one would replace a name with the structure it stands for, and a
// RECURSIVE local type cannot be converted at all, a call having no name for the cycle to close on.
// A name counts either when the run converts that declaration itself (the reference keeps working
// through the printed alias) or when it is simply spellable here. A QUALIFIED reference is
// deliberately not a name: `TF.Email` is a format brand and converts to its builder.
func typeArgumentIsSpelledName(typeArgumentNode *ast.Node, node *reflection.RunType, set *Set, inScope map[string]bool) bool {
	if !ast.IsTypeReferenceNode(typeArgumentNode) || node == nil {
		return false
	}
	typeRef := typeArgumentNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeArguments != nil || typeRef.TypeName == nil || !ast.IsIdentifier(typeRef.TypeName) {
		return false
	}
	if inScope[typeRef.TypeName.Text()] {
		return true
	}
	if set == nil {
		return false
	}
	entry, exists := set.Table[node.ID]
	return exists && entry.TypeName != ""
}

func callArguments(callExpression *ast.CallExpression) []*ast.Node {
	if callExpression.Arguments == nil {
		return nil
	}
	return callExpression.Arguments.Nodes
}

func isUndefinedKeyword(node *ast.Node) bool {
	return node != nil && node.Kind == ast.KindIdentifier && node.Text() == "undefined"
}

// trailingArgumentText returns the source text of the arguments from `from` onward, comma-prefixed
// so it appends after an injected first argument.
func trailingArgumentText(source string, arguments []*ast.Node, from int) string {
	if len(arguments) <= from {
		return ""
	}
	start := tokenStart(source, arguments[from].Pos())
	end := arguments[len(arguments)-1].End()
	if start < 0 || end > len(source) || start >= end {
		return ""
	}
	return ", " + source[start:end]
}

// typeArgumentListStart finds the `<` opening the type-argument list, whose own range covers the
// inner type nodes only.
func typeArgumentListStart(source string, callExpression *ast.CallExpression) int {
	if callExpression.TypeArguments == nil {
		return -1
	}
	return findPrecedingChar(source, callExpression.TypeArguments.Pos(), '<')
}

// argumentListStart finds the `(` opening the argument list.
func argumentListStart(source string, callExpression *ast.CallExpression, arguments []*ast.Node) int {
	if len(arguments) == 0 {
		return -1
	}
	return findPrecedingChar(source, arguments[0].Pos(), '(')
}

// findPrecedingChar scans backward from pos (exclusive) for the nearest want, or -1.
func findPrecedingChar(source string, pos int, want byte) int {
	if pos > len(source) {
		pos = len(source)
	}
	for index := pos - 1; index >= 0; index-- {
		if source[index] == want {
			return index
		}
	}
	return -1
}

// calleeLabel renders the callee's source text for diagnostics.
func calleeLabel(source string, callExpression *ast.CallExpression) string {
	start := tokenStart(source, callExpression.Expression.Pos())
	end := callExpression.Expression.End()
	if start < 0 || end > len(source) || start >= end {
		return "call"
	}
	return source[start:end]
}
