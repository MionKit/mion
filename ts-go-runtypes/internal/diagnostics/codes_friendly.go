package diagnostics

// FriendlyText mirror-file codes (FTxxx). Since the per-family mirror split,
// a source type enriches into TWO generated files: this group covers the
// FriendlyText mirror (labels + rt$errors templates, and its per-locale
// translation twins). Content validity comes from the paired checker in
// internal/enrichment/validate.go; the FT02x hygiene codes come from the
// dirty-tag scan in internal/enrichment/mirror/hygiene.go, attributed to this
// family by the file's const annotations / DSL import. All are opt-in
// surfaces (Request.CheckEnrich, `mion enrich --no-emit`), never emitted by a
// build. MockData twins live in codes_mock.go; the mirror↔source linkage
// codes in codes_gencheck.go.
const (
	CodeFriendlyUnknownField      = "FT002"
	CodeFriendlyUnknownConstraint = "FT003"
	CodeFriendlyBadPlaceholder    = "FT005"
	CodeFriendlyPluralNoOther     = "FT006"
	CodeFriendlyPluralBadArm      = "FT007"
	CodeFriendlyPluralNoCount     = "FT008"
	CodeFriendlyDefaultNotAlone   = "FT009"
	CodeFriendlyReservedProp      = "FT011"
	CodeFriendlyTodo              = "FT020"
	CodeFriendlyOrphanConst       = "FT021"
	CodeFriendlyOrphanField       = "FT022"
	CodeFriendlyBlankValue        = "FT023"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeFriendlyUnknownField, Family: FamilyEnrich, Severity: SeverityError, Title: "FriendlyText map names a field the type does not declare"},
		{Code: CodeFriendlyUnknownConstraint, Family: FamilyEnrich, Severity: SeverityWarning, Title: "FriendlyText rt$errors key is not a declared constraint of the field"},
		{Code: CodeFriendlyBadPlaceholder, Family: FamilyEnrich, Severity: SeverityWarning, Title: "FriendlyText error template uses an unknown $[…] placeholder"},
		{Code: CodeFriendlyPluralNoOther, Family: FamilyEnrich, Severity: SeverityError, Title: "FriendlyText plural template is missing the mandatory 'other' arm"},
		{Code: CodeFriendlyPluralBadArm, Family: FamilyEnrich, Severity: SeverityWarning, Title: "FriendlyText plural template arm is not a CLDR category"},
		{Code: CodeFriendlyPluralNoCount, Family: FamilyEnrich, Severity: SeverityWarning, Title: "FriendlyText plural template on a constraint that carries no count"},
		{Code: CodeFriendlyDefaultNotAlone, Family: FamilyEnrich, Severity: SeverityError, Title: "FriendlyText rt$default is mutually exclusive with per-constraint messages"},
		{Code: CodeFriendlyReservedProp, Family: FamilyEnrich, Severity: SeverityError, Title: "Type property collides with the reserved rt$ enrichment prefix (FriendlyText)"},
		{Code: CodeFriendlyTodo, Family: FamilyEnrich, Severity: SeverityError, Completeness: true, Title: "Unfilled @todo scaffold placeholder in a FriendlyText mirror file"},
		{Code: CodeFriendlyOrphanConst, Family: FamilyEnrich, Severity: SeverityError, Title: "Stale @rtOrphan const carcass in a FriendlyText mirror file"},
		{Code: CodeFriendlyOrphanField, Family: FamilyEnrich, Severity: SeverityError, Title: "Stale @rtOrphanChild field carcass in a FriendlyText mirror file"},
		{Code: CodeFriendlyBlankValue, Family: FamilyEnrich, Severity: SeverityError, Completeness: true, Title: "Unfilled blank value in a FriendlyText mirror file"},
	} {
		register(definition)
	}
}
