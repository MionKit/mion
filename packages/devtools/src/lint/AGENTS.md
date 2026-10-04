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
3. Document the code where its feature is documented; the linter page lists the four rules, not the codes.

No check is ever written in the plugin: the four level rules are the only rules, and they read
nothing but the resolver's diagnostics. A rule that inspects the source on its own drifts from the
build, which never runs it. Import hygiene, a literal compared against a limit, anything: it is a
resolver diagnostic, because the resolver sees the file too.

## Severity

The Go catalog has four levels: Error (the build produced no code, never downgradable),
RuntimeError (would throw at runtime, downgradable), Warning, and Info (the documented behaviour,
or advice). The rules are one per level, never per topic: a lint rule has one severity, so each
level gets its own rule and the editor can never show a code at another level than the build.
Error goes to `mion/error`, RuntimeError to `mion/runtime-error`, Warning and every lowered error (a `@mion-downgrade-error` comment, or the
tsconfig `downgradeErrors` the `serve --sources ops` checker echoes on `scanFiles`) to
`mion/warning`, Info to `mion/info`, off by default like in the build. A project changes one finding
with the directive comments or the tsconfig, which the build reads too, never in the lint config.
