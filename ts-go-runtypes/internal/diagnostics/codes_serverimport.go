package diagnostics

// Server import codes (SRVxxx): a value import of the `initClient<Api>()` type pulls the server module into the client.
// SRV001 is LevelRuntimeError by policy, not by the two questions: a transpiler without `verbatimModuleSyntax` drops a
// type-only-used import, but a client must never import server code, so it stops the build like a broken call.
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
