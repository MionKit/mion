---
type: chore
spec: guidelines
status: done
created: 2026-09-29
---

# Move the client API type import check into the compiler

## Intent

mion's lint plugin only shows the compiler's diagnostics: the compiler checks, the plugin displays. One
check lived in the plugin itself, a hand-written ESLint rule configured with path patterns, which never
ran in the build. It is now a compiler diagnostic that needs no setting, so the editor and the build
report the same thing, and the plugin has only its four level rules.

The check reads the call, not folders: the type a client passes to `initClient<Api>()` comes from server
code, so the import that brings it in must be type-only. Only that import is judged, so a test that starts
a server and a client in one file is not flagged.

## What shipped

- **`SRV001`** (`ts-go-runtypes/internal/diagnostics/codes_serverimport.go`, `LevelRuntimeError`,
  `FamilyMarker`, `ScopeNotSource`): a name the `initClient` type argument is written with (a type
  reference or a `typeof` query, local type aliases followed) whose import is not type-only. `import`,
  `import * as`, default imports and `import x = require()` count. One report per import statement.
- **Level by policy**: a transpiler without `verbatimModuleSyntax` drops an import used only as a type, so
  the bundle may not actually carry the server module. It is a RuntimeError anyway, the user's call: a
  client never imports server code.
- **The check** is `apimeta.ApiTypeImports`, beside the `initClient` detection it builds on. It walks the
  type argument with the new `marker.EachWrittenTypeName`, which shares `EachWrittenTypeRef`'s walk and also
  visits `typeof` queries.
- **Where it runs**: `resolver.checkApiTypeImports` on every `scanFiles` (linter, dev server) and on
  `generate` (build, `mion compile`), through the per-file loop it now shares with the route rules
  (`checkEachFile`). A dependency's own source is dropped by TypeScript's external-library provenance.
- **No autofix**: the message names the fix (`use import type`).
- **Linter**: the plugin exports exactly `mion/error`, `mion/runtime-error`, `mion/warning` and
  `mion/info`. The rule, its spec, its registration and the `@typescript-eslint/utils` and
  `@typescript-eslint/rule-tester` dependencies are gone. No prefilter change: `@mionjs/client` depends on
  the marker package, so a file importing `initClient` already reaches the resolver.
- **Repo fixes the check found**: the rpc-client specs imported `TestServerApi` as a value; they now use
  `import type`.
- **Docs**: the linter page lost the old rule's row and the tip contrasting it. It explains how the linter
  works, not single rules, so `SRV001` is documented in the generated diagnostics catalog only, under a new
  "Client imports" group.
- **Tests**: Go tests in `apimeta` (type-only passes, every value shape flagged, local aliases followed,
  other server imports ignored, one report per import, another package's `initClient` ignored, local types
  pass); resolver tests (scan and generate both report, `@mion-expect-error SRV001` silences it, a
  dependency's source is not reported); the plugin rule list; and a real oxlint run showing `[SRV001]` under
  `mion(runtime-error)`.

## Out of scope

- Other value imports of server code in a client file.
- A fix channel for compiler diagnostics.

## Done when

- The plugin exports exactly the four level rules, and nothing in `packages/devtools/src/lint/` inspects
  source on its own.
- A value import of the `initClient` API type is a compiler diagnostic, shown in the editor and reported by
  the build, with Go and oxlint tests.
- No file outside `docs/done/` and `CHANGELOG.md` names the removed rule.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
