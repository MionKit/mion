package diagnostics

// mion route codes (MRTxxx). Issued by the route-rule pass over a mion route,
// query, mutation, middleFn or headersFn handler. These are the checks that
// used to ship as hand-written `@mionjs/*` ESLint rules: syntactic recognisers
// that saw a handler only when it was written straight into the helper call.
// Here the checker resolves the call, so an alias, a namespace import, a local
// barrel, a named handler reference, a `Handler`-typed const and a
// `@mion:route` JSDoc tag all reach the same rules.
//
// Emitted only when a caller opts in (Request.CheckRouterRules), so `mion
// compile` and the bundler plugins never fail a build on one: a rule turned off
// in an eslint config must mean off, and every one of these is Severity-Error
// because that is the level the rules ship at.
const (
	// CodeRouteMissingReturnType: a handler with no written return type
	// annotation. The build compiles the DECLARED type, so an inferred one
	// leaves nothing to validate or serialize against. Args: [0] the helper the
	// handler was declared through (`route`, `middleFn`, …), or the handler type
	// it was annotated with (`Handler`, `HeaderHandler`).
	CodeRouteMissingReturnType = "MRT001"
	// CodeRouteMissingParamType: a handler parameter with no written type
	// annotation. The call context parameters are exempt; every parameter after
	// them travels on the wire. Args: [0] the parameter name, [1] the helper or
	// handler type it was declared through.
	CodeRouteMissingParamType = "MRT002"
	// CodeRouteThrowInHandler: a `throw` that escapes a handler. A thrown error
	// leaves the handler's signature, so it lands in the undeclared
	// `@thrownErrors` slot and the client only ever sees its public message. A
	// throw caught by a `try` / `catch` inside the same handler never reaches
	// the router and is not reported. Args: [0] the helper or handler type.
	CodeRouteThrowInHandler = "MRT003"
	// CodeRouteReturnedErrorType: a handler's declared return type has an arm
	// that derives from `Error` but not from `RpcError`. Such an error carries
	// no mion brand, so the dispatcher reroutes it to `@thrownErrors` instead of
	// its typed slot and the declared return type stops being true. Args: [0]
	// the offending arm's type name, [1] the helper or handler type.
	CodeRouteReturnedErrorType = "MRT004"
	// CodeRouteUnsafePropertyName: a declared property named after a prototype
	// slot (`__proto__`, `prototype`, `constructor`). Those names are never
	// data: every decoder refuses them on the wire and the build fails for any
	// type a marker compiles with one. This reports the DECLARATION, so it fires
	// for types no route reaches yet. Args: [0] the property name.
	CodeRouteUnsafePropertyName = "MRT005"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeRouteMissingReturnType, Family: FamilyMionRoute, Severity: SeverityError, Scope: ScopeNotSource, Title: "mion handler has no return type annotation"},
		{Code: CodeRouteMissingParamType, Family: FamilyMionRoute, Severity: SeverityError, Scope: ScopeNotSource, Title: "mion handler parameter has no type annotation"},
		{Code: CodeRouteThrowInHandler, Family: FamilyMionRoute, Severity: SeverityError, Scope: ScopeNotSource, Title: "mion handlers return errors, they never throw them"},
		{Code: CodeRouteReturnedErrorType, Family: FamilyMionRoute, Severity: SeverityError, Scope: ScopeNotSource, Title: "mion handler answers with an error that is not an `RpcError`"},
		{Code: CodeRouteUnsafePropertyName, Family: FamilyMionRoute, Severity: SeverityError, Scope: ScopeGraph, Title: "Property is named after a prototype slot and can never be data"},
	} {
		register(definition)
	}
}
