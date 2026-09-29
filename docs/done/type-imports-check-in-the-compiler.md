---
type: chore
spec: guidelines
status: done
created: 2026-09-29
---

# Move the backend type-imports check into the compiler

## Intent

mion's lint plugin only shows the compiler's diagnostics: the compiler checks, the plugin displays.
One check still lives in the plugin itself, `mion/enforce-type-imports`, a hand-written ESLint rule
that flags a value import from backend code so server code stays out of the frontend bundle. It is
configured like a normal lint rule (a `backendSources` option), never runs in the build, and is the
only reason the plugin has a rule that is not a level. Move the check into the compiler so there is
one system: every finding is a compiler diagnostic, shown in the editor under its level rule and
reported by the build.

## Direction

The implementer plans the details. What was checked:

- **The check today:** `packages/devtools/src/lint/rules/enforce-type-imports.ts` (tests in
  `packages/devtools/test/lint/rules/enforce-type-imports.spec.ts`, registration in
  `packages/devtools/src/lint/index.ts`). It flags `import`, `export ... from` and side-effect
  imports whose source matches a `backendSources` regex, unless type-only, and offers an autofix to
  `import type`.
- **Where it goes:** a new diagnostic code in the Go catalog
  (`ts-go-runtypes/internal/diagnostics/`), raised per file from the scan, like the route checks in
  `ts-go-runtypes/internal/compiler/routerrules/` (`CheckSourceFile`). Pick its level with the two
  questions in `ts-go-runtypes/CLAUDE.md` ("Every diagnostic declares its Level"); the level picks
  the lint rule it shows under.
- **Where the setting goes:** `backendSources` moves to the tsconfig mion plugin block (read like
  `downgradeErrors`, `resolveBuildPlugin` in `ts-go-runtypes/cmd/mion/`, and echoed to the linter on
  `scanFiles`), so the editor and the build read the same list. No setting means no check.
- **The build reports it too:** a value import of backend code in a frontend build is a real problem,
  so the build prints it at its level like every other diagnostic.
- **The autofix:** a compiler diagnostic has no ESLint fixer today. Decide whether to carry a fix on
  the diagnostic (the message can name the exact `import type` line) or drop it.
- **Remove the plugin rule completely:** the rule file, its spec, its registration, the
  `@typescript-eslint/utils` dependency if nothing else uses it, the `enforce-type-imports` key in
  `rules`, and every mention. Per the root CLAUDE.md rule "A removed thing leaves NO trace": no alias,
  no "moved to" message, no test for the old name.
- **Update the CLAUDE.md lines that call it the one hand-written rule:** root `CLAUDE.md` (Lint
  bullet), `packages/devtools/CLAUDE.md` and `packages/devtools/src/lint/CLAUDE.md`. After this the
  plugin has exactly the four level rules, and the lint CLAUDE.md says no check may be written in the
  plugin.
- Tests: Go tests for the new code (flagged value import, type-only import passes, side-effect
  import, re-export, no setting means nothing), and one real oxlint run showing it under its level
  rule. Any fixture with a marker call follows the Marker test coverage rule (both `getRunTypeId`
  shapes).

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md`: the rules table loses the
`enforce-type-imports` row and the tip that contrasts it; the check gets a section under "Route
Checks" (or a new "Backend Imports" section) showing the tsconfig setting and the message.
`container/website/content/02.runtypes/08.diagnostics/02.all-diagnostics.md` lists the new code
(generated). `container/website/content/02.runtypes/01.introduction/04.configuration.md` lists the
new `backendSources` tsconfig key.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The plugin exports exactly `mion/error`, `mion/runtime-error`, `mion/warning` and `mion/info`, and
  nothing in `packages/devtools/src/lint/` inspects source on its own.
- A value import from a `backendSources` path is a compiler diagnostic, shown in the editor and
  reported by the build, with Go and oxlint tests.
- No file outside `docs/done/` and `CHANGELOG.md` names `enforce-type-imports`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan, compiler check anchored on initClient (approved 2026-09-29)

The approved plan dropped `backendSources` for a check with no setting: a client file is one that calls
`initClient` or imports one that does, server code is a module whose value imports reach `@mionjs/router` or a
platform package, and a value import of server code in a client file is flagged. Built and measured, it had two
problems: every file with a local import needed a compiler pass in the linter (173 timeouts over the repo), and
every test that starts a server and a client in one file was flagged, which stopped those test runs.

## What shipped (amended with the user, 2026-09-29)

The user narrowed the rule: only the type handed to `initClient` matters. There is no setting and no import-graph
walk.

- **`SRV001`** (`ts-go-runtypes/internal/diagnostics/codes_serverimport.go`, `LevelRuntimeError`, `FamilyMarker`):
  a name used in an `initClient<T>()` type argument (a type reference or a `typeof` query) whose import is not
  type-only. One report per import statement. Other server imports in the same file (a test starting the server)
  are never judged.
- **The check** lives in `ts-go-runtypes/internal/compiler/apiimports/`; `resolver/apiimportscheck.go` runs it on
  every `scanFiles` (linter, dev server) and on `generate` (build, `mion compile`). `apimeta.IsInitClientCall` is
  exported for it, so the call is matched by its declaring package, not its name.
- **No autofix**: the message names the fix (`use import type`).
- **Linter**: the plugin has exactly the four level rules; the rule file, its spec, its registration and the
  `@typescript-eslint/utils` / `@typescript-eslint/rule-tester` dependencies are gone. The prefilter admits a file
  naming `initClient` (`namesInitClient`), so lint time is unchanged.
- **Repo fixes the check found**: the rpc-client specs imported `TestServerApi` as a value; they now use
  `import type`.
- **Docs**: the linter page lost the old rule row and contrast, and gained an "API Type Imports" section; the
  diagnostics catalog lists `SRV001` under a new "Client imports" group.
- **Tests**: Go unit tests (type-only passes, every value shape flagged, other server imports ignored, one report
  per import, another package's `initClient` ignored, local types pass), resolver tests (scan and generate both
  report; `@mion-expect-error SRV001` silences it), prefilter and plugin tests, and a real oxlint run showing
  `[SRV001]` under `mion(runtime-error)`.

## Done when (as shipped)

- The plugin exports exactly `mion/error`, `mion/runtime-error`, `mion/warning` and `mion/info`, and nothing in
  `packages/devtools/src/lint/` inspects source on its own.
- A value import of the `initClient` API type is a compiler diagnostic, shown in the editor and reported by the
  build, with Go and oxlint tests.
- No file outside `docs/done/` and `CHANGELOG.md` names `enforce-type-imports`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
