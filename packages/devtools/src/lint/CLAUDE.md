# Lint rules: the resolver decides, the plugin relays

Every lint finding mion reports is a diagnostic the Go resolver already emits. The rules in this
directory are transport: one resolver pass per linted file, then `diagnosticRouting.ts` fans the
wire diagnostics out to rules named for what they catch (`runtypes/*` for RunTypes, `@mionjs/*`
for mion's route rules, whose logic lives in `ts-go-runtypes/internal/compiler/routerrules`).
The same code paths run at build time, so the editor, the linter and the build never disagree.

## Adding a rule

1. Emit a diagnostic from the resolver, with a code in the Go catalog and a default level.
2. Add a row to `RULE_SPECS` in `diagnosticRouting.ts` (namespace, name, the codes it carries).
   The plugin objects, `configs.recommended` and the OXlint preset are built from that table.
3. Document it on the linter page (`container/website/content/01.rpc/06.devtools/01.linter.md`).

Never write a rule that inspects the AST on its own to answer a type or resolver question: it
would drift from the build. `enforce-type-imports` is the one hand-written rule, and only because
it is import hygiene the checker never needed; it takes its own options and stays out of
`recommended`. A rule that compares literals in a file (a `maxBodySize` against a platform
ceiling, say) is still a resolver diagnostic: the resolver sees the call site.

## Severity

The Go catalog has three levels: Error (the build produced no code, never downgradable),
RuntimeError (would throw at runtime, downgradable) and Warning. A finding that only a linter
should ever raise, with no effect on the build, has no level of its own yet; decide whether it
needs one before adding the first such diagnostic.
