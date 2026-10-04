package diagnostics

// `@mion-downgrade-error` directive codes (comment-downgrade-error-*), raised when the downgrade comment is itself
// wrong. The directive is the sibling of `@mion-expect-error`, same placement and optional code
// list, but it LOWERS the finding to a warning instead of removing it: the right tool when the
// finding is TRUE and worth seeing and only the halt is unwanted.
//
// All four are LevelWarning, as in the EXP family: what the build emitted is CORRECT, only a comment
// is wrong, and a stale comment is not a reason to stop shipping.
const (
	// CodeDowngradeErrorUnused fires when no diagnostic the directive names was raised on the line
	// below it. Args: [0] the codes named, or "any" for the bare form. Anchors at the comment.
	CodeDowngradeErrorUnused = "comment-downgrade-error-unused"
	// CodeDowngradeErrorNotDowngradeable fires on a LevelError code: the build produced no code for
	// the thing, so carrying on would ship missing output rather than risky output. Args: [0] the
	// offending code.
	CodeDowngradeErrorNotDowngradeable = "comment-downgrade-error-not-allowed"
	// CodeDowngradeErrorUnknownCode fires on a code the catalog does not define, almost always a
	// typo that would otherwise read as a working downgrade. Args: [0] the unknown code.
	CodeDowngradeErrorUnknownCode = "comment-downgrade-error-unknown-name"
	// CodeDowngradeErrorAlreadyWarning: a comment expects a halt from a warning or info, which never halts. Args: [0] the code.
	// `downgradeErrors` accepts one silently: a level may soften between releases and must not break a build.
	CodeDowngradeErrorAlreadyWarning = "comment-downgrade-error-already-warning"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeDowngradeErrorUnused, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` lowered nothing: delete it or fix the code it names"},
		{Code: CodeDowngradeErrorNotDowngradeable, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a code that can never be lowered"},
		{Code: CodeDowngradeErrorUnknownCode, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a diagnostic code that does not exist"},
		{Code: CodeDowngradeErrorAlreadyWarning, Family: FamilyMarker, Level: LevelInfo, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a code that is already a warning or info"},
	} {
		register(definition)
	}
}
