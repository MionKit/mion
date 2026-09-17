package diagnostics

// `@mion-downgrade-error` directive codes (DWNxxx). Issued when a source-level
// downgrade comment is itself wrong: it lowered nothing, it named a code that
// cannot be lowered, it named a code that does not exist, or it named one that
// is already a warning.
//
// The directive is the sibling of `@mion-expect-error`: same line-above
// placement, same optional code list, but it LOWERS the finding to a warning
// instead of removing it. That is the right tool when the finding is TRUE and
// worth seeing (a suite that pins what a broken type does at runtime): removing
// it would hide a correct statement about the code, and only the halt is
// unwanted.
//
// All four are LevelWarning, the same reasoning as the EXP family: the build
// emits, and what it emitted is CORRECT. The only thing wrong is a comment, and
// a stale comment is not a reason to stop shipping.
const (
	// CodeDowngradeErrorUnused fires when a directive lowered nothing: no
	// diagnostic it names was raised on the line below it. Args: [0] the codes
	// the directive named, or "any" for the bare form. Anchors at the comment.
	CodeDowngradeErrorUnused = "DWN001"
	// CodeDowngradeErrorNotDowngradeable fires when a directive names a code the
	// level table never lowers: a LevelError means the build produced no code for
	// the thing, so carrying on would ship missing output rather than risky
	// output. Args: [0] the offending code.
	CodeDowngradeErrorNotDowngradeable = "DWN002"
	// CodeDowngradeErrorUnknownCode fires when a directive names a code the
	// catalog does not define, which is almost always a typo. Left unreported it
	// would read as a working downgrade that protects nothing. Args: [0] the
	// unknown code.
	CodeDowngradeErrorUnknownCode = "DWN003"
	// CodeDowngradeErrorAlreadyWarning fires when a directive names a code that
	// is already a warning, so it does nothing. Unlike `downgradeErrors`, which
	// accepts a warning silently (a code's level may soften between releases and
	// that must never break a consumer's build), a comment written by hand at one
	// call site is worth reporting: the author expected a halt to stop. Args: [0]
	// the code.
	CodeDowngradeErrorAlreadyWarning = "DWN004"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeDowngradeErrorUnused, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` lowered nothing: delete it or fix the code it names"},
		{Code: CodeDowngradeErrorNotDowngradeable, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a code that can never be lowered"},
		{Code: CodeDowngradeErrorUnknownCode, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a diagnostic code that does not exist"},
		{Code: CodeDowngradeErrorAlreadyWarning, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a code that is already a warning"},
	} {
		register(definition)
	}
}
