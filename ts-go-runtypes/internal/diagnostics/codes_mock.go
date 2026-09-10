package diagnostics

// MockData mirror-file codes (MDxxx): the MockData twin of codes_friendly.go
// under the per-family mirror split. Content validity from the paired checker
// in internal/enrichment/validate.go; the MD02x hygiene codes from the dirty-tag
// scan, attributed to this family by the file's const annotations / DSL
// import. Opt-in surfaces only (Request.CheckEnrich, `mion enrich --no-emit`).
//
// Same reading as the FriendlyText twins: an unreadable pool is skipped and the
// mechanical generator's kind default is used, so nothing breaks (LevelWarning).
// MD011 is LevelError for the same reason as FT011: the plan fails and no mirror
// is written.
const (
	CodeMockUnknownField = "MD001"
	CodeMockReservedProp = "MD011"
	CodeMockTodo         = "MD020"
	CodeMockOrphanConst  = "MD021"
	CodeMockOrphanField  = "MD022"
	CodeMockBlankValue   = "MD023"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMockUnknownField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "MockData map names a field the type does not declare"},
		{Code: CodeMockReservedProp, Family: FamilyEnrich, Level: LevelError, Scope: ScopeNotSource, Title: "Type property collides with the reserved rt$ enrichment prefix (MockData)"},
		{Code: CodeMockTodo, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled @todo scaffold placeholder in a MockData mirror file"},
		{Code: CodeMockOrphanConst, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphan const carcass in a MockData mirror file"},
		{Code: CodeMockOrphanField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphanChild field carcass in a MockData mirror file"},
		{Code: CodeMockBlankValue, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled blank value in a MockData mirror file"},
	} {
		register(definition)
	}
}
