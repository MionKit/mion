package diagnostics

// mion route codes (rpc-handler-*) over route, query, mutation, middleware and headersMiddleware handlers, resolved by the checker.
// Emitted only when a caller opts in (Request.CheckRouterRules), so a build never fails on one: off in eslint must mean off.
// rpc-handler-missing-return-type to rpc-handler-returns-non-rpc-error are LevelRuntimeError despite being lint-only: the build emits, but mion compiles the DECLARED types,
// so the route is broken at runtime. rpc-handler-non-data-property is a warning: a dropped member still leaves a working type.
const (
	// CodeRouteMissingReturnType: a handler with no written return type. The build compiles the
	// DECLARED type, so an inferred one leaves nothing to validate or serialize against. Args: [0]
	// the helper it was declared through, or the handler type it was annotated with.
	CodeRouteMissingReturnType = "rpc-handler-missing-return-type"
	// CodeRouteMissingParamType: a handler parameter with no written type. The call context
	// parameters are exempt, every parameter after them travels on the wire. Args: [0] the parameter
	// name, [1] the helper or handler type it was declared through.
	CodeRouteMissingParamType = "rpc-handler-missing-param-type"
	// CodeRouteThrowInHandler: a `throw` that escapes a handler leaves its signature, so it lands in
	// the undeclared `@thrownErrors` slot and the client only sees its public message. A throw caught
	// inside the same handler is not reported. Args: [0] the helper or handler type.
	CodeRouteThrowInHandler = "rpc-handler-throws"
	// CodeRouteReturnedErrorType: a declared return arm derives from `Error` but not from
	// `RpcError`, so it carries no mion brand and the dispatcher reroutes it to `@thrownErrors`
	// instead of its typed slot. Args: [0] the arm's type name, [1] the helper or handler type.
	CodeRouteReturnedErrorType = "rpc-handler-returns-non-rpc-error"
	// CodeRouteUnsafePropertyName: a declared property named `__proto__` is never data, since writing
	// it on a plain object swaps the prototype, so every compiled function drops the member (data-proto-property-dropped).
	// Reports the DECLARATION, so it fires for types no route reaches yet. Args: [0] the property
	// name.
	CodeRouteUnsafePropertyName = "rpc-handler-non-data-property"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeRouteMissingReturnType, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handler has no return type annotation"},
		{Code: CodeRouteMissingParamType, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handler parameter has no type annotation"},
		{Code: CodeRouteThrowInHandler, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handlers return errors, they never throw them"},
		{Code: CodeRouteReturnedErrorType, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handler answers with an error that is not an `RpcError`"},
		{Code: CodeRouteUnsafePropertyName, Family: FamilyMionRoute, Level: LevelWarning, Scope: ScopeGraph, Title: "Property named `__proto__` can never be data and is dropped"},
	} {
		register(definition)
	}
}
