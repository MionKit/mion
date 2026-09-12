package diagnostics

// Bundled-API codes (METxxx). Issued by the apimeta lane, the client half of
// mion's `bundleApi` build option: a dispatch point (`routes.x(...).call()`,
// `.prefill()`, `.typeErrors()`, a batch's `.call()`) recognised by the
// InjectApiMetadata brand on its resolved signature names, in its type
// arguments, the API and the route it calls; the lane resolves that route
// (plus every middleFn in its chain) out of the API type and injects the
// generated module carrying its metadata and compiled functions.
//
// Levels follow the catalog rule, and question one is per SITE: MET001 /
// MET002 / MET003 / MET005 all drop the site, so no module is generated and
// nothing is injected at the call, which then throws `route-metadata-not-found`
// under `bundled`. No output for the thing the finding is about, so all four
// are LevelError. MET004 is MET003's `mixed` twin, where the fetched lane still
// answers: LevelWarning. MET006 ships a method whose bundled options leave one
// field unset: LevelWarning.
const (
	// CodeApiMetaUnreadable: the API type a dispatch site names cannot be read
	// as a mion PublicApi (a loose RemoteApi, `any`, a member without a handler
	// or its compiled types). Args: [0] what could not be read.
	CodeApiMetaUnreadable = "MET001"
	// CodeApiMetaRouteNotDeclared: a dispatch site names a route id the API
	// type does not declare. Args: [0] the route id.
	CodeApiMetaRouteNotDeclared = "MET002"
	// CodeApiMetaRouteWidened: the route id at a dispatch site is `string`
	// (a generic helper erased the literal), under `bundled`, where nothing
	// can be bundled for the call. Reported at the dispatch site.
	CodeApiMetaRouteWidened = "MET003"
	// CodeApiMetaRouteWidenedMixed: the same widened id under `mixed`, where
	// the call falls back to the fetched metadata. Reported at the dispatch
	// site.
	CodeApiMetaRouteWidenedMixed = "MET004"
	// CodeApiMetaSourceAmbiguous: the API program named by `apiTsconfig` has
	// no `initRoutes(...)` call whose API declares the routes this client
	// calls, or several. Args: [0] the api tsconfig, [1] the candidate count.
	CodeApiMetaSourceAmbiguous = "MET005"
	// CodeApiMetaOptionWidened: an option of a bundled method is not a literal
	// on the API type (a widened boolean or string), so the bundled metadata
	// leaves it unset. Args: [0] the option name, [1] the method id.
	CodeApiMetaOptionWidened = "MET006"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeApiMetaUnreadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "The API type a dispatch site names cannot be read as a mion PublicApi"},
		{Code: CodeApiMetaRouteNotDeclared, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "A dispatch site calls a route its API type does not declare"},
		{Code: CodeApiMetaRouteWidened, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "The route id at a dispatch site was widened to `string`, so nothing can be bundled for it"},
		{Code: CodeApiMetaRouteWidenedMixed, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "The route id at a dispatch site was widened to `string`; the call falls back to the fetched metadata"},
		{Code: CodeApiMetaSourceAmbiguous, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "The API program named by `apiTsconfig` has no single `initRoutes` call declaring the routes this client calls"},
		{Code: CodeApiMetaOptionWidened, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "An option of a bundled method is not a literal on the API type, so the bundled metadata leaves it unset"},
	} {
		register(definition)
	}
}
