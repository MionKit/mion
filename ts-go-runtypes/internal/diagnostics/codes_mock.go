package diagnostics

// MockData mirror-file codes (MDxxx) — the MockData twin of codes_friendly.go
// under the per-family mirror split. Content validity from the paired checker
// in internal/enrichment/validate.go; the MD02x hygiene codes from the dirty-tag
// scan, attributed to this family by the file's const annotations / DSL
// import. Opt-in surfaces only (Request.CheckEnrich, `ts-runtypes enrich --no-emit`).
const (
	CodeMockUnknownField = "MD001"
	CodeMockReservedProp = "MD011"
	CodeMockTodo         = "MD020"
	CodeMockOrphanConst  = "MD021"
	CodeMockOrphanField  = "MD022"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMockUnknownField, Family: FamilyEnrich, Severity: SeverityError, Title: "MockData map names a field the type does not declare"},
		{Code: CodeMockReservedProp, Family: FamilyEnrich, Severity: SeverityError, Title: "Type property collides with the reserved rt$ enrichment prefix (MockData)"},
		{Code: CodeMockTodo, Family: FamilyEnrich, Severity: SeverityError, Title: "Unfilled @todo scaffold placeholder in a MockData mirror file"},
		{Code: CodeMockOrphanConst, Family: FamilyEnrich, Severity: SeverityError, Title: "Stale @rtOrphan const carcass in a MockData mirror file"},
		{Code: CodeMockOrphanField, Family: FamilyEnrich, Severity: SeverityError, Title: "Stale @rtOrphanChild field carcass in a MockData mirror file"},
	} {
		register(definition)
	}
}
