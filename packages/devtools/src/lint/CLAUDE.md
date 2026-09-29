# Lint rules: the resolver decides, the plugin relays

Every lint finding mion reports is a diagnostic the Go resolver already emits. The rules in this
directory are transport: one resolver pass per linted file, then `diagnosticRouting.ts` sends each
wire diagnostic to the rule of its level (mion's route checks live in
`ts-go-runtypes/internal/compiler/routerrules`). The linter scans one file at a time, so a
whole-program finding (a batch id collision, a bundled-API check) only shows in the build.

## Adding a code

1. Emit a diagnostic from the resolver, with a code in the Go catalog and a level.
2. Nothing else here: the level picks the rule (`mion/error`, `mion/runtime-error`, `mion/warning`, `mion/info`), so a new
   code reaches the editor with no routing change.
3. Document the code where its feature is documented; the linter page lists the three rules, not the codes.

Never write a rule that inspects the AST on its own to answer a type or resolver question: it
would drift from the build. `enforce-type-imports` is the one hand-written rule, and only because
it is import hygiene the checker never needed; it takes its own options and stays out of
`recommended`. A rule that compares literals in a file (a `maxBodySize` against a platform
ceiling, say) is still a resolver diagnostic: the resolver sees the call site.

## Severity

The Go catalog has four levels: Error (the build produced no code, never downgradable),
RuntimeError (would throw at runtime, downgradable), Warning, and Info (the documented behaviour,
or advice). The rules are one per level, never per topic: a lint rule has one severity, so a rule
per topic let a lint config show a `warn` for a code that stops the build. Each level has its own rule, so
Error goes to `mion/error`, RuntimeError to `mion/runtime-error`, Warning and every lowered error (a `@mion-downgrade-error` comment, or the
tsconfig `downgradeErrors` the `serve --sources ops` checker echoes on `scanFiles`) to
`mion/warning`, Info to `mion/info`, off by default like in the build. A project changes one finding
with the directive comments or the tsconfig, which the build reads too, never in the lint config.
