---
type: chore
spec: guidelines
status: done
created: 2026-09-29
---

# Drop the "was removed, use X" hints for retired options

## Intent

The root CLAUDE.md rule "A removed thing leaves NO trace" says an old option name must fail like any
unknown name: no alias, no "was removed / use X instead" warning or error, no test for it, and no
comment naming the old name. A few places still do exactly that.

## Direction

The implementer plans the details. What was found:

- `ts-go-runtypes/cmd/mion/config.go`: `removedPluginKeys` maps `failOnError` and `parse` to
  "was removed" hints; `ts-go-runtypes/cmd/mion/main.go` prints them for a tsconfig mion entry.
  The `DowngradeErrors` field comment says "It replaced the boolean `failOnError`; see removedPluginKeys."
- `ts-go-runtypes/cmd/mion/buildconfig_test.go` asserts those hints.
- `ts-go-runtypes/internal/compiler/resolver/routerrulescheck_test.go` has a comment naming the
  plugins' `failOnError`.
- `packages/rpc-router/src/router.ts` throws "The syncRoutes option was removed: …" and
  "The skipClientRoutes option was removed: …".

Remove the hint tables, their callers and their tests, so an old key or option gets the same
treatment as any unknown one (the generic unknown-key warning in the CLI; whatever the router does
for an unknown option). Scrub the comments. Check docs and skills for the old names too.

## Done when

- No source, test, doc or skill names `failOnError`, the `parse` plugin key, `syncRoutes` or
  `skipClientRoutes` as a retired option (history stays in `docs/done/` and `CHANGELOG.md`).
- Go and JS tests pass.

## Plan, as built (2026-09-29)

- `cmd/mion/config.go`: deleted `removedPluginKeys` and the `DowngradeErrors` comment line naming it.
- `cmd/mion/main.go`: every unknown tsconfig key now takes the one generic
  "ignoring unknown mion plugin key(s)" warning.
- `cmd/mion/buildconfig_test.go`: deleted `TestRemovedPluginKeys`, plus the `cacheDir` block in
  `TestUnknownPluginKeys`, which pinned another removed key the same way. The typo case there
  already covers the generic warning.
- `routerrulescheck_test.go`: the comment no longer names the old plugin option.
- `rpc-router/src/router.ts`: dropped the two throws; an old option is now ignored like any other
  unknown key. Their two tests in `router.spec.ts` went with them.
- No doc, skill or website page named the old names.
- The overlapping items were removed from the broader compat-shims todo, which still owns the rest.
