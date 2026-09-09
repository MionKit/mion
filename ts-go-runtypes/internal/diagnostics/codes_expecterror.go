package diagnostics

// `@mion-expect-error` directive codes (EXPxxx). Issued when a source-level
// suppression comment is itself wrong: it silenced nothing, it named a code
// that cannot be silenced, or it named a code that does not exist.
//
// The directive works like TypeScript's `@ts-expect-error`: it sits on the line
// above a finding and REMOVES it, and an unused one is an error, so a comment
// can never quietly outlive the problem it was added for. That reverse check is
// EXP001 and is the whole reason the directive is safer than a config-level
// ignore list.
const (
	// CodeExpectErrorUnused fires when a directive silenced nothing: no
	// diagnostic it names was raised on the line below it. Args: [0] the codes
	// the directive named, or "any" for the bare form. Anchors at the comment.
	CodeExpectErrorUnused = "EXP001"
	// CodeExpectErrorNotSuppressible fires when a directive names a code that is
	// never suppressible: a pure-fn code (files mode has no fallback for a failed
	// generation, so proceeding would ship missing output rather than risky
	// output) or an EXP code itself (a directive cannot silence the check that
	// keeps directives honest). Args: [0] the offending code.
	CodeExpectErrorNotSuppressible = "EXP002"
	// CodeExpectErrorUnknownCode fires when a directive names a code the catalog
	// does not define, which is almost always a typo. Left unreported it would
	// read as a working suppression that silently protects nothing. Args: [0] the
	// unknown code.
	CodeExpectErrorUnknownCode = "EXP003"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeExpectErrorUnused, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`@mion-expect-error` silenced nothing: delete it or fix the code it names"},
		{Code: CodeExpectErrorNotSuppressible, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`@mion-expect-error` names a code that can never be suppressed"},
		{Code: CodeExpectErrorUnknownCode, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`@mion-expect-error` names a diagnostic code that does not exist"},
	} {
		register(definition)
	}
}
