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
		{Code: CodeApiMetaUnreadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "The API type a dispatch site names cannot be read as a mion PublicApi"},
		{Code: CodeApiMetaRouteNotDeclared, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A dispatch site calls a route its API type does not declare"},
		{Code: CodeApiMetaRouteWidened, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "The route id at a dispatch site was widened to `string`, so nothing is bundled for it and the client never sets up fetching"},
		{Code: CodeApiMetaRouteWidenedFetched, Family: FamilyMarker, Level: LevelInfo, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "The route id at a dispatch site was widened to `string`; the call fetches its metadata"},
		{Code: CodeApiMetaOptionWidened, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "An option of a bundled method is not a literal on the API type, so the bundled metadata leaves it unset"},
		{Code: CodeApiMetaVersionMismatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client and the API it is built against inject different build versions"},
		{Code: CodeApiMetaMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A called route runs a middleware that needs params, and the client never sets it up"},
		{Code: CodeApiMetaOptionalMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A called route runs a middleware with optional params, and the client never sets it up"},
		{Code: CodeApiMetaNoMetadataToFetch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedBundledRoutes, Title: "A client fetches route metadata from an API that does not serve it"},
		{Code: CodeApiMetaFetchNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client built with `client.routes: 'fetch'` never sets up metadata fetching"},
		{Code: CodeApiMetaServerVersionMismatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client's API ids differ from the server build whose types it reads"},
		{Code: CodeApiMetaNoServerVersion, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client reads API types that carry no server build version"},
		{Code: CodeApiMetaSharedModules, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client built with moduleMode allSingle carries the server's types"},
		{Code: CodeApiMetaTypesNotBuiltByMion, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client reads a types-only API package that `mion api-types` did not build"},
		{Code: CodeApiMetaTypesOtherCompiler, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client reads a types-only API package built by another mion version"},
	} {
		register(definition)
	}
}
