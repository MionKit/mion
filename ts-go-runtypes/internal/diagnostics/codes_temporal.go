package diagnostics

// Temporal-scanner codes (TMPxxx). Issued by the resolver when a runtype
// references a `Temporal.*` type that did NOT resolve to a real type, i.e.
// the consumer's tsconfig `lib` doesn't load the Temporal namespace, so
// `Temporal.PlainDate` silently degraded to `any`. Without this guard the
// generated validator would accept any value with no signal to the user.
const (
	// CodeTemporalNotLoaded: a `Temporal.<Name>` type reference resolved to
	// `any` because the Temporal lib isn't in the program. Error severity:
	// the emitted validator would be a silent no-op (accept-anything), which
	// is never what the author intended. Args: [qualifiedName] e.g.
	// "Temporal.PlainDate". Fix: add "ESNext.Temporal" to compilerOptions.lib.
	CodeTemporalNotLoaded = "TMP001"
)

func init() {
	register(Definition{
		Code:     CodeTemporalNotLoaded,
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Temporal type resolved to 'any': add \"ESNext.Temporal\" to compilerOptions.lib",
	})
}
