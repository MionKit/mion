package diagnostics

// Non-enumerable-guard code (data-*), from a syntactic scan of property declarations, no type
// resolution needed.
const (
	// CodeNonEnumerableRequiresOptional: a property tagged `@nonEnumerable` in JSDoc is REQUIRED.
	// The runtime guard applies ONLY to optional properties (GUARDED ⇒ OPTIONAL-in-type keeps
	// `DataOnly<T>` accurate), so the tag is a no-op there and the property still serializes.
	// LevelWarning, not an error: the emitted function is correct, only the annotation is
	// ineffective. Args: [propertyName].
	CodeNonEnumerableRequiresOptional = "data-non-enumerable-required"
)

func init() {
	Register(Definition{
		Code:     CodeNonEnumerableRequiresOptional,
		Family:   FamilyRunType,
		Level:    LevelWarning,
		Scope:    ScopeGraph,
		Title:    "@nonEnumerable requires an optional property",
		Headline: "Property `{property}` is tagged @nonEnumerable but is required: the guard only applies to optional properties, so the tag has no effect. Make it optional (`{property}?`) or remove the tag.",
		Summary:  "The `@nonEnumerable` tag skips a property that is not an enumerable own property of the value, but only when the property is optional. On a required property the tag is ignored and the property is always sent. Add `?` to the property, or remove the tag.",
		Fix: `interface Session {
  /** @nonEnumerable */ token?: string;
}`,
	})
}
