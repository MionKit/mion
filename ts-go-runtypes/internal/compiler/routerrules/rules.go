package routerrules

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RpcErrorName is the class every declared handler error must derive from: it
// is what carries the mion brand the dispatcher routes on. TypedError is its
// base and carries the brand at run time, but it has no publicMessage, no
// errorData and no status code, so it is not an answer a client can use.
const RpcErrorName = "RpcError"

// errorBaseName is the global class an arm has to derive from before the rule
// has anything to say about it: a plain string or object union member is not
// an error and is left alone.
const errorBaseName = "Error"

// checkAnnotations is `strong-typed-routes`: mion compiles the handler's
// DECLARED types, so an inferred return type or an unannotated parameter leaves
// the build nothing to compile against. This reads the AST, never the checker's
// inference — what matters is whether the annotation was WRITTEN.
func (scope *fileScope) checkAnnotations(discovered handler) []diagnostics.Diagnostic {
	fnLike := discovered.fn.FunctionLikeData()
	if fnLike == nil {
		return nil
	}
	var found []diagnostics.Diagnostic
	if fnLike.Type == nil {
		found = append(found, scope.diag(diagnostics.CodeRouteMissingReturnType, discovered.at(returnTypeSite(discovered.fn)), discovered.label))
	}
	if fnLike.Parameters == nil {
		return found
	}
	for index, paramNode := range fnLike.Parameters.Nodes {
		if index < discovered.ctxParams {
			continue // the call context never crosses the wire
		}
		if ast.GetTypeAnnotationNode(paramNode) != nil {
			continue
		}
		found = append(found, scope.diag(diagnostics.CodeRouteMissingParamType, discovered.at(paramNode), parameterName(paramNode), discovered.label))
	}
	return found
}

// returnTypeSite is where a missing return type is reported: the parameter list
// closes right before where the annotation belongs, so pointing at the last
// parameter (or the function itself) puts the squiggle next to the gap.
func returnTypeSite(fn *ast.Node) *ast.Node {
	fnLike := fn.FunctionLikeData()
	if fnLike != nil && fnLike.Parameters != nil && len(fnLike.Parameters.Nodes) > 0 {
		return fnLike.Parameters.Nodes[len(fnLike.Parameters.Nodes)-1]
	}
	return fn
}

func parameterName(paramNode *ast.Node) string {
	if name := paramNode.Name(); name != nil {
		if text := name.Text(); text != "" {
			return text
		}
	}
	return "<destructured>"
}

// checkThrows is `no-throw-in-handlers`: a thrown error leaves the handler's
// signature, so it lands in the undeclared `@thrownErrors` slot and the client
// only ever sees its public message. A returned one stays in the signature and
// reaches the client typed.
//
// The walk mirrors purity.go: it descends into nested callbacks (a throw inside
// a `.map()` still escapes the handler) but stops at a `try` block that has a
// `catch`, because such a throw never reaches the router. What is thrown is
// never classified — a class extending Error, a bare string and a rethrown
// `unknown` are the same mistake.
func (scope *fileScope) checkThrows(discovered handler) []diagnostics.Diagnostic {
	body := discovered.fn.Body()
	if body == nil {
		return nil
	}
	var found []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindThrowStatement:
			found = append(found, scope.diag(diagnostics.CodeRouteThrowInHandler, discovered.at(node), discovered.label))
			return false
		case ast.KindTryStatement:
			// A caught throw never leaves the handler, so only the catch and
			// finally clauses are walked when the try has a handler.
			tryStatement := node.AsTryStatement()
			if tryStatement.CatchClause != nil {
				tryStatement.CatchClause.ForEachChild(visit)
				if tryStatement.FinallyBlock != nil {
					tryStatement.FinallyBlock.ForEachChild(visit)
				}
				return false
			}
		case ast.KindClassDeclaration, ast.KindClassExpression:
			// A class declared inside the handler has its own methods; a throw
			// in one of them escapes that method, not this handler.
			return false
		}
		node.ForEachChild(visit)
		return false
	}
	body.ForEachChild(visit)
	return found
}

// checkReturnedErrorType is `returned-error-type`: the dispatcher routes a
// returned error by its mion brand. An RpcError, or any subclass such as
// FatalError, lands in its own typed slot. Any other error carries no usable
// brand, so the request is failed and the error is dropped in the undeclared
// `@thrownErrors` slot instead — the declared return type stops being true.
//
// Only a WRITTEN return type is read: without one, MRT001 already fires and an
// inferred type would report the same handler twice.
func (scope *fileScope) checkReturnedErrorType(discovered handler) []diagnostics.Diagnostic {
	fnLike := discovered.fn.FunctionLikeData()
	if fnLike == nil || fnLike.Type == nil {
		return nil
	}
	returnType := checker.Checker_getTypeFromTypeNode(scope.typeChecker, fnLike.Type)
	if returnType == nil {
		return nil
	}
	// A handler may answer asynchronously; the awaited type is the answer.
	if awaited := checker.Checker_getAwaitedType(scope.typeChecker, returnType); awaited != nil {
		returnType = awaited
	}
	var found []diagnostics.Diagnostic
	reported := map[string]bool{}
	for _, arm := range unionArms(returnType) {
		symbol := checker.Type_symbol(arm)
		if symbol == nil || !scope.derivesFromError(arm) || scope.derivesFromRpcError(arm) {
			continue
		}
		if reported[symbol.Name] {
			continue
		}
		reported[symbol.Name] = true
		found = append(found, scope.diag(diagnostics.CodeRouteReturnedErrorType, discovered.at(fnLike.Type), symbol.Name, discovered.label))
	}
	return found
}

// unionArms flattens a union into its members; a non-union is its own only arm.
func unionArms(tsType *checker.Type) []*checker.Type {
	if checker.Type_flags(tsType)&checker.TypeFlagsUnion == 0 {
		return []*checker.Type{tsType}
	}
	return tsType.Types()
}

// derivesFromError walks the base-class chain looking for the global Error.
func (scope *fileScope) derivesFromError(arm *checker.Type) bool {
	return scope.derivesFrom(arm, func(symbol *ast.Symbol) bool { return symbol.Name == errorBaseName })
}

// derivesFromRpcError walks the same chain for RpcError declared by
// `@mionjs/core`, so a user class of the same name from elsewhere never passes.
func (scope *fileScope) derivesFromRpcError(arm *checker.Type) bool {
	return scope.derivesFrom(arm, func(symbol *ast.Symbol) bool {
		return symbol.Name == RpcErrorName && marker.DeclaredInModule(symbol, CoreModule, scope.markerOpts.FS)
	})
}

// derivesFrom is the shared base-class walk, over SYMBOLS rather than types:
// the arm's own class counts, then every base class in turn. The DECLARED type
// of each symbol is what carries the base list, so a generic class reached as
// `RpcError<'not-found'>` walks the same chain as a plain one — asking a type
// reference for its base types answers nothing. Depth is bounded so a malformed
// graph cannot spin.
func (scope *fileScope) derivesFrom(arm *checker.Type, match func(*ast.Symbol) bool) bool {
	seen := map[*ast.Symbol]bool{}
	var walk func(symbol *ast.Symbol, depth int) bool
	walk = func(symbol *ast.Symbol, depth int) bool {
		if symbol == nil || depth > 16 || seen[symbol] {
			return false
		}
		seen[symbol] = true
		if match(symbol) {
			return true
		}
		declared := checker.Checker_getDeclaredTypeOfSymbol(scope.typeChecker, symbol)
		if declared == nil {
			return false
		}
		for _, base := range checker.Checker_getBaseTypes(scope.typeChecker, declared) {
			if walk(checker.Type_symbol(base), depth+1) {
				return true
			}
		}
		return false
	}
	return walk(checker.Type_symbol(arm), 0)
}

// checkUnsafePropertyNames is `no-unsafe-property-names`: a property named after
// a prototype slot can never be data. Writing `__proto__` on a plain object
// swaps its prototype instead of adding a key, and a missing `constructor` or
// `prototype` is found on the prototype chain, so a wire that could carry one is
// a prototype-pollution vector.
//
// UPN001 already fails the build for such a type, but only while RENDERING a
// type function, so only for a type a marker actually reaches. This reports the
// DECLARATION, in any interface, type literal or class of the file, so the
// problem shows up as it is written and for types no route reaches yet.
func (scope *fileScope) checkUnsafePropertyNames() []diagnostics.Diagnostic {
	var found []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindPropertySignature, ast.KindMethodSignature,
			ast.KindPropertyDeclaration, ast.KindMethodDeclaration:
			// A class constructor is a real constructor, not a property named
			// after one, so it is left alone.
			if node.Kind == ast.KindMethodDeclaration && node.Name() != nil && node.Name().Kind == ast.KindIdentifier &&
				node.Name().Text() == "constructor" && node.Parent != nil && ast.IsClassLike(node.Parent) {
				break
			}
			if name := declaredMemberName(node); reflection.IsUnsafePropertyName(name) {
				found = append(found, scope.diag(diagnostics.CodeRouteUnsafePropertyName, node, name))
			}
		}
		node.ForEachChild(visit)
		return false
	}
	scope.sourceFile.AsNode().ForEachChild(visit)
	return found
}

// declaredMemberName is the WRITTEN name of a member: an identifier, a string
// literal key, or empty for a computed one (which no static rule can read).
func declaredMemberName(node *ast.Node) string {
	name := node.Name()
	if name == nil {
		return ""
	}
	switch name.Kind {
	case ast.KindIdentifier, ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return name.Text()
	}
	return ""
}

// paramsDefaultStrategy is the wire a route gets when neither it nor its router
// names one. Mirrors DefaultEncoder in @mionjs/core.
const paramsDefaultStrategy = "clone"

// compactStrategy is the one wire that carries no key names.
const compactStrategy = "compact"

// checkUnreachableStrictTypes is `strict-types-wire`: a route asking for `strictTypes`
// on a params wire that carries no key names. It reads the CALL's return type,
// which carries both levels the type side resolves from — `options` is the
// route's own literal (RO) and `routerOptions` the factory's (O) — so an alias,
// a namespace import and a router declared in another module all answer.
//
// Only the route's own `strictTypes` is reported: a router-wide one is a default
// for the routes that can use it, and turning it on for fifty routes is not a
// claim about the one compact route among them.
func (scope *fileScope) checkUnreachableStrictTypes(discovered handler) []diagnostics.Diagnostic {
	if discovered.call == nil {
		return nil
	}
	definition := scope.callReturnType(discovered.call)
	if definition == nil {
		return nil
	}
	routeOptions := scope.propertyType(definition, "options")
	if !booleanLiteralIsTrue(scope.typeChecker, scope.propertyType(routeOptions, "strictTypes")) {
		return nil
	}
	strategy := scope.paramsStrategy(routeOptions, scope.propertyType(definition, "routerOptions"))
	if strategy != compactStrategy {
		return nil
	}
	return []diagnostics.Diagnostic{scope.diag(diagnostics.CodeRouteStrictTypesMoot, discovered.at(strictTypesSite(discovered.call)), strategy, discovered.label)}
}

// callReturnType is the RouteDef / MiddleFnDef / HeadersMiddleFnDef the helper
// call answers with — the one place the route's own options literal and the
// router's meet.
func (scope *fileScope) callReturnType(call *ast.Node) *checker.Type {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return nil
	}
	return checker.Checker_getReturnTypeOfSignature(scope.typeChecker, signature)
}

// paramsStrategy resolves the params wire the same three steps the type side
// takes (ResolveStrategy in @mionjs/router): the route literal, then the router
// literal, then the built-in default. A widened `encoder` never reaches here —
// EncoderLiteralGuard makes it a type error at the call site.
func (scope *fileScope) paramsStrategy(routeOptions, routerOptions *checker.Type) string {
	for _, options := range []*checker.Type{routeOptions, routerOptions} {
		if strategy := scope.encoderParams(options); strategy != "" {
			return strategy
		}
	}
	return paramsDefaultStrategy
}

// encoderParams reads one options type's params wire: `encoder` is a bare string
// setting both directions, or an object naming each. Empty when the options name
// no encoder, which is what sends the lookup to the next level.
func (scope *fileScope) encoderParams(options *checker.Type) string {
	if options == nil {
		return ""
	}
	encoder := scope.propertyType(options, "encoder")
	if encoder == nil {
		return ""
	}
	if literal := stringLiteralValue(scope.typeChecker, encoder); literal != "" {
		return literal
	}
	return stringLiteralValue(scope.typeChecker, scope.propertyType(encoder, "params"))
}

// propertyType reads one property off a type with its optionality removed: every
// option on the chain is declared optional, so the lookup answers `T | undefined`
// and the literal underneath is what the rule reads.
func (scope *fileScope) propertyType(parent *checker.Type, name string) *checker.Type {
	if parent == nil {
		return nil
	}
	property := scope.typeChecker.GetTypeOfPropertyOfType(parent, name)
	if property == nil {
		return nil
	}
	return scope.typeChecker.GetNonNullableType(property)
}

// strictTypesSite is where the finding is reported: the options argument, which
// is what the user would edit. `opts` sits at index 1 of every helper signature,
// immediately before the injection markers.
func strictTypesSite(call *ast.Node) *ast.Node {
	if callExpr := call.AsCallExpression(); callExpr != nil && len(callExpr.Arguments.Nodes) > 1 {
		return callExpr.Arguments.Nodes[1]
	}
	return call
}

func booleanLiteralIsTrue(typeChecker *checker.Checker, candidate *checker.Type) bool {
	if candidate == nil || checker.Type_flags(candidate)&checker.TypeFlagsBooleanLiteral == 0 {
		return false
	}
	return typeChecker.TypeToString(candidate) == "true"
}

// stringLiteralValue is the literal's text without its quotes, empty for
// anything that is not a single string literal.
func stringLiteralValue(typeChecker *checker.Checker, candidate *checker.Type) string {
	if candidate == nil || checker.Type_flags(candidate)&checker.TypeFlagsStringLiteral == 0 {
		return ""
	}
	return strings.Trim(typeChecker.TypeToString(candidate), `"`)
}
