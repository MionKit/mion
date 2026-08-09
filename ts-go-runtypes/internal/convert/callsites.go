package convert

// callsites.go — converting marker CALL SITES, the counterpart to recognize.go's
// declarations.
//
// A declaration is not the only place a type is written. The dominant authoring
// shape is the type argument of a factory call:
//
//	createValidateFn<{id: string; age?: number}>()
//
// which the declaration pass cannot touch, because there is no declaration.
// Every factory's FIRST parameter is a `RunType<T>` (the type-first shape is a
// second overload — see createRTFunctions.d.ts and the note on index.ts's
// re-export block), so the value-first spelling of that same call is:
//
//	createValidateFn(RT.object({id: TF.string(), age: RT.optional(TF.number())}))
//	createValidateFn(runTypeFromJsonSchema({type: 'object', …} as const))
//
// and the conversion is a rewrite of the call itself — no name to invent, no
// statement to place, no collision to resolve. The structural id is identical
// across the two shapes by construction, which is the whole point of the
// value-first surface and the oracle every test here asserts.
//
// Recognition keys on the MARKER, never on a function name: a call qualifies
// when its resolved signature carries an `InjectRunTypeId<T>` /
// `InjectTypeFnArgs<T, …>` parameter, exactly the contract resolver/scan.go's
// analyzeCall runs on ("the marker IS the contract, not the function name or
// position"). A user-defined factory that declares the marker is covered for
// free.

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/builders"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// callSite is one marker call the converter can rewrite: the span it replaces,
// the reflection node its type resolves to, the form it is written in now, and
// the argument text that survives the rewrite.
type callSite struct {
	// label names the callee for diagnostics (`createValidateFn`).
	label string
	// node is the reflection projection of the call's T.
	node *reflection.RunType
	// form is the shape the call is CURRENTLY written in.
	form Target
	// start / end delimit the replaced span: everything from the type-argument
	// list's `<` (type form) or the argument list's `(` (value form) through
	// the call's closing `)`.
	start int
	end   int
	// keepArgs is the source text of the arguments that survive, already
	// comma-prefixed (`, {strict: true}`), or "" when only the runtype slot
	// was occupied.
	keepArgs string
}

// recognizeCallSites walks the WHOLE file — marker calls live inside object
// literals and arrow bodies (`validate: () => createValidateFn<any>()`), which
// recognizeFile's top-level statement loop never reaches — and returns every
// call the requested target would rewrite, in source order.
func recognizeCallSites(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	fs vfspkg.FS,
	set *Set,
	target Target,
) []*callSite {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	source := sourceFile.Text()
	markerOpts := marker.WithDefaults(marker.Options{FS: fs})
	var sites []*callSite
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			if site := recognizeCall(source, node, typeChecker, cache, set, target, markerOpts); site != nil {
				sites = append(sites, site)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
	return sites
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
) *callSite {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return nil
	}
	if !hasInjectMarker(typeChecker, call, markerOpts) {
		return nil
	}
	// A call that RETURNS a RunType is a BUILDER (`RT.optional(TF.string())`),
	// the `getRunType<T>()` escape, or the schema door — all of them carry the
	// injection marker too, and none of them is a conversion site: they are the
	// value form's own vocabulary, printed by the declaration pass. Without this
	// gate the value-form branch below matched every builder taking a RunType
	// argument and rewrote it into `RT.optional<string>()`, overlapping the
	// enclosing declaration's own edit.
	if returnType := typeChecker.GetTypeAtLocation(call); returnType != nil &&
		builders.IsRunType(returnType, marker.DefaultModule, markerOpts.FS) {
		return nil
	}
	arguments := callArguments(callExpression)
	if callExpression.TypeArguments != nil && len(callExpression.TypeArguments.Nodes) == 1 {
		return recognizeTypeFormCall(source, call, callExpression, arguments, typeChecker, cache, set, target)
	}
	if callExpression.TypeArguments == nil && len(arguments) > 0 {
		return recognizeValueFormCall(source, call, callExpression, arguments, typeChecker, cache, target)
	}
	return nil
}

// recognizeTypeFormCall handles `fn<T>()` — the type-first shape. It converts
// only to a VALUE target, and only when the runtype slot is genuinely empty:
// an explicit `undefined` placeholder counts as empty (it is how the type-first
// overload carries options), anything else is the REFLECTION form
// (`createValidateFn(sample)`), which must survive verbatim.
func recognizeTypeFormCall(
	source string,
	call *ast.Node,
	callExpression *ast.CallExpression,
	arguments []*ast.Node,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	set *Set,
	target Target,
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
	// A type argument that NAMES a declaration this run converts is left alone:
	// the declaration pass rewrites it, the reference keeps working through the
	// printed `InferType<typeof …>` alias, and rewriting the call would only
	// swap a clean name for the escape.
	if namesConvertedDecl(typeArgumentNode, node, set) {
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

// recognizeValueFormCall handles `fn(<runtype expr>)` — the value-first shape.
// It converts only to the TYPE target, and only when the first argument really
// is a `RunType<T>` (the reflection form passes a plain value, whose type is
// not a RunType reference, so it is excluded by the same check).
func recognizeValueFormCall(
	source string,
	call *ast.Node,
	callExpression *ast.CallExpression,
	arguments []*ast.Node,
	typeChecker *checker.Checker,
	cache *runtype.Cache,
	target Target,
) *callSite {
	if target != TargetType {
		return nil
	}
	runTypeRef := typeChecker.GetTypeAtLocation(arguments[0])
	if runTypeRef == nil || runTypeRef.ObjectFlags()&checker.ObjectFlagsReference == 0 {
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
		set: fileCtx.set, bindings: fileCtx.bindings, inScope: fileCtx.inScope,
		currentFile: fileCtx.path, rootID: site.node.ID}
	switch opts.Target {
	case TargetType:
		// No name exists to close a cycle on, so a recursive type refuses here
		// (selfName stays empty) exactly as it does inside an embedded type
		// expression.
		typeExpr, diag := ctx.typeExpr(site.node)
		if diag != nil {
			return nil, diag
		}
		// The type-first overload takes the value slot FIRST, so surviving
		// options need the `undefined` placeholder back.
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
			if payload := ctx.circularLossyPayload(site.node); payload != "" {
				return nil, &Diagnostic{Code: CodeUnsupportedKind, Severity: SeverityError, Decl: site.label,
					Message: payload + " inside a recursive type is not convertible to builders (RT.circular cannot carry it through the self-substitution)"}
			}
			if tupleDiag := ctx.eagerTupleCycleDiag(site.node, ctx.decl, "RT.circular"); tupleDiag != nil {
				return nil, tupleDiag
			}
			ctx.needs.useRT = true
			builderExpr = ctx.names.RT + ".circular(" + builderExpr + ")"
		}
		return &printedDecl{text: "(" + builderExpr + site.keepArgs + ")", needs: ctx.needs}, nil

	case TargetJSONSchema:
		schemaExpr, diag := ctx.schemaExpr(site.node)
		if diag != nil {
			return nil, diag
		}
		if refDiag := ctx.eagerTupleCycleDiag(site.node, ctx.decl, "a {$ref: '#'} back-reference"); refDiag != nil {
			return nil, refDiag
		}
		if strings.HasPrefix(schemaExpr, "{") {
			schemaExpr += " as const"
		}
		ctx.needs.useRunTypeFromJSONSchema = true
		return &printedDecl{text: "(" + names.RunTypeFromJSONSchema + "(" + schemaExpr + ")" + site.keepArgs + ")", needs: ctx.needs}, nil
	}
	return nil, nil
}

// hasInjectMarker reports whether the call's resolved signature carries an
// injection marker parameter — the one contract that makes a call convertible.
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

// namesConvertedDecl reports whether the written type argument is a bare
// reference to a declaration this run already converts.
func namesConvertedDecl(typeArgumentNode *ast.Node, node *reflection.RunType, set *Set) bool {
	if !ast.IsTypeReferenceNode(typeArgumentNode) || set == nil || node == nil {
		return false
	}
	if typeRef := typeArgumentNode.AsTypeReferenceNode(); typeRef == nil || typeRef.TypeArguments != nil {
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

// trailingArgumentText returns the source text of the arguments from `from`
// onward, comma-prefixed so it appends directly after an injected first
// argument. Empty when there are none.
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

// typeArgumentListStart finds the `<` opening the type-argument list; the list's
// own range covers the inner type nodes only.
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

// findPrecedingChar scans backward from pos (exclusive) for the nearest want,
// returning its index or -1.
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
