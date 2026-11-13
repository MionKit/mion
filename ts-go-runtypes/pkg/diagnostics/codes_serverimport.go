package diagnostics

// Server import codes (rpc-client-*): a value import of the `initClient<Api>()` type pulls the server module into the client.
// rpc-client-imports-server-value is RuntimeError by policy, not Level's questions: without `verbatimModuleSyntax` the import may be dropped, but
// clients never import server code.
const (
	// CodeServerImportInClient: a name used in an `initClient` type argument is imported without `type`.
	// Args: [0] the imported name, [1] the import specifier.
	CodeServerImportInClient = "rpc-client-imports-server-value"
)

func init() {
	Register(Definition{
		Code:     CodeServerImportInClient,
		Family:   FamilyMarker,
		Level:    LevelRuntimeError,
		Scope:    ScopeNotSource,
		Title:    "The API type passed to `initClient` is imported as a value, so the server module ships in the client bundle",
		Headline: "`{name}` is passed to `initClient` but imported as a value from \"{module}\", which can put that server module in the client bundle; use `import type`.",
		Summary:  "The API type you pass to `initClient` comes from your server code. Imported without `type`, your bundler can ship that server module, the mion router and everything they import to the browser. It is an error even when your build would drop the import, because a client never imports server code. `import type` is always removed at build time.",
		Fix:      `import type {MyApi} from '../server/api';`,
	})
}
