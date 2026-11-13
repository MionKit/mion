package diagnostics

// mion route codes (rpc-handler-*) over route, query, mutation, middleware and headersMiddleware handlers, resolved by the checker.
// Emitted only when a caller opts in (Request.CheckRouterRules), so a build never fails on one: off in eslint must mean off.
// The rpc-handler-* errors are LevelRuntimeError despite being lint-only: the build emits, but mion compiles the DECLARED types,
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
	// CodeRouteSharedFactoryUntyped: a `sharedDataFactory` with no written return type, which every client infers
	// from the body (a whole database type). Works at runtime, hence a warning. No args.
	CodeRouteSharedFactoryUntyped = "rpc-handler-shared-factory-untyped"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeRouteMissingReturnType, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handler has no return type annotation",
			Headline: "mion `{handler}` handler has no return type annotation; write the type the handler answers with.",
			Summary:  "mion builds the route's validation and serialization from the handler's declared types, and the client types its call from the same declaration. An inferred return type gives the build nothing to work from. Write the return type on the handler.",
			Fix:      "mion.route((ctx, name: string): string => `hello ${name}`);",
		},
		{Code: CodeRouteMissingParamType, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handler parameter has no type annotation",
			Headline: "mion `{handler}` handler parameter `{param}` has no type annotation; every parameter after the call context travels on the wire and must declare its type.",
			Summary:  "Every handler parameter after the call context is part of the route's public input, so mion builds a validator and a decoder from its declared type. The call context (the first parameter, the first two for `headersMiddleware`) never goes over the network. Add a type to the parameter.",
			Fix:      "mion.route((ctx, name: string): string => `hello ${name}`);",
		},
		{Code: CodeRouteThrowInHandler, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handlers return errors, they never throw them",
			Headline: "mion `{handler}` handlers must return errors, not throw them; return an `RpcError` to let the chain continue, or a `FatalError` to stop the request.",
			Summary:  "A returned error stays in the handler's signature, so the client gets it typed at the call site. A thrown one goes to the undeclared `@thrownErrors` slot, and the client sees only its public message. A `throw` caught by `try` and `catch` in the same handler is not reported. If a throw is on purpose, add `// @mion-expect-error rpc-handler-throws` above it and say why.",
			Fix:      "return new RpcError({statusCode: 404, name: 'not-found', publicMessage: 'no pet'});",
		},
		{Code: CodeRouteReturnedErrorType, Family: FamilyMionRoute, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "mion handler answers with an error that is not an `RpcError`",
			Headline: "mion `{handler}` handler declares it can answer with `{errorType}`, which is not an `RpcError`; only an `RpcError` (or a subclass such as `FatalError`) carries the mion brand.",
			Summary:  "A returned `RpcError` (or any subclass) goes to its own typed slot, and the client gets it typed. A plain `Error`, a class extending it, or a bare `TypedError` fails the request and goes to the undeclared `@thrownErrors` slot, so your declared return type is no longer true. Answer with an `RpcError` or a `FatalError`.",
			Fix: `mion.route((ctx, id: string): Pet | RpcError<'pet-not-found'> =>
  new RpcError({statusCode: 404, name: 'pet-not-found', publicMessage: 'no pet'}));`,
		},
		{Code: CodeRouteUnsafePropertyName, Family: FamilyMionRoute, Level: LevelWarning, Scope: ScopeGraph, Title: "Property named `__proto__` can never be data and is dropped",
			Headline: "Property `{property}` can never be data and is dropped from every compiled function; rename it.",
			Summary:  "Writing `__proto__` on a plain object changes its prototype instead of adding a key, so the value never round trips, even though TypeScript accepts the type. It is reported on the declaration in any interface, type literal or class, even before a route uses it. Rename the property to keep the data (`prototype` and `constructor` are fine).",
			Fix:      `interface Settings { ok: number; parent: string }`,
			Example: `export interface Settings { ok: number; __proto__: string }
export const settings: Settings = {ok: 1, __proto__: 'x'};`,
			NestedExample: `export interface Outer { inner: { ok: number; __proto__: string } }
export const outer: Outer = {inner: {ok: 1, __proto__: 'x'}};`,
		},
		{Code: CodeRouteSharedFactoryUntyped, Family: FamilyMionRoute, Level: LevelWarning, Scope: ScopeNotSource, Title: "`sharedDataFactory` has no written return type",
			// No Example: the harness lacks `@mionjs/router`, which raises it; routerrules_test.go covers each factory shape.
			Headline: "`sharedDataFactory` has no written return type, so every client computes it from the body; write it, `ctx.shared` is typed from it.",
			Summary:  "`ctx.shared` is typed from what `sharedDataFactory` returns. A client types the router by inferring its whole options object, so a factory with no written return type makes every client compute that return from the body, a whole database type included, even when every route is slim. Write the return type; a database the client never needs can be declared `unknown` and cast on the server.",
			Fix:      "createMionRouter({sharedDataFactory: (): {user: User | null} => ({user: null})});",
		},
	} {
		Register(definition)
	}
}
