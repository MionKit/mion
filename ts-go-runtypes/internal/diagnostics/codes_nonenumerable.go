package diagnostics

// Non-enumerable-guard code (NExxx), from a syntactic scan of property declarations, no type
// resolution needed.
const (
	// CodeNonEnumerableRequiresOptional: a property tagged `@nonEnumerable` in JSDoc is REQUIRED.
	// The runtime guard applies ONLY to optional properties (GUARDED ⇒ OPTIONAL-in-type keeps
	// `DataOnly<T>` accurate), so the tag is a no-op there and the property still serializes.
	// LevelWarning, not an error: the emitted function is correct, only the annotation is
	// ineffective. Args: [propertyName].
	CodeNonEnumerableRequiresOptional = "NE001"
)

func init() {
	register(Definition{
		Code:   CodeNonEnumerableRequiresOptional,
		Family: FamilyRunType,
		Level:  LevelWarning,
		Scope:  ScopeGraph,
		Title:  "@nonEnumerable requires an optional property",
	})
}
