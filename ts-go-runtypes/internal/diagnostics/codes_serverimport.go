package diagnostics

// Server import codes (SRVxxx): a value import of the `initClient<Api>()` type pulls the server module into the client.
// SRV001 is RuntimeError by policy, not Level's questions: without `verbatimModuleSyntax` the import may be dropped, but
// clients never import server code.
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
