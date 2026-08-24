package diagnostics

// Mirror↔source linkage codes (GExxx): `ts-runtypes enrich --no-emit` and the resolver's
// checkEnrich pass validating that a generated mirror file (of EITHER family;
// the file's path/annotations say which) still tracks a live source: the
// breadcrumb resolves (GE002), the source still declares the imported types
// (GE003), and the file sits at its computed per-family location (GE001,
// CLI-only: needs the project's genDir config). Detection lives in
// internal/enrichment/mirror/drift.go.
const (
	CodeGenMirrorUnreadable = "GE000"
	CodeGenMirrorDrift      = "GE001"
	CodeGenSourceMissing    = "GE002"
	CodeGenTypeMissing      = "GE003"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeGenMirrorUnreadable, Family: FamilyEnrich, Severity: SeverityError, Title: "Enrichment mirror file cannot be read"},
		{Code: CodeGenMirrorDrift, Family: FamilyEnrich, Severity: SeverityWarning, Title: "Enrichment mirror location no longer matches its source's computed per-family path"},
		{Code: CodeGenSourceMissing, Family: FamilyEnrich, Severity: SeverityError, Title: "Enrichment mirror breadcrumb points at a source file that no longer exists"},
		{Code: CodeGenTypeMissing, Family: FamilyEnrich, Severity: SeverityError, Title: "Enrichment mirror source no longer declares an imported type"},
	} {
		register(definition)
	}
}
