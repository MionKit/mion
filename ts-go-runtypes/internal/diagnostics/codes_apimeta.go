package diagnostics

// Bundled-API codes (METxxx), issued by the apimeta lane behind the `bundleApi` build option: a
// dispatch point is recognised by the InjectApiMetadata brand on its resolved signature, and the
// lane injects the generated module carrying the route's metadata and compiled functions.
//
// MET001 / MET002 / MET005 drop the site, so nothing is injected for it: LevelError. MET003 and its `mixed`
// twin MET004 leave the call to the fetched lane, which builds its functions at runtime and so breaks the
// strict-CSP promise of `bundled`: LevelRuntimeError under `bundled`, LevelWarning under `mixed`.
// MET006 only leaves one bundled option unset: LevelWarning.
// MET007 injects both versions and the call still runs, reporting a mismatch it should not: LevelRuntimeError.
// MET008 bundles the call, which then fails the middleware's validation on every request: LevelRuntimeError.
// MET009 bundles a call whose middleware silently gets nothing: LevelRuntimeError.
// MET010 builds a `mixed` client whose fallback has nothing to fetch from: LevelRuntimeError.
const (
	// CodeApiMetaUnreadable: the API type a dispatch site names cannot be read as a mion PublicApi.
	// Args: [0] what could not be read.
	CodeApiMetaUnreadable = "MET001"
	// CodeApiMetaRouteNotDeclared: a route id the API type does not declare. Args: [0] the route id.
	CodeApiMetaRouteNotDeclared = "MET002"
	// CodeApiMetaRouteWidened: the route id is `string` (a generic helper erased the literal) under
	// `bundled`, where the call falls back to fetching. Reported at the dispatch site.
	CodeApiMetaRouteWidened = "MET003"
	// CodeApiMetaRouteWidenedMixed: the same widened id under `mixed`, where the call falls back to
	// the fetched metadata. Reported at the dispatch site.
	CodeApiMetaRouteWidenedMixed = "MET004"
	// CodeApiMetaSourceAmbiguous: the program named by `apiTsconfig` has no single `initRoutes(...)`
	// declaring the routes this client calls. Args: [0] the api tsconfig, [1] the candidate count.
	CodeApiMetaSourceAmbiguous = "MET005"
	// CodeApiMetaOptionWidened: an option of a bundled method is not a literal on the API type, so
	// the bundled metadata leaves it unset. Args: [0] the option name, [1] the method id.
	CodeApiMetaOptionWidened = "MET006"
	// CodeApiMetaVersionMismatch: this program's `initClient` and `initRoutes` calls inject different
	// build versions, so the client reports a mismatch against its own server. Args: [0] the client's
	// version, [1] the server's.
	CodeApiMetaVersionMismatch = "MET007"
	// CodeApiMetaMiddlewareNotSetUp: a called route runs a middleware that needs params and the client never sets up.
	// Args: [0] the middleware id, [1] the route id; reported at the first call to such a route.
	CodeApiMetaMiddlewareNotSetUp = "MET008"
	// CodeApiMetaOptionalMiddlewareNotSetUp: like MET008, for a middleware whose params are all optional. Same args.
	CodeApiMetaOptionalMiddlewareNotSetUp = "MET009"
	// CodeApiMetaMixedWithoutMetadata: a `mixed` client's API does not place `mionMethodsMetadata`; reported at its first call.
	CodeApiMetaMixedWithoutMetadata = "MET010"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeApiMetaUnreadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "The API type a dispatch site names cannot be read as a mion PublicApi"},
		{Code: CodeApiMetaRouteNotDeclared, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "A dispatch site calls a route its API type does not declare"},
		{Code: CodeApiMetaRouteWidened, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "The route id at a dispatch site was widened to `string`, so nothing can be bundled for it and the call falls back to fetching"},
		{Code: CodeApiMetaRouteWidenedMixed, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "The route id at a dispatch site was widened to `string`; the call falls back to the fetched metadata"},
		{Code: CodeApiMetaSourceAmbiguous, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "The API program named by `apiTsconfig` has no single `initRoutes` call declaring the routes this client calls"},
		{Code: CodeApiMetaOptionWidened, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "An option of a bundled method is not a literal on the API type, so the bundled metadata leaves it unset"},
		{Code: CodeApiMetaVersionMismatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A client and the API it is built against inject different build versions"},
		{Code: CodeApiMetaMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A called route runs a middleware that needs params, and the client never sets it up"},
		{Code: CodeApiMetaOptionalMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A called route runs a middleware with optional params, and the client never sets it up"},
		{Code: CodeApiMetaMixedWithoutMetadata, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A `mixed` client calls an API that serves no route metadata to fall back on"},
	} {
		register(definition)
	}
}
