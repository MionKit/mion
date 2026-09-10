package diagnostics

// Custom-override codes (OVRxxx). The override pure-fn itself reuses the
// PureFunction marker layer (PFN001 inline-shape, PFE9006-9011 purity), so the
// only override-specific build-time error is a DUPLICATE: two overrideX<T>
// declarations targeting the same (type, function). There can be exactly one
// override per (type, function): a second one (regardless of body) is an
// error, since which wins would otherwise be order-dependent.
//
// LevelRuntimeError for both OVR001 and OVR002: each ships real output that is
// wrong. OVR001 keeps the FIRST override, writes the loser's compiled module as
// dead code and nulls both call sites, so one override the author wrote silently
// does not apply. OVR002's redirect body loads a module that is not in the graph
// and throws on the first call.
const (
	CodeDuplicateOverride = "OVR001"
	// CodeOverrideMissingCfn is a build-time tripwire: a cfn redirect references
	// a `cfn::<hash>` module that did not render in the entry graph. The redirect
	// body is `utl.usePureFn('cfn::<hash>')`, which throws at runtime on a miss,
	// this surfaces the emitter bug at build time instead. Should never fire in
	// normal operation. Mirrors the JSON composite's missing-primitive assert.
	CodeOverrideMissingCfn = "OVR002"
	// CodeOverrideValidateCrossFamily warns that overriding `validate` for a type
	// also changes how JSON / binary decoders narrow unions containing it,
	// `validate` is a shared cross-family dependency, so the override reaches
	// past createValidateFn<T>(). Informational; the build proceeds.
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
