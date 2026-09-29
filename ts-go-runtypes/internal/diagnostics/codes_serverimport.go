package diagnostics

// Server import codes (SRVxxx), from the API type check: the type a client hands to `initClient<Api>()` names
// server code, so importing it as a value puts the server module in the client bundle.
//
// SRV001 is LevelRuntimeError: the bundle builds, but it carries the server module and everything it imports,
// which fails in a browser and exposes server code. `import type` is erased and costs nothing.
const (
	// CodeServerImportInClient: a name used in an `initClient` type argument is imported without `type`.
	// Args: [0] the imported name, [1] the import specifier.
	CodeServerImportInClient = "SRV001"
)

func init() {
	register(Definition{
		Code:   CodeServerImportInClient,
		Family: FamilyMarker,
		Level:  LevelRuntimeError,
		Scope:  ScopeNotSource,
		Title:  "The API type passed to `initClient` is imported as a value, so the server module ships in the client bundle",
	})
}
