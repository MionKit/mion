package requestbatch

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// asArgMethod is the method an `inputFrom(...)` reference exposes to pass
// itself as a plain route argument (`inputFrom(user, 'toId').asArg()`).
const asArgMethod = "asArg"

// mapperNameParamIndex is the slot the NAME lane of a mapper factory reads its
// mapper name from: `inputFrom(source, name)`.
const mapperNameParamIndex = 1

// mapperSourceParamIndex is the slot every mapper factory reads its source
// route from: `inputFrom(source, …)`.
const mapperSourceParamIndex = 0

// Mapper rejection reasons, surfaced as BAT004's `{0}` argument.
const (
	reasonMapperAfterSpread = "mapping follows a spread argument, so its parameter position cannot be read"
	reasonMapperReassigned  = "mapping binding is reassigned after its initializer"
)

// resolveMappings reads every `inputFrom()` reference passed as a top-level
// argument of any batched route call. routeCalls[i] is the call behind
// routeIds[i]. Mappings come back sorted by (ToId, ParamIndex).
func (scope *fileScope) resolveMappings(routeIds []string, routeCalls []*ast.Node) ([]Mapping, []diagnostics.Diagnostic) {
	var mappings []Mapping
	var diags []diagnostics.Diagnostic
	for targetIndex, routeCall := range routeCalls {
		callExpr := routeCall.AsCallExpression()
		if callExpr == nil || callExpr.Arguments == nil {
			continue
		}
		spreadSeen := false
		for paramIndex, arg := range callExpr.Arguments.Nodes {
			if arg != nil && arg.Kind == ast.KindSpreadElement {
				spreadSeen = true
				continue
			}
			mapperCall, ok, refReason := scope.resolveMapperRef(arg, 0)
			if refReason != "" {
				diags = append(diags, scope.diag(diagnostics.CodeBatchMapperNotReadable, arg, refReason))
				continue
			}
			if !ok {
				continue
			}
			// A spread before the mapping shifts every later argument by an
			// unknowable amount, so the position the server would feed is unknown.
			if spreadSeen {
				diags = append(diags, scope.diag(diagnostics.CodeBatchMapperNotReadable, arg, reasonMapperAfterSpread))
				continue
			}
			mapping, mappingDiags := scope.readMapping(mapperCall, arg, routeIds, routeCall, targetIndex, paramIndex)
			diags = append(diags, mappingDiags...)
			if len(mappingDiags) == 0 {
				mappings = append(mappings, mapping)
			}
		}
	}
	sortMappings(mappings)
	return mappings, diags
}

// resolveMapperRef finds the branded mapper-factory call behind a route
// argument: `inputFrom(...)`, `<ref>.asArg()` where ref is the factory call
// or an identifier bound to it, or an identifier bound (const / let) to
// either, through wrappers. ok is false for any other argument (a plain value
// the server never maps); a non-empty reason marks a reference that IS a
// mapping but cannot be read (a reassigned `let`), the BAT004 argument.
func (scope *fileScope) resolveMapperRef(node *ast.Node, depth int) (mapperCall *ast.Node, ok bool, reason string) {
	if depth > comptimeargs.DepthCap {
		return nil, false, ""
	}
	unwrapped := unwrap(node)
	if unwrapped == nil {
		return nil, false, ""
	}
	switch unwrapped.Kind {
	case ast.KindCallExpression:
		callee := unwrap(unwrapped.AsCallExpression().Expression)
		if callee != nil && callee.Kind == ast.KindPropertyAccessExpression {
			access := callee.AsPropertyAccessExpression()
			if name := access.Name(); name != nil && name.Text() == asArgMethod {
				return scope.resolveMapperRef(access.Expression, depth+1)
			}
		}
		if scope.isMapperFactoryCall(unwrapped) {
			return unwrapped, true, ""
		}
		return nil, false, ""
	case ast.KindIdentifier:
		initializer, bindReason := scope.bindingInitializer(unwrapped)
		if bindReason == reasonReassigned {
			// Only a binding whose initializer IS a mapping is a mapping the
			// build misread; any other reassigned let is a plain argument.
			if scope.initialMapperRef(unwrapped, depth) {
				return nil, false, reasonMapperReassigned
			}
			return nil, false, ""
		}
		if bindReason != "" {
			return nil, false, ""
		}
		return scope.resolveMapperRef(initializer, depth+1)
	}
	return nil, false, ""
}

// initialMapperRef reports whether the identifier's declared initializer (read
// without the reassignment guard) resolves to a mapper reference.
func (scope *fileScope) initialMapperRef(identifier *ast.Node, depth int) bool {
	symbol := comptimeargs.ResolveImportAlias(scope.typeChecker, scope.typeChecker.GetSymbolAtLocation(identifier))
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if initializer := blockScopedInitializer(declaration); initializer != nil {
			_, ok, reason := scope.resolveMapperRef(initializer, depth+1)
			return ok || reason != ""
		}
	}
	return false
}

// isMapperFactoryCall reports whether call targets a branded mapper factory:
// a function whose OVERLOAD SET carries the anonymous pure-fn brand pair
// (`PureFunction<F>` followed by `InjectPureFnHash<F>`) on at least one
// signature. Checking the overload set, not just the resolved signature, is
// what lets the marker-free NAME overload (`inputFrom(source, 'name')`) count
// as the same factory as the inline one.
func (scope *fileScope) isMapperFactoryCall(call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	if matched, _, _, _ := purefunctions.AnonymousBrandPair(scope.typeChecker, scope.markerOpts, signature); matched {
		return true
	}
	symbol := scope.calleeSymbol(call.AsCallExpression().Expression)
	if symbol == nil {
		if declaration := checker.Signature_declaration(signature); declaration != nil {
			symbol = declaration.Symbol()
		}
	}
	if symbol == nil {
		return false
	}
	calleeType := checker.Checker_getTypeOfSymbol(scope.typeChecker, symbol)
	if calleeType == nil {
		return false
	}
	for _, overload := range checker.Checker_getSignaturesOfType(scope.typeChecker, calleeType, checker.SignatureKindCall) {
		if matched, _, _, _ := purefunctions.AnonymousBrandPair(scope.typeChecker, scope.markerOpts, overload); matched {
			return true
		}
	}
	return false
}

// readMapping reads one branded mapper-factory call into a Mapping for the
// route at targetIndex (behind targetCall). The source (slot 0) resolves
// through the route resolver; the mapper key is the pure-fn registry key: the
// anonymous lane's `rt::<hash>` when the RESOLVED signature is the branded
// inline overload, else `<ServerMapperNamespace>::<name>` from the string
// literal at slot 1. The source must sit before the target (BAT002) and the
// argument position must be one the target route declares (BAT006); both are
// reported at `written`, the argument as it appears in the batched call, since
// that is where the fix goes even when the mapping was bound to a name first.
func (scope *fileScope) readMapping(mapperCall, written *ast.Node, routeIds []string, targetCall *ast.Node, targetIndex, paramIndex int) (Mapping, []diagnostics.Diagnostic) {
	callExpr := mapperCall.AsCallExpression()
	var args []*ast.Node
	if callExpr.Arguments != nil {
		args = callExpr.Arguments.Nodes
	}
	if len(args) <= mapperSourceParamIndex {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMapperNotReadable, mapperCall, "mapper call has no source argument")}
	}
	_, fromId, reason := scope.resolveRouteRef(args[mapperSourceParamIndex], 0)
	if reason != "" {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMapperNotReadable, args[mapperSourceParamIndex], "source is not a route call the build can read: "+reason)}
	}
	mapperKey, keyDiag, keyOk := scope.mapperKey(mapperCall, args)
	if !keyOk {
		return Mapping{}, []diagnostics.Diagnostic{keyDiag}
	}
	toId := routeIds[targetIndex]
	fromIndex := indexOf(routeIds, fromId)
	if fromIndex < 0 || fromIndex >= targetIndex {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchSourceNotInBatch, written, fromId, toId)}
	}
	if count, bounded := scope.parameterCount(targetCall); bounded && paramIndex >= count {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMappingParamOutOfRange, written, strconv.Itoa(paramIndex), strconv.Itoa(count), toId)}
	}
	return Mapping{FromId: fromId, ToId: toId, ParamIndex: paramIndex, MapperKey: mapperKey}, nil
}

// parameterCount is the number of parameters the route call's resolved
// signature declares, the handler's own list: the client proxy types a route
// as `(...params: Parameters<Handler>) => RouteSubRequest`, so the tuple
// behind that rest parameter is expanded (fixed elements, optional ones
// included). bounded is false when the handler itself takes a rest parameter
// (or the signature could not be resolved), where every position is legal.
func (scope *fileScope) parameterCount(routeCall *ast.Node) (count int, bounded bool) {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, routeCall, nil, 0)
	if signature == nil {
		return 0, false
	}
	parameters := signature.Parameters()
	if !signature.HasRestParameter() {
		return len(parameters), true
	}
	fixed := len(parameters) - 1
	restType := scope.typeChecker.GetTypeOfSymbol(parameters[fixed])
	if restType == nil || !restType.IsTupleType() {
		return fixed, false
	}
	tuple := restType.TargetTupleType()
	return fixed + tuple.FixedLength(), checker.TupleType_combinedFlags(tuple)&checker.ElementFlagsVariable == 0
}

// mapperKey derives the registry key of a mapper-factory call's mapper.
func (scope *fileScope) mapperKey(mapperCall *ast.Node, args []*ast.Node) (string, diagnostics.Diagnostic, bool) {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, mapperCall, nil, 0)
	inline, _, fnParamIndex, _ := purefunctions.AnonymousBrandPair(scope.typeChecker, scope.markerOpts, signature)
	if inline {
		if key, ok := purefunctions.AnonymousKeyForCall(scope.typeChecker, scope.markerOpts, scope.sourceFile, mapperCall); ok {
			return key, diagnostics.Diagnostic{}, true
		}
		failing := mapperCall
		if len(args) > fnParamIndex {
			failing = args[fnParamIndex]
		}
		return "", scope.diag(diagnostics.CodeBatchMapperNotReadable, failing, "mapper is not an inline arrow or function expression"), false
	}
	if len(args) <= mapperNameParamIndex {
		return "", scope.diag(diagnostics.CodeBatchMapperNotReadable, mapperCall, "mapper name is missing (argument "+strconv.Itoa(mapperNameParamIndex+1)+")"), false
	}
	literal, result := comptimeargs.ResolveLiteralString(scope.typeChecker, args[mapperNameParamIndex])
	if !result.Ok {
		return "", scope.diag(diagnostics.CodeBatchMapperNotReadable, args[mapperNameParamIndex], "mapper name is not a string literal or a const bound to one"), false
	}
	return constants.ServerMapperNamespace + "::" + literal.Text(), diagnostics.Diagnostic{}, true
}

func indexOf(values []string, want string) int {
	for i, value := range values {
		if value == want {
			return i
		}
	}
	return -1
}

// sortMappings puts mappings in their canonical (ToId, ParamIndex, FromId)
// order so two sites with the same links compare equal field by field.
func sortMappings(mappings []Mapping) {
	sort.SliceStable(mappings, func(i, j int) bool {
		a, b := mappings[i], mappings[j]
		if a.ToId != b.ToId {
			return a.ToId < b.ToId
		}
		if a.ParamIndex != b.ParamIndex {
			return a.ParamIndex < b.ParamIndex
		}
		return a.FromId < b.FromId
	})
}
