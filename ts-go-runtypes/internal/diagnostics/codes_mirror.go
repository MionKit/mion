package diagnostics

// Mirror↔source linkage codes (enrich-mirror-*): a generated mirror file of either family still tracks a live
// source, meaning its breadcrumb resolves (enrich-mirror-source-missing), the source still declares the imported types
// (enrich-mirror-type-missing) and the file sits at its computed per-family location (enrich-mirror-moved, CLI-only: it needs the
// project's genDir config). Detection lives in internal/enrichment/mirror/drift.go.
//
// enrich-mirror-unreadable is LevelError: the mirror could not be read, so there is no output. enrich-mirror-source-missing / enrich-mirror-type-missing are
// LevelRuntimeError: the mirror is there and its `import type` names a file or type that no longer
// exists, so the app does not build. enrich-mirror-moved is cosmetic, the mirror still imports and works.
const (
	CodeGenMirrorUnreadable = "enrich-mirror-unreadable"
	CodeGenMirrorDrift      = "enrich-mirror-moved"
	CodeGenSourceMissing    = "enrich-mirror-source-missing"
	CodeGenTypeMissing      = "enrich-mirror-type-missing"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeGenMirrorUnreadable, Family: FamilyEnrich, Level: LevelError, Scope: ScopeNotSource, Title: "Enrichment mirror file cannot be read"},
		{Code: CodeGenMirrorDrift, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Enrichment mirror location no longer matches its source's computed per-family path"},
		{Code: CodeGenSourceMissing, Family: FamilyEnrich, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Enrichment mirror breadcrumb points at a source file that no longer exists"},
		{Code: CodeGenTypeMissing, Family: FamilyEnrich, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Enrichment mirror source no longer declares an imported type"},
	} {
		register(definition)
	}
}
