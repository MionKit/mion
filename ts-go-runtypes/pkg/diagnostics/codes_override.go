package diagnostics

// Custom-override codes (override-*). An override pure-fn reuses the PureFunction marker layer (purefn-not-inline,
// the purity codes), so the only override-specific build error is a DUPLICATE: exactly one override per
// (type, function), because which of two wins would be order-dependent.
//
// Both override errors are LevelRuntimeError, each shipping real output that is wrong: override-duplicate keeps the
// FIRST override and nulls both call sites, so one override silently does not apply, and override-function-not-built's
// redirect body loads a module that is not in the graph and throws on the first call.
const (
	CodeDuplicateOverride = "override-duplicate"
	// CodeOverrideMissingCfn is a build-time tripwire for an emitter bug: a cfn redirect references
	// an override module that did not render in the entry graph, whose `utl.usePureFn` body would
	// otherwise throw at runtime. Should never fire in normal operation.
	CodeOverrideMissingCfn = "override-function-not-built"
	// CodeOverrideValidateCrossFamily warns that overriding `validate` also changes how JSON decoders narrow unions.
	CodeOverrideValidateCrossFamily = "override-validate-affects-json"
)

func init() {
	Register(Definition{
		Code:     CodeDuplicateOverride,
		Family:   FamilyMarker,
		Level:    LevelRuntimeError,
		Scope:    ScopeNotSource,
		Title:    "Duplicate overrideX<T>: one override per (type, function)",
		Headline: "Duplicate override for `{key}`: there can be exactly one override per (type, function).",
		Summary:  "Two `overrideX<T>()` calls target the same type and the same function, for example two `overrideValidate<User>()`. Which one wins would depend on the order your code is read, so the second one is rejected whatever its body. The Related line points at the first one. Keep one override and merge the logic into it.",
		Fix:      "overrideValidate<User>((utl) => (value) => checkA(value) && checkB(value));",
	})
	Register(Definition{
		Code:     CodeOverrideMissingCfn,
		Family:   FamilyMarker,
		Level:    LevelRuntimeError,
		Scope:    ScopeNotSource,
		Title:    "Override redirect references a cfn module that did not render",
		Headline: "Override entry `{entry}` references compiled function `{function}` which did not render: this would throw at runtime, so the build stops.",
		Summary:  "An override points at a generated function that was never written, so calling the override would throw at runtime. This is a mion bug. Delete the cache (`node_modules/.cache/mion`) or restart the dev server. If it keeps failing, open an issue with the type and the override that trigger it.",
	})
	Register(Definition{
		Code:     CodeOverrideValidateCrossFamily,
		Family:   FamilyMarker,
		Level:    LevelInfo,
		Scope:    ScopeNotSource,
		Title:    "validate override also affects JSON union decoders for this type",
		Headline: "Overriding `validate` for this type also changes how JSON decoders narrow unions containing it.",
		Summary:  "`overrideValidate<T>()` also changes JSON decoders of any union that contains `T`, because they call each member's validator to pick the matching branch. If the override should only affect `createValidateFn<T>()`, give the union members a discriminant so decoders never fall back to member validators.",
		Fix:      "type Event = {kind: 'click'; x: number} | {kind: 'key'; code: string};",
	})
}
