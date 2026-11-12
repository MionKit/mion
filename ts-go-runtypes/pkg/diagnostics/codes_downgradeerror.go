package diagnostics

// `@mion-downgrade-error` directive codes (comment-downgrade-error-*), raised when the downgrade comment is itself
// wrong. The directive is the sibling of `@mion-expect-error`, same placement and optional code
// list, but it LOWERS the finding to a warning instead of removing it: the right tool when the
// finding is TRUE and worth seeing and only the halt is unwanted.
//
// All four are LevelWarning, as with comment-expect-error-*: what the build emitted is CORRECT, only a comment
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
		{Code: CodeDowngradeErrorUnused, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` lowered nothing: delete it or fix the code it names",
			// No Examples, same reason as the comment-expect-error-* family: only a whole program answers "did this comment do
			// anything", so these are raised on that pass and covered by downgradeerror_test.go.
			Headline: "Unused `@mion-downgrade-error {name}`: nothing was reported on the line below it, so the comment is stale and can be deleted.",
			Summary:  "A `@mion-downgrade-error` comment lowered nothing: the code it names was not reported on the line below. Like `@mion-expect-error`, a comment left behind after a fix is reported. Delete the comment, or correct the code it names.",
			Fix:      "// @mion-downgrade-error validate-symbol-root\nexport const report = createValidateFn<symbol>();",
		},
		{Code: CodeDowngradeErrorNotDowngradeable, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a code that can never be lowered",
			Headline: "`@mion-downgrade-error {name}` cannot lower that code: the build produces no code for it, so carrying on would ship missing output.",
			Summary:  "A `@mion-downgrade-error` comment named an Error code, which always stops the build. The build produced no code for that call, so going on would ship a call that throws. Only a RuntimeError can be downgraded, by comment or by the `downgradeErrors` setting. Fix the reported call instead.",
		},
		{Code: CodeDowngradeErrorUnknownCode, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a diagnostic code that does not exist",
			Headline: "`@mion-downgrade-error {name}` names a diagnostic that does not exist; check the spelling against the name in the message you are lowering.",
			Summary:  "A `@mion-downgrade-error` comment names a code mion does not have, usually a typo, so it lowers nothing. Copy the code from the message you are lowering, for example `validate-symbol-root` in `error validate-symbol-root: Type ... can never be validated`.",
			Fix:      "// @mion-downgrade-error validate-symbol-root",
		},
		{Code: CodeDowngradeErrorAlreadyWarning, Family: FamilyMarker, Level: LevelInfo, Scope: ScopeNotSource, Title: "`@mion-downgrade-error` names a code that is already a warning or info",
			Headline: "`@mion-downgrade-error {name}` does nothing: that code is already a warning or info, so it was never halting your build.",
			Summary:  "A `@mion-downgrade-error` comment named a warning or info code, which never stops the build. Delete it, or use `@mion-expect-error` to hide the code completely.",
			Fix:      "// @mion-expect-error validate-non-data-property-dropped",
		},
	} {
		Register(definition)
	}
}
