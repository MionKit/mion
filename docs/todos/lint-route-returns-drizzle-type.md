---
type: feature
spec: guidelines
status: blocked
created: 2026-09-25
---

# Lint rule: a route should not return a drizzle type

## Intent

A mion route should return the mion model types (`InferSelectModel<Users>` from `@mionjs/drizzle-orm`,
or a hand-written table's models), never drizzle's own types. A route's return type is reflected
and reaches the client, and every client file that calls the route pays for that type.

Measured in `packages/private-drizzle-app` (its `reports/drizzle-app.md`): the same 12 routes per dialect,
typed three ways. Type instantiations in a client file that calls one route:

- params and return type written with the slim models: 1,000 to 3,900 (type-form tables the lowest);
- params typed with drizzle's types, return type inferred by drizzle: 18,500 to 21,200 (a transaction adds a
  one-time 85,000 or more to the first client file that reaches one);
- across the 12 routes: about 24,000 (type form) and 36,000 (builders) against 319,000 to 508,000 (drizzle).

MRT001 already asks every route for a return type, so the rule only has to catch drizzle types written into it.

`toDrizzle` rows now keep their column formats, so a queried row IS the mion model: the rule is only
about cost, never about lost formats. It is a warning that points at the cheaper type.

```ts
// warned: a type from drizzle-orm
getUser: mion.route(async (ctx, id: string): Promise<InferSelectModel<typeof users>> => ...)
// fine: the mion model type
getUser: mion.route(async (ctx, id: string): Promise<InferSelectModel<Users>> => ...)
```

## Direction

The implementer plans the details. What was checked:

- **A resolver diagnostic, not a hand-written lint rule.** Every mion lint rule is a Go resolver
  diagnostic routed to a rule by `packages/devtools/src/lint/diagnosticRouting.ts` (read
  `packages/devtools/src/lint/CLAUDE.md` first). The route rules live in
  `ts-go-runtypes/internal/compiler/routerrules/`; `checkReturnedErrorType` in `rules.go` already
  reads a handler's WRITTEN return type (awaited), which is the place to start. New `MRT` code in
  the Go catalog, one new case in `mionRouteFamily`, one `RULE_SPECS` row.
- **What counts as a drizzle type:** a type whose alias or declaration comes from the `drizzle-orm`
  package (`InferSelectModel` / `InferInsertModel` from `drizzle-orm`, `$inferSelect` /
  `$inferInsert`, a query result). A plain object with the same fields cannot be told apart and is
  not flagged. Decide whether nested members (an array of rows, a row inside an object) count.
- **Quiet by default, never affect the build.** Use the quiet-by-default mechanism the
  diagnostics-levels investigation picks (a lower level than Warning, and a setting for which levels
  the linter shows); this rule does not add a level of its own. Blocked until that lands.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md`: a new section under "mion Rules", next
to "Returned Error Types", plus a row in "Rule Summary". A one-line tip on the drizzle page
`container/website/content/01.rpc/04.drizzle-orm/00.drizzle-overview.md` pointing at the rule.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A route whose written return type is a drizzle type gets the finding in the linter and the editor
  when its level is shown, and the build never stops for it; a route returning the mion model type gets nothing. Go tests
  for both, and a lint test through the plugin.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
