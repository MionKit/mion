package diagnostics

// FriendlyText mirror-file codes (enrich-text-*): the FriendlyText half of a source type's two generated
// mirrors (labels + rt$errors templates, and the per-locale translation twins). Content validity
// comes from pkg/enrichment/validate.go, the enrich-text-* hygiene codes from the dirty-tag scan in
// pkg/enrichment/mirror/hygiene.go; all are opt-in (Request.CheckEnrich, `mion enrich
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
		{Code: CodeFriendlyUnknownField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText map names a field the type does not declare",
			Headline: "Unknown field `{field}`: the type does not declare it, so this FriendlyText entry is dead.",
			Summary:  "This FriendlyText entry names a field your type does not have: it was removed, renamed or misspelled. Its labels and messages are never used. Remove the entry, or run `mion enrich <source.ts> <Type> --update` so the file follows the type (a renamed field keeps its values).",
			Fix:      "mion enrich <source.ts> <Type> --update",
		},
		{Code: CodeFriendlyUnknownConstraint, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText rt$errors key is not a declared constraint of the field",
			Headline: "Error key `{key}` is not a declared constraint of this field: the message can never fire.",
			Summary:  "An `rt$errors` key must name a failure the field can produce: `type`, `rt$default`, or one of the field's format constraints (`minLength`, `pattern`, `min`, and so on). Any other key is never used. Remove the key, or add the matching constraint to the field's type format.",
			Fix: `interface User { name: string & FormatString<{minLength: 2}> }
export const friendlyUser: FriendlyText<User> = {
  name: {
    rt$errors: {
      minLength: 'Name needs at least 2 characters',
    },
  },
};`,
		},
		{Code: CodeFriendlyBadPlaceholder, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText error template uses an unknown $[…] placeholder",
			Headline: "Unknown placeholder `$[{placeholder}]`: expected one of `$[label]`, `$[val]`, `$[path]`, `$[index]`.",
			Summary:  "Error messages fill in only the four placeholders listed above; any other `$[name]` shows as plain text. A format suffix such as `$[val:currency]` is not supported either, since plain `$[val]` already formats by the field's type. Use a supported placeholder, or drop the `$[...]` wrapper.",
			Fix:      "rt$errors: {minLength: '$[label] is too short'}",
		},
		{Code: CodeFriendlyPluralNoOther, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText plural template is missing the mandatory 'other' arm",
			Headline: "Plural error template is missing the mandatory `other` arm: the render has no backstop.",
			Summary:  "A plural message shows the arm that matches the count, and every language falls back to `other`. Without `other`, some counts get no message at all. Add an `other` arm to the plural object.",
			Fix: `rt$errors: {
  minLength: {
    one: 'Needs one more character',
    other: 'Needs $[val] more characters',
  },
}`,
		},
		{Code: CodeFriendlyPluralBadArm, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText plural template arm is not a CLDR category",
			Headline: "Unknown plural arm `{arm}`: CLDR categories are `zero`, `one`, `two`, `few`, `many`, `other`.",
			Summary:  "Plural arm names must be CLDR plural categories. Any other name is never picked, in any language. Rename the arm to one of the six categories, or remove it.",
			Fix: `rt$errors: {
  minLength: {
    one: 'Needs one more character',
    other: 'Needs $[val] more characters',
  },
}`,
		},
		{Code: CodeFriendlyPluralNoCount, Family: FamilyEnrich, Level: LevelInfo, Scope: ScopeNotSource, Title: "FriendlyText plural template on a constraint that carries no count",
			Headline: "Constraint `{constraint}` carries no count: a plural template here has dead arms; use a plain string.",
			Summary:  "Only constraints with a count (`minLength`, `maxLength`, `min`, `max`, and so on) can pick a plural arm. On any other constraint, such as `pattern`, only the `other` arm is ever shown. Replace the plural object with a plain string.",
			Fix: `rt$errors: {
  pattern: 'Only letters and numbers are allowed',
}`,
		},
		{Code: CodeFriendlyDefaultNotAlone, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText rt$default is mutually exclusive with per-constraint messages",
			Headline: "`rt$default` is mutually exclusive with per-constraint messages; use one mode or the other.",
			Summary:  "An `rt$errors` object holds either one `rt$default` message for every failure, or one message per constraint. Mixing both leaves it unclear which message is shown. Keep `rt$default` alone, or keep the per-constraint keys and remove `rt$default`.",
			Fix: `rt$errors: {
  minLength: 'Name is too short',
}`,
		},
		{Code: CodeFriendlyReservedProp, Family: FamilyEnrich, Level: LevelError, Scope: ScopeNotSource, Title: "Type property collides with the reserved rt$ enrichment prefix (FriendlyText)",
			Headline: "Property `{property}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.",
			Summary:  "Keys starting with `rt$` (`rt$label`, `rt$errors`, `rt$items`, and so on) are reserved for enrichment settings, so `mion enrich` refuses a type with such a property and writes no FriendlyText file. Rename the property; a plain `$` prefix is fine.",
			Fix: `interface Config {
  $mode: string;
}`,
		},
		{Code: CodeFriendlyMissingConstraint, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "FriendlyText rt$errors has no message for a failure the field can produce",
			Headline: "Error key `{key}` has no message: this failure shows a generic one.",
			Summary:  "Each failure a field can produce needs its own `rt$errors` key, unless the record uses `rt$default`. A missing key shows a generic message for that failure. Add the key, or run `mion enrich <source.ts> <Type> --update` to add it as a blank to fill in.",
			Fix:      "mion enrich <source.ts> <Type> --update",
		},
		{Code: CodeFriendlyTodo, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled @todo scaffold placeholder in a FriendlyText mirror file",
			Headline: "Unfilled `@todo` placeholder; fill in the real labels/messages, then delete the `@todo` line.",
			Summary:  "`mion enrich` adds a `@todo` line to every new FriendlyText const it generates, and the const still holds empty values. Fill in the real labels and error messages, then delete the `@todo` line yourself (mion never removes it). `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
			Fix: `/** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */
export const friendlyUser: FriendlyText<User> = {
  name: {rt$label: 'Name'},
};`,
		},
		{Code: CodeFriendlyOrphanConst, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphan const carcass in a FriendlyText mirror file",
			Headline: "Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).",
			Summary:  "`mion enrich --update` (or the build plugin in dev) commented out this FriendlyText const because its type was deleted or renamed. The comment keeps your labels and messages. If the type is gone, run `mion enrich --prune` to remove it. If it was renamed, run `mion enrich <source.ts> <NewName> --update` to get your values back.",
			Fix: `# the type is gone
mion enrich --prune
# the type was renamed
mion enrich <source.ts> <NewName> --update`,
		},
		{Code: CodeFriendlyOrphanField, Family: FamilyEnrich, Level: LevelWarning, Scope: ScopeNotSource, Title: "Stale @rtOrphanChild field carcass in a FriendlyText mirror file",
			Headline: "Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).",
			Summary:  "`mion enrich --update` (or the build plugin in dev) commented out this field because your type no longer has it. The comment keeps your value. If the field is gone, run `mion enrich --prune`. If it was renamed, run `mion enrich <source.ts> <Type> --update`, and the value moves to the new field when the field's type did not change.",
			Fix: `# the field is gone
mion enrich --prune
# the field was renamed
mion enrich <source.ts> <Type> --update`,
		},
		{Code: CodeFriendlyBlankValue, Family: FamilyEnrich, Level: LevelWarning, Completeness: true, Scope: ScopeNotSource, Title: "Unfilled blank value in a FriendlyText mirror file",
			Headline: "Unfilled blank value: a scaffolded label or message is still empty; fill in the real text.",
			Summary:  "An empty string (`''`) in an `rt$label` or `rt$errors` slot is a generated blank, and it shows up empty in your UI. Deleting the `@todo` line alone is not enough: write the real label or message. `mion enrich --no-emit` reports it without failing, while `--require-complete` and production builds fail on it.",
			Fix: `export const friendlyUser: FriendlyText<User> = {
  name: {rt$label: 'Name'},
};`,
		},
	} {
		Register(definition)
	}
}
