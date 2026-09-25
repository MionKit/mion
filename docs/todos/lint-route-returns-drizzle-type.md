---
type: feature
spec: guidelines
status: ready
created: 2026-09-25
---

# Lint rule: a route should not return a drizzle type

## Intent

A mion route should return the mion model types (`InferSelectModel<Users>` from `@mionjs/drizzle-orm`,
or a hand-written table's models), never drizzle's own types. A route's return type is reflected
and reaches the client, and drizzle's types are expensive: its query types cost about 8,400 type
instantiations per file on their own, while the mion table type through `toDrizzle` costs about 410.
Measured on one five-column table, plain drizzle: `select` 8675, `insert` 9390, `update` 8424, all
three 10312. The rule is a warning that points at the cheaper type.

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
- **Warn by default, never affect the build.** The rule is on in the recommended config as `warn`.
  It must be lint-only: the build never prints it and it never stops one. The lint notes say a
  lint-only finding has no severity level yet; this rule is the first, so add that level (Go
  catalog + wire + routing) and document it there. `RuleSpec.default` needs no `off` for this rule.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md`: a new section under "mion Rules", next
to "Returned Error Types", plus a row in "Rule Summary". A one-line tip on the drizzle page
`container/website/content/01.rpc/04.drizzle-orm/00.drizzle-overview.md` pointing at the rule.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A route whose written return type is a drizzle type gets the warning in the linter and the editor,
  and the build prints nothing for it; a route returning the mion model type gets nothing. Go tests
  for both, and a lint test through the plugin.
- The lint-only level exists and is documented in `packages/devtools/src/lint/CLAUDE.md`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
