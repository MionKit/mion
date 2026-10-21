package diagnostics

// FriendlyText mirror-file codes (enrich-text-*): the FriendlyText half of a source type's two generated
// mirrors (labels + rt$errors templates, and the per-locale translation twins). Content validity
// comes from internal/enrichment/validate.go, the enrich-text-* hygiene codes from the dirty-tag scan in
// internal/enrichment/mirror/hygiene.go; all are opt-in (Request.CheckEnrich, `mion enrich
// --no-emit`), never emitted by a build. MockData twins live in codes_mock.go, the mirror↔source
// linkage codes in codes_mirror.go.
//
// The levels ask what the reader of a rendered message SEES. Every content finding here only
// degrades the text (to "value is invalid", the `other` plural arm, the raw field name, or a literal
// `$[…]` token for enrich-text-unknown-placeholder) while validation still ran, so all are LevelWarning. enrich-text-reserved-prefix is the one
// LevelError: a property colliding with the reserved `rt$` prefix fails the plan, so no mirror is
// written at all.
const (
	CodeFriendlyUnknownField      = "enrich-text-unknown-field"
	CodeFriendlyUnknownConstraint = "enrich-text-unknown-error-key"
	CodeFriendlyBadPlaceholder    = "enrich-text-unknown-placeholder"
	CodeFriendlyPluralNoOther     = "enrich-text-plural-missing-other"
	CodeFriendlyPluralBadArm      = "enrich-text-unknown-plural-arm"
	CodeFriendlyPluralNoCount     = "enrich-text-plural-without-count"
	CodeFriendlyDefaultNotAlone   = "enrich-text-default-and-messages"
	CodeFriendlyReservedProp      = "enrich-text-reserved-prefix"
	CodeFriendlyMissingConstraint = "enrich-text-missing-message"
	CodeFriendlyTodo              = "enrich-text-todo-left"
	CodeFriendlyOrphanConst       = "enrich-text-orphan-type"
	CodeFriendlyOrphanField       = "enrich-text-orphan-field"
	CodeFriendlyBlankValue        = "enrich-text-blank-value"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeFriendlyUnknownField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText map names a field the type does not declare"},
		{Code: CodeFriendlyUnknownConstraint, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText rt$errors key is not a declared constraint of the field"},
		{Code: CodeFriendlyBadPlaceholder, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText error template uses an unknown $[…] placeholder"},
		{Code: CodeFriendlyPluralNoOther, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText plural template is missing the mandatory 'other' arm"},
		{Code: CodeFriendlyPluralBadArm, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText plural template arm is not a CLDR category"},
		{Code: CodeFriendlyPluralNoCount, Family: FamilyEnrich, Level: LevelInfo, Scope: ScopeNotSource, Title: "FriendlyText plural template on a constraint that carries no count"},
		{Code: CodeFriendlyDefaultNotAlone, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText rt$default is mutually exclusive with per-constraint messages"},
		{Code: CodeFriendlyReservedProp, Family: FamilyEnrich, Level: LevelError, Scope: ScopeNotSource, Title: "Type property collides with the reserved rt$ enrichment prefix (FriendlyText)"},
		{Code: CodeFriendlyMissingConstraint, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText rt$errors has no message for a failure the field can produce"},
		{Code: CodeFriendlyTodo, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled @todo scaffold placeholder in a FriendlyText mirror file"},
		{Code: CodeFriendlyOrphanConst, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphan const carcass in a FriendlyText mirror file"},
		{Code: CodeFriendlyOrphanField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphanChild field carcass in a FriendlyText mirror file"},
		{Code: CodeFriendlyBlankValue, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled blank value in a FriendlyText mirror file"},
	} {
		register(definition)
	}
}
