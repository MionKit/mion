package diagnostics

// mion route codes (MRTxxx), from the route-rule pass over a route, query, mutation, middleware or
// headersFn handler. Unlike the hand-written ESLint rules they replace, the checker resolves the
// call, so an alias, a namespace import, a local barrel, a named handler reference, a
// `Handler`-typed const and a `@mion:route` JSDoc tag all reach the same rules.
//
// Emitted only when a caller opts in (Request.CheckRouterRules), so `mion compile` and the bundler
// plugins never fail a build on one: a rule turned off in an eslint config must mean off.
//
// MRT001-MRT004 are LevelRuntimeError despite being lint-only: the build emits, and each describes a
// route that is BROKEN once it runs, since mion compiles the DECLARED types. A missing annotation
// leaves nothing validating the input or serializing the response (MRT001 / MRT002), and a throw or
// a non-RpcError arm makes the declared return type untrue (MRT003 / MRT004). MRT005 is a warning:
// a dropped member still leaves a working type.
const (
	// CodeRouteMissingReturnType: a handler with no written return type. The build compiles the
	// DECLARED type, so an inferred one leaves nothing to validate or serialize against. Args: [0]
	// the helper it was declared through, or the handler type it was annotated with.
	CodeRouteMissingReturnType = "MRT001"
	// CodeRouteMissingParamType: a handler parameter with no written type. The call context
	// parameters are exempt, every parameter after them travels on the wire. Args: [0] the parameter
	// name, [1] the helper or handler type it was declared through.
	CodeRouteMissingParamType = "MRT002"
	// CodeRouteThrowInHandler: a `throw` that escapes a handler leaves its signature, so it lands in
	// the undeclared `@thrownErrors` slot and the client only sees its public message. A throw caught
	// inside the same handler is not reported. Args: [0] the helper or handler type.
	CodeRouteThrowInHandler = "MRT003"
	// CodeRouteReturnedErrorType: a declared return arm derives from `Error` but not from
	// `RpcError`, so it carries no mion brand and the dispatcher reroutes it to `@thrownErrors`
	// instead of its typed slot. Args: [0] the arm's type name, [1] the helper or handler type.
	CodeRouteReturnedErrorType = "MRT004"
	// CodeRouteUnsafePropertyName: a declared property named `__proto__` is never data, since writing
	// it on a plain object swaps the prototype, so every compiled function drops the member (UPN001).
	// Reports the DECLARATION, so it fires for types no route reaches yet. Args: [0] the property
	// name.
	CodeRouteUnsafePropertyName = "MRT005"
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
