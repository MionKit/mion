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
	register(Definition{
		Code:   CodeDuplicateOverride,
		Family: FamilyMarker,
		Level:  LevelRuntimeError,
		Scope:  ScopeNotSource,
		Title:  "Duplicate overrideX<T>: one override per (type, function)",
	})
	register(Definition{
		Code:   CodeOverrideMissingCfn,
		Family: FamilyMarker,
		Level:  LevelRuntimeError,
		Scope:  ScopeNotSource,
		Title:  "Override redirect references a cfn module that did not render",
	})
	register(Definition{
		Code:   CodeOverrideValidateCrossFamily,
		Family: FamilyMarker,
		Level:  LevelInfo,
		Scope:  ScopeNotSource,
		Title:  "validate override also affects JSON union decoders for this type",
	})
}
