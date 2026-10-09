# diagnostics: Levels

Read before adding a diagnostic code or picking its Level.

## ⚠️ Every diagnostic declares its Level

- A code declares one of FOUR levels in [catalog.go](catalog.go). `register` panics without one.
- `Severity` is derived from the Level, never written.
- Why two error levels: "no code produced" and "code produced but broken" want opposite things from a consumer.
- Scope + `NestedExample` rules: [reflection/AGENTS.md](../reflection/AGENTS.md). Read before registering a code.

## Pick it: two questions, in order

1. If we let this through, does the build still produce the code for this?
2. If it does, is that code broken when it runs?

- No → `LevelError`.
- Yes and yes → `LevelRuntimeError`.
- Yes and no → `LevelWarning`.
- Yes and no, but the finding is documented behaviour or pure advice → `LevelInfo`.
  Documented behaviour, e.g.: a member with no data form left out.

## What each Level means

- `LevelError`: no code produced for the thing (no cache entry, no injected id, no extracted body, no batch id).
  - Consumer: stop. Never downgradeable, never silenceable.
  - A build halts. A dev server prints it + fails the transform of its file, so the overlay shows it.
- `LevelRuntimeError`: code IS written and it throws, or no longer checks what was asked for.
  - Consumer: report it. Every build lane halts (emitting + exiting non-zero is legitimate).
  - A dev server reports it and keeps running: the reason this level exists.
  - Stand one down: `downgradeErrors`, `@mion-expect-error` (removes it), `@mion-downgrade-error` (keeps it, no halt).
- `LevelWarning`: worth knowing, nothing wrong, output may surprise (a clone sharing a value, a tag doing nothing).
  - Consumer: report it.
- `LevelInfo`: the documented behaviour, or advice. Never halts.
  - Consumer: hide it unless asked.
  - Asked = `levels: 'all'` plugin option or tsconfig key in a build, `mion/info` rule in the editor.
  - A dev server never prints it.

## Gotchas

- Question 1 is per-SITE, not per-build. Only `config-tsconfig-not-loaded` stops a whole run.
  - Every other fatal code leaves ONE thing unbuilt; the rest of the build proceeds.
  - Still "no output" for that thing → standing it down is meaningless: not halting buys a call that throws anyway.
- Read the emit path, not the intent. Answer question 1 from what the code does.
  - Pure-fn family was documented as fatal as a block and mostly is not.
  - Only `purefn-destructured-param` withholds output; a purity violation compiles + ships the offending body.
- Client middleware never set up = `LevelRuntimeError`, optional params included:
  `rpc-client-middleware-not-set-up`, `rpc-client-optional-middleware-not-set-up`.
  - Call still sends, but the middleware never gets its client half. One like route sync refuses every call without it.
  - Middleware with no params and no headers: never reported (client picks up its answer without a hook).
  - Exception: mion's own metadata middleware.
  - Recognised by its `@mionjs/router` declaration (`apimeta.routerDeclares`).
  - In a published API's `.d.ts` (inlines its type): by its handler naming `@mionjs/core`'s `FetchMetadataHandler`
    (`publishedFetchMetadata`).
  - `useFetchMetadata` sets it up; the fetching check owns it instead.
  - `rpc-client-no-metadata-route`: the API places none.
  - `rpc-client-fetch-not-set-up`: a fetching client never calls `useFetchMetadata`.
- Permissive validator is wrong only when the type was not actually `any`.
  - Author wrote `any` → accept-everything validator, as asked.
    `validate-any-accepts-all` / `validation-errors-any-accepts-all` are Info.
  - Type BECAME `any` (a name, import or lib failed to resolve) → `LevelRuntimeError`:
    `marker-any-from-unresolved-import`, `marker-any-from-unresolved-name`, `marker-temporal-lib-missing`,
    `config-lib-missing-base`.
  - `detectSilentAnyInGraph` tells the two apart.
- `Completeness` is deliberately NOT a level.
  - Unfilled-scaffold codes are warnings (a mirror with blank labels still runs).
  - That bit is what `enrich --require-complete` + the bundler's production enrichment gate promote.
  - A gate keying on the level instead silently stops working.
