package diagnostics

// `@mion-expect-error` directive codes (EXPxxx), raised when the suppression comment is itself
// wrong. The directive works like `@ts-expect-error`: it sits on the line above a finding and
// REMOVES it, and an unused one is reported (EXP001), which is what makes it safer than a
// config-level ignore list.
//
// All three are LevelWarning: what the build emitted is CORRECT, only a comment is wrong. TypeScript
// makes the same finding an error; mion does not, because here an error fails a build.
const (
	// CodeExpectErrorUnused fires when no diagnostic the directive names was raised on the line below
	// it. Args: [0] the codes named, or "any" for the bare form. Anchors at the comment.
	CodeExpectErrorUnused = "EXP001"
	// CodeExpectErrorNotSuppressible fires on a never-suppressible code: a pure-fn code (files mode
	// has no fallback for a failed generation, so proceeding ships missing output) or an EXP code
	// itself (a directive cannot silence the check on directives). Args: [0] the offending code.
	CodeExpectErrorNotSuppressible = "EXP002"
	// CodeExpectErrorUnknownCode fires on a code the catalog does not define, almost always a typo
	// that would otherwise read as a working suppression. Args: [0] the unknown code.
	CodeExpectErrorUnknownCode = "EXP003"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeExpectErrorUnused, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-expect-error` silenced nothing: delete it or fix the code it names"},
		{Code: CodeExpectErrorNotSuppressible, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-expect-error` names a code that can never be suppressed"},
		{Code: CodeExpectErrorUnknownCode, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-expect-error` names a diagnostic code that does not exist"},
	} {
		register(definition)
	}
}
