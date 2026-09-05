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
		for paramIndex, arg := range callExpr.Arguments.Nodes {
			mapperCall, ok := scope.resolveMapperRef(arg, 0)
			if !ok {
				continue
			}
			mapping, mappingDiags := scope.readMapping(mapperCall, routeIds, targetIndex, paramIndex)
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
// argument: `inputFrom(...)`, `inputFrom(...).asArg()`, or an identifier bound
// (const / let) to either, through wrappers. False for any other argument (a
// plain value the server never maps).
func (scope *fileScope) resolveMapperRef(node *ast.Node, depth int) (*ast.Node, bool) {
	if depth > comptimeargs.DepthCap {
		return nil, false
	}
	unwrapped := unwrap(node)
	if unwrapped == nil {
		return nil, false
	}
	switch unwrapped.Kind {
	case ast.KindCallExpression:
		callee := unwrap(unwrapped.AsCallExpression().Expression)
		if callee != nil && callee.Kind == ast.KindPropertyAccessExpression {
			access := callee.AsPropertyAccessExpression()
			if name := access.Name(); name != nil && name.Text() == asArgMethod {
				inner := unwrap(access.Expression)
				if inner != nil && inner.Kind == ast.KindCallExpression && scope.isMapperFactoryCall(inner) {
					return inner, true
				}
			}
		}
		if scope.isMapperFactoryCall(unwrapped) {
			return unwrapped, true
		}
		return nil, false
	case ast.KindIdentifier:
		initializer, ok := scope.bindingInitializer(unwrapped)
		if !ok {
			return nil, false
		}
		return scope.resolveMapperRef(initializer, depth+1)
	}
	return nil, false
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
// route at targetIndex. The source (slot 0) resolves through the route
// resolver; the mapper key is the pure-fn registry key: the anonymous lane's
// `rt::<hash>` when the RESOLVED signature is the branded inline overload,
// else `<ServerMapperNamespace>::<name>` from the string literal at slot 1.
func (scope *fileScope) readMapping(mapperCall *ast.Node, routeIds []string, targetIndex, paramIndex int) (Mapping, []diagnostics.Diagnostic) {
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
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchSourceNotInBatch, mapperCall, fromId, toId)}
	}
	return Mapping{FromId: fromId, ToId: toId, ParamIndex: paramIndex, MapperKey: mapperKey}, nil
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
