package enrichment

// FriendlyTextName / MockDataName are the public ts-runtypes DSL type names an
// enrichment const is annotated with (`const x: FriendlyText<T> = {…}`).
// Shared by the mirror emitters (import header, const wrappers), the AST
// checkers (annotation detection), and the hygiene file guard, so the four
// never drift apart.
//
// FriendlyTypeName is the LEGACY spelling: `FriendlyText` was `FriendlyType`
// until the friendly-text rename. The generator now EMITS FriendlyTextName, but
// every recognizer accepts the legacy name too (see FriendlyWrapperNames) so
// committed mirrors migrate lazily — `gen --update` rewrites the annotation +
// the DSL import. Drop the legacy name after the deprecation window.
const (
	FriendlyTextName = "FriendlyText"
	FriendlyTypeName = "FriendlyType"
	MockDataName     = "MockData"
)

// FriendlyWrapperNames are every DSL type name recognized as the friendly-map
// annotation — the current name first, then legacy spellings kept only for
// lazy migration. Recognizers iterate this; emitters use FriendlyTextName.
var FriendlyWrapperNames = []string{FriendlyTextName, FriendlyTypeName}

// IsFriendlyWrapperName reports whether name is a recognized friendly-map
// annotation wrapper (current or legacy).
func IsFriendlyWrapperName(name string) bool {
	for _, candidate := range FriendlyWrapperNames {
		if name == candidate {
			return true
		}
	}
	return false
}
