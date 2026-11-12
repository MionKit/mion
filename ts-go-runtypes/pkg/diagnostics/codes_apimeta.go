package diagnostics

// Bundled-API codes (rpc-client-*), issued by the apimeta lane behind the `client.routes` build option: a
// dispatch point is recognised by the InjectApiMetadata brand on its resolved signature, and the
// lane injects the generated module carrying the route's metadata and compiled functions.
//
// rpc-client-api-unreadable / rpc-client-route-not-declared drop the site, so nothing is injected for it: LevelError.
// rpc-client-route-id-widened / rpc-client-route-id-widened-fetched leave the call to fetching: LevelRuntimeError if the client never sets it up, else LevelInfo (it works).
// rpc-client-option-widened only leaves one bundled option unset: LevelWarning.
// rpc-client-version-mismatch injects both versions and the call still runs, reporting a mismatch it should not: LevelRuntimeError.
// rpc-client-middleware-not-set-up bundles the call, which then fails the middleware's validation on every request: LevelRuntimeError.
// rpc-client-optional-middleware-not-set-up bundles a call whose middleware silently gets nothing: LevelRuntimeError.
// rpc-client-no-metadata-route / rpc-client-fetch-not-set-up build a client whose fetching cannot work (no server half, no client half): LevelRuntimeError.
// rpc-client-server-version-mismatch builds a client every call of which reports a version mismatch: LevelRuntimeError.
// rpc-client-no-server-version builds a client that works but is checked against its server only at runtime: LevelWarning.
// rpc-client-shared-modules builds a client that works but carries every server type: LevelWarning.
const (
	// CodeApiMetaUnreadable: the API type a dispatch site names cannot be read as a mion PublicApi.
	// Args: [0] what could not be read.
	CodeApiMetaUnreadable = "rpc-client-api-unreadable"
	// CodeApiMetaRouteNotDeclared: a route id the API type does not declare. Args: [0] the route id.
	CodeApiMetaRouteNotDeclared = "rpc-client-route-not-declared"
	// CodeApiMetaRouteWidened: a widened `string` route id, and the client never sets up fetching; reported at the site.
	CodeApiMetaRouteWidened = "rpc-client-route-id-widened"
	// CodeApiMetaRouteWidenedFetched: as rpc-client-route-id-widened, but the client sets up `useFetchMetadata`, so the call fetches.
	CodeApiMetaRouteWidenedFetched = "rpc-client-route-id-widened-fetched"
	// CodeApiMetaOptionWidened: an option of a bundled method is not a literal on the API type, so
	// the bundled metadata leaves it unset. Args: [0] the option name, [1] the method id.
	CodeApiMetaOptionWidened = "rpc-client-option-widened"
	// CodeApiMetaVersionMismatch: this program's `initClient` and `initRoutes` calls inject different
	// build versions, so the client reports a mismatch against its own server. Args: [0] the client's
	// version, [1] the server's.
	CodeApiMetaVersionMismatch = "rpc-client-version-mismatch"
	// CodeApiMetaMiddlewareNotSetUp: a called route runs a middleware that needs params and the client never sets up.
	// Args: [0] the middleware id, [1] the route id; reported at the first call to such a route.
	CodeApiMetaMiddlewareNotSetUp = "rpc-client-middleware-not-set-up"
	// CodeApiMetaOptionalMiddlewareNotSetUp: like rpc-client-middleware-not-set-up, for a middleware whose params are all optional. Same args.
	CodeApiMetaOptionalMiddlewareNotSetUp = "rpc-client-optional-middleware-not-set-up"
	// CodeApiMetaNoMetadataToFetch: the fetched API lacks `mionFetchMetadata`.
	// Reported at the fetching call: a widened site, `useFetchMetadata`, or `initClient` when routes are fetched.
	CodeApiMetaNoMetadataToFetch = "rpc-client-no-metadata-route"
	// CodeApiMetaFetchNotSetUp: routes are fetched and the client never calls `useFetchMetadata`; reported at `initClient`.
	CodeApiMetaFetchNotSetUp = "rpc-client-fetch-not-set-up"
	// CodeApiMetaServerVersionMismatch: the client's ids hash to another version than the API type's `ApiBuildVersion`.
	// Args: [0] the client's version, [1] the server's; reported at `initClient`.
	CodeApiMetaServerVersionMismatch = "rpc-client-server-version-mismatch"
	// CodeApiMetaNoServerVersion: the client's API comes from declarations with no server version; reported at `initClient`.
	CodeApiMetaNoServerVersion = "rpc-client-no-server-version"
	// CodeApiMetaSharedModules: allSingle puts server types in a client sharing their program; reported at `initClient`.
	CodeApiMetaSharedModules = "rpc-client-shared-modules"
	// CodeApiMetaTypesNotBuiltByMion: the client's API comes from a types-only package without a usable
	// `mion api-types` marker. Args: [0] the package, [1] what is wrong; reported once per package at `initClient`.
	CodeApiMetaTypesNotBuiltByMion = "rpc-client-types-not-built-by-mion"
	// CodeApiMetaTypesOtherCompiler: the types-only package was built by another mion version.
	// Args: [0] the package, [1] its compiler, [2] this one; reported once per package at `initClient`.
	CodeApiMetaTypesOtherCompiler = "rpc-client-types-other-mion-version"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeApiMetaUnreadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "The API type a dispatch site names cannot be read as a mion PublicApi",
			Headline: "The API type at this dispatch site cannot be read as a mion PublicApi ({reason}); bundling needs `PublicApi<typeof routes>`.",
			Summary:  "When routes are bundled (`client.routes: 'bundle'`, the default), the build reads each called route's handler types, options and middlewares from the client's API type. Only `PublicApi<typeof routes>`, the type the router exports, has them; a loose `RemoteApi`, an `any`, or a member without its compiled types does not. Type the client with `PublicApi<typeof routes>`.",
			Fix:      "initClient<PublicApi<typeof routes>>({baseURL});",
		},
		{Code: CodeApiMetaRouteNotDeclared, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A dispatch site calls a route its API type does not declare",
			Headline: "This call names the route `{route}`, which the API type does not declare; nothing is bundled for it.",
			Summary:  "The API type has no route with this id, usually because of a route id written by hand or a stale declaration file. Fix the route id, or rebuild the API's declarations.",
		},
		{Code: CodeApiMetaRouteWidened, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "The route id at a dispatch site was widened to `string`, so nothing is bundled for it and the client never sets up fetching",
			Headline: "The route id at this call is `string` (a generic helper erased it), so nothing is bundled for it, and this client never sets up `useFetchMetadata`: the call fails.",
			Summary:  "A helper typed with `RouteSubRequest<any>` widens the route id to `string`, so the build cannot bundle the call inside it, and with no `useFetchMetadata` set up that call fails. Keep the route id through a generic helper, or move the call out of it. Or set up `useFetchMetadata` so the call asks the server for the route. That builds functions at runtime, which a strict Content Security Policy blocks.",
			Fix: `function run<S extends RouteSubRequest<any>>(sub: S) { return sub.call() }
// or fetch the route from the server
useFetchMetadata(middlewares.mionFetchMetadata);`,
		},
		{Code: CodeApiMetaRouteWidenedFetched, Family: FamilyMarker, Level: LevelInfo, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "The route id at a dispatch site was widened to `string`; the call fetches its metadata",
			Headline: "The route id at this call is `string` (a generic helper erased it); the call fetches its metadata from the server instead of using the bundle.",
			Summary:  "A helper typed with `RouteSubRequest<any>` widens the route id to `string`, so the build cannot bundle the call inside it. The call still works because the client sets up `useFetchMetadata`: it fetches the route's metadata on first use and builds its functions at runtime. To bundle it too, keep the route id through a generic helper.",
			Fix:      "function run<S extends RouteSubRequest<any>>(sub: S) { return sub.call() }",
		},
		{Code: CodeApiMetaOptionWidened, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "An option of a bundled method is not a literal on the API type, so the bundled metadata leaves it unset",
			Headline: "Option `{option}` of `{route}` is not a literal on the API type, so the bundled metadata leaves it unset.",
			Summary:  "The bundled metadata copies each route's options from the API type, which holds only literal values. A value computed at runtime, like a variable or a call, is left unset on the client, while the server may set it. Write the option as a literal on the route or the router.",
			Fix:      "mion.route(handler, {sanitizeParams: true})",
		},
		{Code: CodeApiMetaVersionMismatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client and the API it is built against inject different build versions",
			Headline: "This client injects the build version {clientVersion} but the API in the same program injects {apiVersion}; the client reports a version mismatch against its own server.",
			Summary:  "`initClient` and `initRoutes` each get a build version from the routes they are typed with. In one program they must match, so a difference means the client was typed with another API than the one the router registered. Type the client with `PublicApi<typeof routes>` from that router.",
			Fix:      "initClient<PublicApi<typeof routes>>({baseURL});",
		},
		{Code: CodeApiMetaMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A called route runs a middleware that needs params, and the client never sets it up",
			Headline: "The route `{route}` runs the middleware `{middleware}`, which needs params, but this client never sets it up; every call to the route fails its validation.",
			Summary:  "A middleware gets its params on the client from its `onRequest` hook. The build found no use of this middleware in the client program, neither a hook nor an installer, so every call sends nothing and the middleware rejects it. Set it up once next to `initClient` with `middlewares.<name>.onRequest(...)`, or pass it to the installer it ships with.",
			Fix:      "middlewares.trace.onRequest((trace) => trace({headers: {'X-Trace-Id': crypto.randomUUID()}}));",
		},
		{Code: CodeApiMetaOptionalMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A called route runs a middleware with optional params, and the client never sets it up",
			Headline: "The route `{route}` runs the middleware `{middleware}`, but this client never sets it up, so the middleware never gets its params.",
			Summary:  "All of this middleware's params are optional, so calls still go out, but the middleware never gets anything from this client. The build found no use of it in the client program, neither an `onRequest` hook nor an installer. Set it up with `middlewares.<name>.onRequest(...)` or its installer. A middleware with no params at all needs no setup. If sending nothing is on purpose, add `// @mion-expect-error rpc-client-optional-middleware-not-set-up` above the call.",
			Fix:      "middlewares.trace.onRequest((trace) => trace({headers: {'X-Trace-Id': crypto.randomUUID()}}));",
		},
		{Code: CodeApiMetaNoMetadataToFetch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "A client fetches route metadata from an API that does not serve it",
			Headline: "This client fetches route metadata, but the API it calls does not place `mionFetchMetadata`, so every fetch fails.",
			Summary:  "A call fetches its metadata when the build could not bundle it, or for every route when `client.routes` is `'fetch'`. The server answers those fetches only through the `mionFetchMetadata` middleware from `@mionjs/router/middlewares`, and this API does not add it. Add it first in the server's routes and set up its client half with `useFetchMetadata`. Or, with bundling on, remove `useFetchMetadata` and keep every route id a literal so every call is bundled.",
			Fix: `// server
mion.initRoutes({mionFetchMetadata, ...routes});
// client
useFetchMetadata(middlewares.mionFetchMetadata);`,
		},
		{Code: CodeApiMetaFetchNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client built with `client.routes: 'fetch'` never sets up metadata fetching",
			Headline: "This client builds with `client.routes: 'fetch'`, so every call fetches its route's metadata, but it never sets up `useFetchMetadata`: every call fails.",
			Summary:  "With `client.routes: 'fetch'`, each call asks the server how its route works on first use, through the client half of the metadata middleware. Nothing in this program sets that up. Set it up once next to `initClient`, or build with `client.routes: 'bundle'` (the default) so every call is bundled.",
			Fix:      "useFetchMetadata(middlewares.mionFetchMetadata);",
		},
		{Code: CodeApiMetaServerVersionMismatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client's API ids differ from the server build whose types it reads",
			Headline: "This client hashes its API ids to the build version {clientVersion}, but the API types it reads come from a server build with {serverVersion}: every call reports a version mismatch.",
			Summary:  "A server built with `mion compile` writes its build version into the API type of its `.d.ts`. This client computed different ids from those types, usually because its tsconfig or a library version differs from the server's, so the server would answer every call with a version mismatch. Build the client with the server's tsconfig and library versions, or use `client: {routes: 'fetch'}` to read the routes from the server at runtime.",
			Fix:      "mionVitePlugin({client: {routes: 'fetch'}})",
		},
		{Code: CodeApiMetaNoServerVersion, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client reads API types that carry no server build version",
			Headline: "The API types this client reads carry no server build version, so a client and server built with different ids are only caught at runtime.",
			Summary:  "The API types this client reads come from a `.d.ts` without a server build version, for example one written by plain `tsc`. The client still builds, but if its ids differ from the server's, you only find out at runtime. Build the API package with `mion compile` so its types carry the version and the client build checks it.",
			Fix:      "mion compile --tsconfig tsconfig.build.json",
		},
		{Code: CodeApiMetaSharedModules, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client built with moduleMode allSingle carries the server's types",
			Headline: "This program builds with moduleMode `allSingle`, one module per family for the whole program, so the client bundle carries every server type.",
			Summary:  "In `default` mode each source file gets its own module of compiled types, so a client bundle only holds the types of the files it imports. `allSingle` puts every type of the program in one module per family, server types included, and the client bundle loads all of them. Use the `default` mode for an app with a client and a server.",
			Fix:      "runTypes: {moduleMode: 'default'}",
		},
		{Code: CodeApiMetaTypesNotBuiltByMion, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client reads a types-only API package that `mion api-types` did not build",
			// No Example: rpc-client-types-not-built-by-mion and rpc-client-types-other-mion-version need an installed types-only package, which the one-file example harness cannot stage.
			Headline: "The API package {package} ships types only, but {reason}: a client can only trust types-only packages that `mion api-types` built.",
			Summary:  "A package with types and no JavaScript entry is read as a types-only API package. `mion api-types` writes one with a `mion.apiTypes` field in its package.json and the `mion-api.json` marker it names. This package lacks them, so its `.d.ts` may come from another tool, and the client cannot trust its ids, its private fields or its pure functions. Rebuild the package with `mion api-types` and publish its output folder.",
			Fix:      "mion api-types --tsconfig tsconfig.json --out api-types",
		},
		{Code: CodeApiMetaTypesOtherCompiler, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client reads a types-only API package built by another mion version",
			Headline: "The API package {package} was built by mion {builtWith}, this build runs {running}: the ids of both sides may differ.",
			Summary:  "Type ids include the mion version that computed them, so different versions can produce incompatible ids. The client reports a mismatch after reading the server response; fetched route metadata can restore compatible route types. Build the client with the mion version the types package names, or rebuild the package with yours.",
			Fix:      "npm install -D @mionjs/bin-compiler@<the version in mion-api.json>",
		},
	} {
		Register(definition)
	}
}
