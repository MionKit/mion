package diagnostics

// Temporal-scanner codes (marker-temporal-*), raised when a `Temporal.*` reference did not resolve because the
// consumer's tsconfig `lib` omits the namespace; without the guard the validator would silently
// accept any value.
const (
	// CodeTemporalNotLoaded: a `Temporal.<Name>` reference resolved to `any`. LevelRuntimeError: the
	// build emits an accept-anything validator, never what the author intended. Args:
	// [qualifiedName]. Fix: add "ESNext.Temporal" to compilerOptions.lib.
	CodeTemporalNotLoaded = "marker-temporal-lib-missing"
)

func init() {
	Register(Definition{
		Code:     CodeTemporalNotLoaded,
		Family:   FamilyMarker,
		Level:    LevelRuntimeError,
		Scope:    ScopeGraph,
		Title:    "Temporal type resolved to 'any': add \"ESNext.Temporal\" to compilerOptions.lib",
		Headline: "Temporal type `{type}` resolved to `any`: the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
		Summary:  "`Temporal.*` types only work when the Temporal lib is loaded. Without it the type becomes `any` and the validator accepts everything. Add `\"ESNext.Temporal\"` to `lib` in your tsconfig.",
		Fix:      "{\"compilerOptions\": {\"lib\": [\"ES2023\", \"ESNext.Temporal\"]}}",
	})
}
