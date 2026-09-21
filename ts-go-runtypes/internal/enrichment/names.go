package enrichment

// FriendlyTextName / MockDataName are the DSL type names an enrichment const is annotated with.
// FriendlyTypeName is the legacy spelling, accepted so old mirrors migrate lazily; drop after the deprecation window.
const (
	FriendlyTextName = "FriendlyText"
	FriendlyTypeName = "FriendlyType"
	MockDataName     = "MockData"
)

// FriendlyWrapperNames are the annotation names recognizers accept, current first; emitters use FriendlyTextName.
var FriendlyWrapperNames = []string{FriendlyTextName, FriendlyTypeName}

// IsFriendlyWrapperName reports whether name is a friendly-map annotation wrapper, current or legacy.
func IsFriendlyWrapperName(name string) bool {
	for _, candidate := range FriendlyWrapperNames {
		if name == candidate {
			return true
		}
	}
	return false
}
