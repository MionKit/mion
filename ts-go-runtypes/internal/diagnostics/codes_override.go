package diagnostics

// Custom-override codes (OVRxxx). The override pure-fn itself reuses the
// PureFunction marker layer (PFN001 inline-shape, PFE9006-9011 purity), so the
// only override-specific build-time error is a DUPLICATE: two overrideX<T>
// declarations targeting the same (type, function). There can be exactly one
// override per (type, function): a second one (regardless of body) is an
// error, since which wins would otherwise be order-dependent.
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
		Code:     CodeDuplicateOverride,
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Duplicate overrideX<T>: one override per (type, function)",
	})
	register(Definition{
		Code:     CodeOverrideMissingCfn,
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Override redirect references a cfn module that did not render",
	})
	register(Definition{
		Code:     CodeOverrideValidateCrossFamily,
		Family:   FamilyMarker,
		Severity: SeverityWarning,
		Title:    "validate override also affects JSON/binary union decoders for this type",
	})
}
