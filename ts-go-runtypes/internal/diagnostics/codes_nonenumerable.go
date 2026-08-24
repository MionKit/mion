package diagnostics

// Non-enumerable-guard code (NExxx). Emitted by the resolver's syntactic scan
// of property declarations, no type resolution needed.
const (
	// CodeNonEnumerableRequiresOptional: a property tagged `@nonEnumerable` in
	// JSDoc is REQUIRED (no `?`). The runtime enumerability guard applies ONLY to
	// optional properties (the invariant GUARDED ⇒ OPTIONAL-in-type keeps
	// `DataOnly<T>` accurate: a guarded member is always one the type already
	// permits to be absent). So the tag on a required property is a no-op: the
	// property still serializes unconditionally. Error severity so the user fixes
	// the (silently ineffective) tag. Args: [propertyName].
	CodeNonEnumerableRequiresOptional = "NE001"
)

func init() {
	register(Definition{
		Code:     CodeNonEnumerableRequiresOptional,
		Family:   FamilyRunType,
		Severity: SeverityError,
		Title:    "@nonEnumerable requires an optional property",
	})
}
