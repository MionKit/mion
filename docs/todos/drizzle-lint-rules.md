---
type: feature
spec: guidelines
status: ready
created: 2026-09-28
---

# Drizzle lint rules: no drizzle types in routes, no mixed drizzle imports

## Intent

Two rules that keep drizzle's heavy types out of an app's API and keep mion's drizzle surface and
drizzle apart, so people and coding agents always know which one to use.

1. **A route never takes or returns a drizzle type.** A route's params and return type are reflected
   and reach the client, and every client file that calls it pays for them. Measured in
   `packages/private-drizzle-example-app` (its `reports/drizzle-example-app.md`), per route in a client file:
   1,000 to 3,900 type instantiations with the slim models, 18,500 to 21,200 with drizzle's types.
   MRT001 / MRT002 already ask for written types; this rule checks where they come from.

   ```ts
   // flagged: types from drizzle-orm
   getUser: mion.route(async (ctx, id: string): Promise<typeof usersDb.$inferSelect> => ...)
   // fine: the slim model
   getUser: mion.route(async (ctx, id: string): Promise<typeof users.$inferSelect> => ...)
   ```

2. **A file never mixes mion's drizzle packages and drizzle.** The schema file (slim tables, their
   models) imports only `@mionjs/drizzle-orm*`; `toDrizzle` and everything derived from it (drizzle
   tables, relations, query-builder views, `db`, queries) live in a separate file that imports drizzle.
   In a project with a mion dialect package installed, importing a type drizzle also has in mion
   (`pgTable`, `InferSelectModel`, `$inferSelect` users...) from `drizzle-orm` is flagged, with a
   message naming the mion import to use.

## Direction

The implementer plans the details. What was checked:

- **Rule 1 is a resolver diagnostic.** Every mion route check is a Go diagnostic the linter reports
  under the rule of its level (read `packages/devtools/src/lint/CLAUDE.md` first). Route checks live
  in `ts-go-runtypes/internal/compiler/routerrules/`;
  `checkReturnedErrorType` in `rules.go` already reads a handler's written return type, the place to
  start. Params too. A drizzle type is one whose alias or declaration comes from `drizzle-orm`
  (`$inferSelect` / `$inferInsert` of a drizzle table, drizzle's `InferSelectModel`, a query result);
  decide whether nested members count. A plain object with the same fields is not flagged.
- **Rule 2 is an import check**, likely hand-written like `packages/devtools/src/lint/rules/enforce-type-imports.ts`
  (it reads import declarations, not types). Detect "a mion dialect is available" from the importing
  package's dependencies. Allow the one thing that must stay on drizzle in a mixed setting (a view
  built from a query builder, DRZ001) inside the drizzle file.
- **Level:** register rule 1's MRT code at `LevelWarning` or `LevelInfo`
  (`ts-go-runtypes/internal/diagnostics/catalog.go`); the level picks the lint rule. A Warning shows under
  `mion/warning` by default; an Info shows only once a project turns on `mion/info` (or sets `levels: 'all'`
  for the build). Neither halts. Rule 2 has no resolver code, so it is a hand-written rule like
  `enforce-type-imports`; decide whether `recommended` turns it on. Neither rule ever stops the build.
- **Split the files the rule will flag:** `packages/private-drizzle-example-app/src/db/*.{builders,types}.ts`
  put the slim schema and the `toDrizzle` side in one file; split each into a schema file and a db file
  (the `drizzle` variant files stay whole). Same for every example under
  `packages/private-examples/src/drizzle/` and the docs that import them; `test/routeVariants.ts` and
  the cost harness read these paths.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md`: a section for rule 1 under "Route Checks",
and rule 2 next to `enforce-type-imports` in "Lint Rules". `container/website/content/01.rpc/04.drizzle-orm/00.drizzle-overview.md`: the
schema file / query file split in "Building the Drizzle Table", and a one-line tip pointing at the rules.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A route whose written param or return type is a drizzle type gets rule 1 in the linter and editor; a
  route typed with the slim models gets nothing. Go tests for both, and a lint test through the plugin.
- A file importing both `@mionjs/drizzle-orm*` and `drizzle-orm`, or a drizzle type that mion also has,
  gets rule 2 with a message naming the fix. Lint tests for both.
- The reference app and every drizzle example keep the schema and the `toDrizzle` side in separate
  files, and lint clean.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
