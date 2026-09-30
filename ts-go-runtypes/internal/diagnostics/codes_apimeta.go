package diagnostics

// Bundled-API codes (METxxx), issued by the apimeta lane behind the `bundleApi` build option: a
// dispatch point is recognised by the InjectApiMetadata brand on its resolved signature, and the
// lane injects the generated module carrying the route's metadata and compiled functions.
//
// MET001 / MET002 / MET005 drop the site, so nothing is injected for it: LevelError.
// MET003 / MET004 leave the call to fetching: LevelRuntimeError if the client never sets it up, else LevelInfo (it works).
// MET006 only leaves one bundled option unset: LevelWarning.
// MET007 injects both versions and the call still runs, reporting a mismatch it should not: LevelRuntimeError.
// MET008 bundles the call, which then fails the middleware's validation on every request: LevelRuntimeError.
// MET009 bundles a call whose middleware silently gets nothing: LevelRuntimeError.
// MET010 / MET011 build a client whose fetching cannot work (no server half, no client half): LevelRuntimeError.
const (
	// CodeApiMetaUnreadable: the API type a dispatch site names cannot be read as a mion PublicApi.
	// Args: [0] what could not be read.
	CodeApiMetaUnreadable = "MET001"
	// CodeApiMetaRouteNotDeclared: a route id the API type does not declare. Args: [0] the route id.
	CodeApiMetaRouteNotDeclared = "MET002"
	// CodeApiMetaRouteWidened: a widened `string` route id, and the client never sets up fetching; reported at the site.
	CodeApiMetaRouteWidened = "MET003"
	// CodeApiMetaRouteWidenedFetched: as MET003, but the client sets up `useFetchMetadata`, so the call fetches.
	CodeApiMetaRouteWidenedFetched = "MET004"
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
	// CodeApiMetaNoMetadataToFetch: the fetched API lacks `mionFetchMetadata`.
	// Reported at the fetching call: a widened site, `useFetchMetadata`, or `initClient` when bundling is off.
	CodeApiMetaNoMetadataToFetch = "MET010"
	// CodeApiMetaFetchNotSetUp: bundling is off and the client never calls `useFetchMetadata`; reported at `initClient`.
	CodeApiMetaFetchNotSetUp = "MET011"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeApiMetaUnreadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedBundleApi, Title: "The API type a dispatch site names cannot be read as a mion PublicApi"},
		{Code: CodeApiMetaRouteNotDeclared, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A dispatch site calls a route its API type does not declare"},
		{Code: CodeApiMetaRouteWidened, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedBundleApi, Title: "The route id at a dispatch site was widened to `string`, so nothing is bundled for it and the client never sets up fetching"},
		{Code: CodeApiMetaRouteWidenedFetched, Family: FamilyMarker, Level: LevelInfo, Scope: ScopeNotSource, Raised: RaisedBundleApi, Title: "The route id at a dispatch site was widened to `string`; the call fetches its metadata"},
		{Code: CodeApiMetaSourceAmbiguous, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "The API program named by `apiTsconfig` has no single `initRoutes` call declaring the routes this client calls"},
		{Code: CodeApiMetaOptionWidened, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "An option of a bundled method is not a literal on the API type, so the bundled metadata leaves it unset"},
		{Code: CodeApiMetaVersionMismatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client and the API it is built against inject different build versions"},
		{Code: CodeApiMetaMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A called route runs a middleware that needs params, and the client never sets it up"},
		{Code: CodeApiMetaOptionalMiddlewareNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A called route runs a middleware with optional params, and the client never sets it up"},
		{Code: CodeApiMetaNoMetadataToFetch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedBundleApi, Title: "A client fetches route metadata from an API that does not serve it"},
		{Code: CodeApiMetaFetchNotSetUp, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A client built with bundleApi off never sets up metadata fetching"},
	} {
		register(definition)
	}
}
