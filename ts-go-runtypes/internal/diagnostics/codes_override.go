package diagnostics

// Custom-override codes (OVRxxx). An override pure-fn reuses the PureFunction marker layer (PFN001,
// PFE9006-9011), so the only override-specific build error is a DUPLICATE: exactly one override per
// (type, function), because which of two wins would be order-dependent.
//
// OVR001 and OVR002 are LevelRuntimeError, each shipping real output that is wrong: OVR001 keeps the
// FIRST override and nulls both call sites, so one override silently does not apply, and OVR002's
// redirect body loads a module that is not in the graph and throws on the first call.
const (
	CodeDuplicateOverride = "OVR001"
	// CodeOverrideMissingCfn is a build-time tripwire for an emitter bug: a cfn redirect references
	// an override module that did not render in the entry graph, whose `utl.usePureFn` body would
	// otherwise throw at runtime. Should never fire in normal operation.
	CodeOverrideMissingCfn = "OVR002"
	// CodeOverrideValidateCrossFamily warns that `validate` is a shared cross-family dependency, so
	// overriding it also changes how JSON / binary decoders narrow unions containing the type.
	CodeOverrideValidateCrossFamily = "OVR010"
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
		Level:  LevelWarning,
		Scope:  ScopeNotSource,
		Title:  "validate override also affects JSON/binary union decoders for this type",
	})
}
