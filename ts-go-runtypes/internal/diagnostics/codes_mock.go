package diagnostics

// MockData mirror-file codes (enrich-mock-*), the MockData twin of codes_friendly.go. Content validity
// comes from internal/enrichment/validate.go, the enrich-mock-* hygiene codes from the dirty-tag scan;
// opt-in surfaces only (Request.CheckEnrich, `mion enrich --no-emit`).
//
// An unreadable pool is skipped for the generator's kind default, so nothing breaks (LevelWarning).
// enrich-mock-reserved-prefix is LevelError for the same reason as enrich-text-reserved-prefix: the plan fails and no mirror is written.
const (
	CodeMockUnknownField = "enrich-mock-unknown-field"
	CodeMockReservedProp = "enrich-mock-reserved-prefix"
	CodeMockTodo         = "enrich-mock-todo-left"
	CodeMockOrphanConst  = "enrich-mock-orphan-type"
	CodeMockOrphanField  = "enrich-mock-orphan-field"
	CodeMockBlankValue   = "enrich-mock-blank-value"
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
