# Lint rules: the resolver decides, the plugin relays

- Every mion lint finding = a diagnostic the Go resolver already emits. Rules here are transport only.
- One resolver pass per linted file → `diagnosticRouting.ts` sends each wire diagnostic to the rule of its level.
- mion's route checks live in `ts-go-runtypes/internal/compiler/routerrules`.
- Linter scans one file at a time → whole-program findings (batch id collision, bundled-API check)
  show only in the build.

## Adding a code

1. Emit a diagnostic from the resolver, with a code in the Go catalog and a level.
2. Nothing else here: level picks the rule (`mion/error`, `mion/runtime-error`, `mion/warning`, `mion/info`).
   New code reaches the editor with no routing change.
3. Document the code where its feature is documented. Linter page lists the four rules, not the codes.

- NEVER write a check in the plugin. The four level rules are the only rules; they read only resolver diagnostics.
- A rule inspecting source on its own drifts from the build, which never runs it.
- Import hygiene, a literal vs a limit, anything → resolver diagnostic (resolver sees the file too).

## Severity

- Go catalog levels:
  - Error: build produced no code. Never downgradable.
  - RuntimeError: would throw at runtime. Downgradable.
  - Warning.
  - Info: documented behaviour, or advice.
- One rule per level, never per topic: a lint rule has one severity → editor never shows a code at another
  level than the build.
- Routing:
  - Error → `mion/error`.
  - RuntimeError → `mion/runtime-error`.
  - Warning + every lowered error → `mion/warning`. Lowered = a `@mion-downgrade-error` comment, or the
    tsconfig `downgradeErrors` the `serve --sources ops` checker echoes on `scanFiles`.
  - Info → `mion/info`. Off by default, like in the build.
- Change one finding via directive comments or the tsconfig (build reads both). NEVER in the lint config.
