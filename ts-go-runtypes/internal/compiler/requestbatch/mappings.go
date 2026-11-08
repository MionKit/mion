package requestbatch

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// asArgMethod passes an `inputFrom(...)` reference as a plain route argument.
const asArgMethod = "asArg"

// mapperSourceParamIndex is the slot every mapper factory reads its source route from.
const mapperSourceParamIndex = 0

// Mapper rejection reasons, surfaced as rpc-batch-mapper-unreadable's `{0}` argument.
const (
	reasonMapperAfterSpread = "mapping follows a spread argument, so its parameter position cannot be read"
	reasonMapperReassigned  = "mapping binding is reassigned after its initializer"
	// The build reads mappings only off a route call it can see; anywhere else they would be dropped.
	reasonMapperOutsideRouteCall = "mapping is not an argument of a route call written inline or bound to a variable (a helper's argument, a ternary arm)"
	reasonMappedRouteReassigned  = "the variable holding this route call is reassigned, so the mappings that run cannot be read"
	reasonMapperTargetUnion      = "the route this mapping feeds may be more than one route"
	reasonMapperSourceUnion      = "source may be more than one route"
)

// pendingMapping is one `inputFrom()` link read off batch item `target`, before a combination places its source.
type pendingMapping struct {
	mapping Mapping
	target  int
	written *ast.Node
}

// resolveMappings reads every `inputFrom()` reference passed as a top-level argument of a batched route call.
func (scope *fileScope) resolveMappings(items []batchItem) ([]pendingMapping, []diagnostics.Diagnostic) {
	var pending []pendingMapping
	var diags []diagnostics.Diagnostic
	for targetIndex, item := range items {
		routeCall, reason := scope.mappingCall(item.node)
		if reason != "" {
			diags = append(diags, scope.diag(diagnostics.CodeBatchMapperNotReadable, item.node, reason))
			continue
		}
		if routeCall == nil {
			continue
		}
		callExpr := routeCall.AsCallExpression()
		if callExpr.Arguments == nil {
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
			// A spread before the mapping shifts every later argument, so the position the server feeds is unknown.
			if spreadSeen {
				diags = append(diags, scope.diag(diagnostics.CodeBatchMapperNotReadable, arg, reasonMapperAfterSpread))
				continue
			}
			if len(item.ids) != 1 {
				diags = append(diags, scope.diag(diagnostics.CodeBatchMapperNotReadable, arg, reasonMapperTargetUnion))
				continue
			}
			mapping, mappingDiags := scope.readMapping(mapperCall, arg, routeCall, item.ids[0], paramIndex)
			diags = append(diags, mappingDiags...)
			if len(mappingDiags) == 0 {
				pending = append(pending, pendingMapping{mapping: mapping, target: targetIndex, written: arg})
			}
		}
	}
	return pending, diags
}

// placeMappings checks one combination's mappings: a source must run before the route it feeds
// (rpc-batch-source-not-before, reported at the argument written in the batched call, where the fix goes).
func (scope *fileScope) placeMappings(pending []pendingMapping, routeIds []string) ([]Mapping, []diagnostics.Diagnostic) {
	var mappings []Mapping
	var diags []diagnostics.Diagnostic
	for _, link := range pending {
		fromIndex := indexOf(routeIds, link.mapping.FromId)
		if fromIndex < 0 || fromIndex >= link.target {
			diags = append(diags, scope.diag(diagnostics.CodeBatchSourceNotInBatch, link.written, link.mapping.FromId, link.mapping.ToId))
			continue
		}
		mappings = append(mappings, link.mapping)
	}
	sortMappings(mappings)
	return mappings, diags
}

// resolveMapperRef finds the branded mapper-factory call behind a route argument, through `.asArg()`,
// bindings and wrappers. ok is false for a plain value the server never maps; a non-empty reason marks a
// reference that IS a mapping but cannot be read, the rpc-batch-mapper-unreadable argument.
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
			// Only a binding whose initializer IS a mapping was misread; any other reassigned let is a plain argument.
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

// initialMapperRef resolves the identifier's declared initializer without the reassignment guard.
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

// isMapperFactoryCall reports whether call targets a branded mapper factory, the pure-fn brand pair on at
// least one signature of its OVERLOAD SET, so a wrapper declaring several shapes is recognised on any.
func (scope *fileScope) isMapperFactoryCall(call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	if matched, _, _, _ := purefunctions.PureFnBrandPair(scope.typeChecker, scope.markerOpts, signature); matched {
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
		if matched, _, _, _ := purefunctions.PureFnBrandPair(scope.typeChecker, scope.markerOpts, overload); matched {
			return true
		}
	}
	return false
}

// readMapping reads one branded mapper-factory call into a Mapping for route toId. The argument position must be
// one the target route declares (rpc-batch-argument-out-of-range), reported at `written`, the argument in the batched call.
func (scope *fileScope) readMapping(mapperCall, written, targetCall *ast.Node, toId string, paramIndex int) (Mapping, []diagnostics.Diagnostic) {
	callExpr := mapperCall.AsCallExpression()
	var args []*ast.Node
	if callExpr.Arguments != nil {
		args = callExpr.Arguments.Nodes
	}
	if len(args) <= mapperSourceParamIndex {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMapperNotReadable, mapperCall, "mapper call has no source argument")}
	}
	source := args[mapperSourceParamIndex]
	fromIds, reason := scope.itemRouteIds(source)
	if reason != "" {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMapperNotReadable, source, "source is not a route call the build can read: "+reason)}
	}
	if len(fromIds) != 1 {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMapperNotReadable, source, reasonMapperSourceUnion)}
	}
	mapperKey, keyDiag, keyOk := scope.mapperKey(mapperCall, args)
	if !keyOk {
		return Mapping{}, []diagnostics.Diagnostic{keyDiag}
	}
	if count, bounded := scope.parameterCount(targetCall); bounded && paramIndex >= count {
		return Mapping{}, []diagnostics.Diagnostic{scope.diag(diagnostics.CodeBatchMappingParamOutOfRange, written, strconv.Itoa(paramIndex), toId, strconv.Itoa(count))}
	}
	return Mapping{FromId: fromIds[0], ToId: toId, ParamIndex: paramIndex, MapperKey: mapperKey}, nil
}

// parameterCount is the handler's own parameter list: the client proxy types a route as
// `(...params: Parameters<Handler>) => RouteSubRequest`, so the tuple behind that rest parameter is
// expanded. bounded is false when the handler itself takes a rest parameter, where every position is legal.
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

// mapperKey is the id the build injects at that very call, so the batch plan and the registration cannot disagree.
func (scope *fileScope) mapperKey(mapperCall *ast.Node, args []*ast.Node) (string, diagnostics.Diagnostic, bool) {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, mapperCall, nil, 0)
	_, _, fnParamIndex, _ := purefunctions.PureFnBrandPair(scope.typeChecker, scope.markerOpts, signature)
	if id, ok := purefunctions.PureFnIDForCall(scope.typeChecker, scope.markerOpts, scope.sourceFile, mapperCall, scope.pureFns); ok {
		return id, diagnostics.Diagnostic{}, true
	}
	failing := mapperCall
	if fnParamIndex >= 0 && len(args) > fnParamIndex {
		failing = args[fnParamIndex]
	}
	return "", scope.diag(diagnostics.CodeBatchMapperNotReadable, failing, "mapper is not an inline arrow or function expression"), false
}

func indexOf(values []string, want string) int {
	for i, value := range values {
		if value == want {
			return i
		}
	}
	return -1
}

// sortMappings is the canonical order in which two sites with the same links compare equal field by field.
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
