package diagnostics

// Temporal-scanner codes (TMPxxx), raised when a `Temporal.*` reference did not resolve because the
// consumer's tsconfig `lib` omits the namespace; without the guard the validator would silently
// accept any value.
const (
	// CodeTemporalNotLoaded: a `Temporal.<Name>` reference resolved to `any`. LevelRuntimeError: the
	// build emits an accept-anything validator, never what the author intended. Args:
	// [qualifiedName]. Fix: add "ESNext.Temporal" to compilerOptions.lib.
	CodeTemporalNotLoaded = "TMP001"
)

func init() {
	register(Definition{
		Code:   CodeTemporalNotLoaded,
		Family: FamilyMarker,
		Level:  LevelRuntimeError,
		Scope:  ScopeGraph,
		Title:  "Temporal type resolved to 'any': add \"ESNext.Temporal\" to compilerOptions.lib",
	})
}
