package diagnostics

// MockData mirror-file codes (enrich-mock-*), the MockData twin of codes_friendly.go. Content validity
// comes from pkg/enrichment/validate.go, the enrich-mock-* hygiene codes from the dirty-tag scan;
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
	// CodeMockInvalidGenerator: a MockData `generator` that cannot mock its field, so createMockDataFn throws there.
	// Args: [generator, field path, the reasons joined].
	CodeMockInvalidGenerator = "enrich-mock-invalid-generator"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMockUnknownField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "MockData map names a field the type does not declare",
			Headline: "Unknown field `{field}`: the type does not declare it, so this MockData entry is dead.",
			Summary:  "This MockData entry names a field your type does not have: it was removed, renamed or misspelled. Its pool or range never feeds a mock. Remove the entry, or run `mion enrich <source.ts> <Type> --update` so the file follows the type.",
			Fix:      "mion enrich <source.ts> <Type> --update",
		},
		{Code: CodeMockReservedProp, Family: FamilyEnrich, Level: LevelError, Scope: ScopeNotSource, Title: "Type property collides with the reserved rt$ enrichment prefix (MockData)",
			Headline: "Property `{property}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.",
			Summary:  "Keys starting with `rt$` (`rt$items`, `rt$length`, `rt$optional`, and so on) are reserved for enrichment settings, so `mion enrich` refuses a type with such a property and writes no MockData file. Rename the property; a plain `$` prefix is fine.",
			Fix: `interface Config {
  $size: number;
}`,
		},
		{Code: CodeMockTodo, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled @todo scaffold placeholder in a MockData mirror file",
			Headline: "Unfilled `@todo` placeholder; fill in the real sample pools/ranges, then delete the `@todo` line.",
			Summary:  "`mion enrich` adds a `@todo` line to every new MockData const it generates, and the const still holds empty pools. Fill in realistic sample pools and ranges, then delete the `@todo` line yourself (mion never removes it). `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
			Fix: `/** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */
export const mockUser: MockData<User> = {
  name: {pool: ['Ada Lovelace', 'Linus Torvalds']},
};`,
		},
		{Code: CodeMockOrphanConst, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphan const carcass in a MockData mirror file",
			Headline: "Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).",
			Summary:  "`mion enrich --update` (or the build plugin in dev) commented out this MockData const because its type was deleted or renamed. The comment keeps your pools and ranges. If the type is gone, run `mion enrich --prune` to remove it. If it was renamed, run `mion enrich <source.ts> <NewName> --update` to get your values back.",
			Fix: `# the type is gone
mion enrich --prune
# the type was renamed
mion enrich <source.ts> <NewName> --update`,
		},
		{Code: CodeMockOrphanField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphanChild field carcass in a MockData mirror file",
			Headline: "Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).",
			Summary:  "`mion enrich --update` (or the build plugin in dev) commented out this field because your type no longer has it. The comment keeps your value. If the field is gone, run `mion enrich --prune`. If it was renamed, run `mion enrich <source.ts> <Type> --update`, and the value moves to the new field when the field's type did not change.",
			Fix: `# the field is gone
mion enrich --prune
# the field was renamed
mion enrich <source.ts> <Type> --update`,
		},
		{Code: CodeMockBlankValue, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled blank value in a MockData mirror file",
			Headline: "Unfilled blank value: a scaffolded sample pool or range is still empty; fill in real data.",
			Summary:  "An empty pool (`pool: []`) is a generated blank, so it mocks nothing. Deleting the `@todo` line alone is not enough: add realistic sample data. `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
			Fix: `export const mockUser: MockData<User> = {
  name: {pool: ['Ada Lovelace', 'Linus Torvalds']},
};`,
		},
		{Code: CodeMockInvalidGenerator, Family: FamilyEnrich, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "MockData generator cannot mock its field",
			Headline: "MockData generator `{generator}` cannot mock field `{field}`: {reason}",
			Summary:  "A MockData `generator` must name a known generator, sit on a string field, and fit that field's format: its length limits and characters, with no `allowedValues` beside it. A named format such as `Email` mocks itself and takes no generator. Otherwise `createMockDataFn` throws at that field.",
			Fix:      "name: {generator: 'fullName'}",
		},
	} {
		Register(definition)
	}
}
