package diagnostics

// Mirror↔source linkage codes (enrich-mirror-*): a generated mirror file of either family still tracks a live
// source, meaning its breadcrumb resolves (enrich-mirror-source-missing), the source still declares the imported types
// (enrich-mirror-type-missing) and the file sits at its computed per-family location (enrich-mirror-moved, CLI-only: it needs the
// project's genDir config). Detection lives in pkg/enrichment/mirror/drift.go.
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
		{Code: CodeGenMirrorUnreadable, Family: FamilyEnrich, Level: LevelError, Scope: ScopeNotSource, Title: "Enrichment mirror file cannot be read",
			Headline: "Cannot read enrichment mirror file: {reason}",
			Summary:  "mion could not read this FriendlyText or MockData file, for example because of file permissions, a broken symlink, or another program writing to it at the same moment. Make the file readable, then run `mion enrich --no-emit` again.",
			Fix:      "mion enrich --no-emit",
		},
		{Code: CodeGenMirrorDrift, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Enrichment mirror location no longer matches its source's computed per-family path",
			Headline: "Mirror location drift: the source maps to `{expected}` but this file lives at `{actual}`; re-run `mion enrich` to relocate.",
			Summary:  "Each source file has one expected path per file kind under the enrich folder (`friendly/`, `mock/`, and one per translation locale). This file sits somewhere else, usually because you moved the source or changed `genDir`. Run `mion enrich <source.ts> <Type> --update` to write the files at the right paths.",
			Fix:      "mion enrich <source.ts> <Type> --update",
		},
		{Code: CodeGenSourceMissing, Family: FamilyEnrich, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Enrichment mirror breadcrumb points at a source file that no longer exists",
			Headline: "Breadcrumb source `{source}` no longer exists ({reason}): the mirror is orphaned; delete it or re-run `mion enrich`.",
			Summary:  "The `import type` line at the top of this file points to a source file that no longer exists, so its consts describe types that are gone. If you deleted the source, delete this file, its FriendlyText or MockData sibling, and any translation files. If you moved the source, run `mion enrich` on it at the new location, then delete the old files.",
		},
		{Code: CodeGenTypeMissing, Family: FamilyEnrich, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Enrichment mirror source no longer declares an imported type",
			Headline: "Source {source} no longer declares type `{type}`; re-run `mion enrich`.",
			Summary:  "This file imports a type your source file no longer declares (renamed or removed). Run `mion enrich <source.ts> <Type> --update`: it comments out the old consts as `@rtOrphan`, so your values stay. Then run `mion enrich --prune` to remove the ones that should not come back.",
			Fix: `mion enrich <source.ts> <Type> --update
mion enrich --prune`,
		},
	} {
		Register(definition)
	}
}
