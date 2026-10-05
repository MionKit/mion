---
type: feature
spec: guidelines
status: done
created: 2026-09-28
---

# Drizzle lint rules: public types and isolated slim schemas

## Intent

Two rules that keep drizzle's heavy types out of an app's API and keep mion's drizzle surface and
drizzle apart, so people and coding agents always know which one to use.

1. **A route never takes or returns a drizzle type.** A route's params and return type are reflected
   and reach the client, and every client file that calls it pays for them. Measured in
   `packages/private-drizzle-example-app` (its `reports/drizzle-example-app.md`), per route in a client file:
   1,000 to 3,900 type instantiations with the slim models, 18,500 to 21,200 with drizzle's types.
   rpc-handler-missing-return-type / rpc-handler-missing-param-type already ask for written types; this rule checks where they come from.

   ```ts
   // flagged: types from drizzle-orm
   getUser: mion.route(async (ctx, id: string): Promise<typeof usersDb.$inferSelect> => ...)
   // fine: the slim model
   getUser: mion.route(async (ctx, id: string): Promise<typeof users.$inferSelect> => ...)
   ```

2. **A file defining slim schemas or models keeps database dependencies in a companion file.**
   Conversion, connections, relations and query-builder views belong in that companion.
   A query/router file may consume slim schemas and use Drizzle freely when its public types stay slim.
   Isolation protects clients importing model types directly.

## Direction

The implementer plans the details. What was checked:

- **Rule 1 is a resolver diagnostic.** Every mion route check is a Go diagnostic the linter reports
  under the rule of its level (read `packages/devtools/src/lint/AGENTS.md` first). Route checks live
  in `ts-go-runtypes/internal/compiler/routerrules/`;
  `checkReturnedErrorType` in `rules.go` already reads a handler's written return type, the place to
  start. Params too. A drizzle type is one whose alias or declaration comes from `drizzle-orm`
  (`$inferSelect` / `$inferInsert` of a drizzle table, drizzle's `InferSelectModel`, a query result);
  decide whether nested members count. A plain object with the same fields is not flagged.
- **Rule 2 is a compiler diagnostic**, raised for a locally authored schema/model and a resolved
  Drizzle dependency. No broad ban applies to query files importing existing slim schemas.
- **Level:** public Drizzle signatures use `LevelWarning`; schema/model isolation uses
  `LevelRuntimeError`, as explicitly approved by the user. Isolation stops production builds;
  the existing suppression and downgrade mechanisms remain available.
- **Split the files the rule will flag:** `packages/private-drizzle-example-app/src/db/*.{builders,types}.ts`
  put the slim schema and the `toDrizzle` side in one file; split each into a schema file and a db file
  (the `drizzle` variant files stay whole). Same for every example under
  `packages/private-examples/src/drizzle/` and the docs that import them; `test/routeVariants.ts` and
  the cost harness read these paths.

## Docs

`container/website/content/01.rpc/07.devtools/01.linter.md`: a section for each rule under "Route Checks". `container/website/content/01.rpc/05.drizzle-orm/00.drizzle-overview.md`: the
schema file / query file split in "Building the Drizzle Table", and a one-line tip pointing at the rules.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A route whose written param or return type is a drizzle type gets rule 1 in the linter and editor; a
  route typed with the slim models gets nothing. Frontend resolver tests for both, plus lint-plugin and real OXlint coverage.
- A file defining slim schemas/models alongside heavy Drizzle dependencies gets rule 2.
  Query files consuming existing models stay clean. Frontend tests cover the compiler and lint plugin.
- The reference app and every drizzle example keep the schema and the `toDrizzle` side in separate
  files, and lint clean.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.


## Approved Plan (5 October 2026)

Mode: Automatic. The user approved the refined plan and requested RuntimeError for schema/model isolation.

## Goal and agreed scope

Keep Drizzle's heavy type derivations out of the public types clients use. Add two compiler diagnostics, `rpc-handler-drizzle-type` and `rpc-handler-drizzle-import`, at `LevelWarning` for public types and `LevelRuntimeError` for schema/model isolation, through the corresponding existing level rules.

The warning checks written public route parameter and return annotations, including nested types and aliases. Parameters remain part of this same check from the original todo because clients also instantiate argument types. Context parameters are exempt.

A file defining light schemas/public slim models must keep Drizzle conversion and database types in a separate query/database file. This lets clients import model types directly without loading the database dependency graph.

A query or router file may import the light schema/models, call `toDrizzle`, use Drizzle types internally and declare routes returning slim models. Rule 1 checks its public signatures. Rule 2 checks local schema/model authoring, not the mere presence of an imported slim table/model.

Existing missing-annotation checks remain responsible for absent written returns/parameters. Do not add a second diagnostic to an unannotated return by inferring it.

## Investigation and performance evidence

Initial investigation: 48 fixtures across pg/mysql/sqlite and builders/types, checked in client-file, server-file and whole-program scopes. With slim public signatures, client-file instantiations were unchanged by joins, relations and local Drizzle types. Splitting schema/materialization did not improve those counts.

The follow-up puts the entire schema, conversion, relations, database setup, router initialization and handler into one virtual source file. It compares raw and baseline-subtracted counts with otherwise equivalent imported-schema cases, for all three dialects and both schema forms. All source and dependency diagnostics must be empty before trusting the comparison.

Artifacts:

- `/tmp/drizzle-cost-investigation.md` and its `.cjs`/`-final.json` companions: initial evidence.
- `/tmp/drizzle-single-file-investigation.cjs` and `.json`: follow-up code and measurements.
- `/tmp/drizzle-single-file-investigation.md`: completed readable follow-up report (all 60 fixtures had zero compiler errors; all 18 slim layout comparisons had identical raw client counts).

The measured benefit concerns TypeScript 6.0.3 semantic instantiations needed to check the client file. A complete source-program check still checks server bodies, and imports can still load the Drizzle source graph. Do not claim free parsing/binding, lower memory, or native-checker timings. The schema isolation diagnostic has a separate goal: keeping directly imported model modules isolated from heavy database dependencies.

## Direct model-import follow-up evidence (5 October 2026)

Tested 12 fixtures: pg/mysql/sqlite × builders/types × mixed-schema/database/router or isolated-slim-schema. The client directly imports `User` and reads `user.name`; it does not import or call the API. All source/dependency diagnostics were empty.

For pg builders, the mixed file and isolated schema both cost 941 client-file instantiations. However:

| Metric | Mixed schema/db/router file | Isolated slim schema |
| --- | ---: | ---: |
| Source files loaded | 605 | 259 |
| Real Drizzle files loaded | 300 | 0 |
| Whole-program semantic instantiations | 70,347 | 36,586 |

Across every dialect/schema pair, isolated schemas loaded zero Drizzle files. Mixed files loaded 300 or 301. Client-only instantiations stayed equal; whole-program checking was lighter for every isolated schema. This supports the user's dependency-isolation reason for rule 2. File count is not a measured memory or elapsed-time result.

Artifacts: `/tmp/drizzle-direct-model-import-investigation.cjs`, `.json` and `.md`.

## Severity decision (approved user direction)

Schema/model isolation uses `LevelRuntimeError`: the user wants to block schema modules carrying server/database dependencies that a browser consumer could import. The file split protects direct model imports and the existing downgrade/suppression mechanisms remain available.

Public Drizzle signature types remain `LevelWarning` unless the severity review finds proven emitted-runtime breakage. They increase client type work but structurally valid row models can still validate/serialize correctly. The existing missing-type and unsupported-data diagnostics handle distinct broken cases.

The user explicitly overrode the earlier warning-only recommendation for schema isolation and approved Automatic implementation. No further plan approval is required.

## Behavior

### Rule 1: Drizzle types in handlers

1. Reuse handler discovery for route, query, mutation, middleware and headers middleware. Context parameters remain exempt according to `ctxParams`.
2. Check only written public parameter annotations and written return annotations. Missing annotations remain the responsibility of existing checks.
3. Check aliases, imports/re-exports, `$inferSelect`, `$inferInsert`, `InferSelectModel`, `InferInsertModel`, and explicitly annotated query-result aliases such as `Awaited<ReturnType<typeof query>>`.
4. Nested members count. Traverse unions, intersections, arrays, tuples, generic arguments, property values and index signatures with cycle protection. Include syntax provenance for local aliases and type queries where checker normalization erased the origin.
5. A written projection such as `DrizzleUser['id']` still depends on the Drizzle model and warns, even if the resolved leaf is a primitive. A separately written `string` does not warn.
6. Report once per offending parameter/return annotation. Include whether the issue is a parameter or return and suggest the slim model or a written public object type.
7. Anchor on the annotation's first token. For a handler declared in another file, anchor on the importing route's handler reference, as existing checks do.
8. Do not descend indiscriminately into a handler body's implementation and flag ordinary database queries. Follow only declarations required to establish the public type's derivation. Do not treat passing a slim model through a query function as proof of Drizzle provenance.

Implementation approach: a dedicated provenance visitor in `routerrules/drizzletypes.go`, reusing checker symbol/module helpers and syntax child visitation. A coverage test documents all dispatched syntax/checker kinds and fails when a handled kind is missing from the table. New traversal must follow the Go visitor requirements in `ts-go-runtypes/AGENTS.md`.

#### Identification mechanism: declaration provenance, with a syntax fallback

The positive evidence is a resolved declaration belonging to the `drizzle-orm` package, or an actual type derivation reaching such a declaration. There is no shape comparison, list of suspicious type names, directory-name heuristic, or extra brand added to user types.

**A. Establish package identity from a declaration.**

- Resolve a referenced identifier or qualified name with `typeChecker.GetSymbolAtLocation`; follow import/re-export aliases with `GetAliasedSymbol` / the existing immediate-alias helper.
- Check the resolved symbol's declarations using `marker.DeclaredInModule(symbol, "drizzle-orm", markerOpts.FS)`.
- That helper checks the nearest package.json's `name` above the declaration's source file. A declaration inside `drizzle-orm/pg-core` belongs to the same `drizzle-orm` package regardless of where pnpm or a workspace stores it.
- For ambient declarations, also accept enclosing module names exactly `drizzle-orm` or beginning `drizzle-orm/`. The existing exact-module helper alone does not cover an ambient dialect subpath; use `marker.DeclaringModuleOfNode` for that case.
- Imports from `@mionjs/drizzle-orm` and its dialect packages have different package identities and do not match. A user's type called `InferSelectModel`, `PgTable` or `DrizzleUser` does not match by name.

**B. Inspect the checker type while its origin metadata remains.**

For each annotated type, resolve it with `checker.Checker_getTypeFromTypeNode`. The cycle-protected visitor checks:

- `checker.Type_alias(t).Symbol()`, when present, and the alias's `TypeArguments()`;
- `checker.Type_symbol(t)` and the reference `Target()` where applicable;
- union/intersection members, instantiated generic arguments, tuple/array elements, property value types and index-signature value types;
- declarations carried by property symbols when a mapped result's root symbol is anonymous, and the constituent value types rather than merely the property spelling.

A package check uses declaration ownership. For example, `$inferSelect` is not classified because its spelling begins with `$infer`; the checker resolves the member/table declaration and its generic target to the real package. A local property with that spelling is not Drizzle evidence.

Do not recursively inspect unrelated methods or every internal member of a table/query builder after finding evidence. Stop on the first proven origin for the public annotation and emit one warning.

**C. Walk written type syntax before simplification erases its dependencies.**

The original annotation remains available even when the checker simplifies the type to `{ id: string }` or `string`. Use a separate cycle-protected declaration visitor, with these explicit edges:

| Syntax or declaration | Follow | Stop condition |
| --- | --- | --- |
| `TypeReference` | Resolve the complete type name; check its declaration owner; follow a local type alias body or interface type members/heritage, plus written type arguments. | Stop following a declaration already visited; do not expand unrelated package implementation bodies. |
| Indexed access, e.g. `DrizzleUser['id']` | Visit the written object-type operand as well as the index type. | A simplified primitive result does not discard the operand's provenance. |
| `TypeQuery`, e.g. `typeof usersDb.$inferSelect` | Resolve the complete queried name/member, its symbol and checker type, then the variable/property declaration needed for that value's type. | A direct declaration/type-origin match is enough; do not inspect unrelated statements. |
| Local variable with a written type | Visit its written annotation. | That public annotation defines the boundary; do not infer provenance from its initializer behind an explicitly plain/slim type. |
| Local variable without a written type | Inspect its inferred checker type; if metadata is insufficient, inspect its initializer's type-producing expression. | A handwritten object literal's declared shape is not classified just because an implementation value came from a database. |
| Function queried by `ReturnType<typeof query>` | Resolve call signatures using `Checker_getSignaturesOfType` and `GetReturnTypeOfSignature`; if the function has a written return annotation, visit that annotation. | A written slim/plain return annotation ends the trace; the function may freely call Drizzle internally. |
| Local function with an inferred return type | Inspect inferred return metadata and the expressions of its own return statements (or arrow expression), following await/parentheses, returned variable references and the selected call signature's return type. | Do not visit arbitrary statements as provenance; skip nested functions' returns. A reference to Drizzle merely elsewhere in the body is not evidence. |
| Union, intersection, array, tuple, object member, index signature, conditional or mapped written type | Visit type-bearing children with `ForEachChild`; resolve references encountered through the same rules. | Primitive/literal type nodes have no origin dependency. |

When a returned expression is a Drizzle query call and the normalized result is anonymous, its resolved query signature/receiver and type derivation provide the evidence. This applies only when tracing an inferred return or queried value; a method call in an unrelated function statement is never enough to mark the public type. Utilities such as `Awaited` and `ReturnType` are not themselves Drizzle declarations; their written operands provide the relevant origin.

`marker.EachWrittenTypeRef` is useful precedent but is not sufficient unchanged: its existing walker follows type references, skips installed-package declarations and does not follow the value/function declarations behind `typeof`. Keep this additional traversal local to the new check unless a tested shared extension is necessary.

**D. Retain a short evidence chain.**

The visitor returns an optional origin record, for example `return annotation -> User -> usersDb.$inferSelect -> drizzle-orm table declaration`. Include the first useful public name in the diagnostic; retain the declaration/source chain for assertions and debugging. Do not report a match without a concrete resolved origin or supported derivation edge.

Examples the mechanism must distinguish:

```ts
type DbUser = typeof usersDb.$inferSelect; // Trace member/table declarations to drizzle-orm.
type Wrapped = { user: DbUser };          // Follow the written member and alias.
type Id = DbUser['id'];                   // Follow the written object operand before reduction.
type Result = Awaited<ReturnType<typeof query>>; // Follow query's public return derivation.
type PublicUser = { id: string };         // No Drizzle declaration dependency.
type SlimUser = typeof users.$inferSelect; // Declaration/type derivation belongs to mion's schema.
```

**Limits and proof required.** TypeScript structural types are not universally tagged with their history. A dependency can publish `declare function query(): Promise<{ id: string }>` with no Drizzle reference and no implementation; the consumer compiler cannot recover whether the author used Drizzle internally. Treat that as a plain public type, not a guessed Drizzle match. Likewise, a written plain/slim public annotation is an intentional boundary.

Real `$inferSelect`/`$inferInsert` and inferred local query fixtures must prove the metadata and fallback paths before completion. No modification to the off-limits checker submodule is planned. If an intended positive case still has no usable evidence in the current checker, report that concrete case and amend the plan rather than replacing provenance with a shape/name guess.

### Rule 2: keep authored slim schemas/models free of Drizzle dependencies

Purpose: a client importing `User` directly should load the light schema/model module without loading materialized tables, database setup, query builders or Drizzle declarations.

1. Detect local authoring of a recorded table/view/schema/enum, a type-road schema, or a slim public model derived from such a schema. Resolve builder/type symbols to the supported mion packages; do not match function spelling alone. Merely importing an existing slim table/model into a query file is not authoring.
2. In that schema/model-authoring file, diagnose an import from `drizzle-orm` or its subpaths, an import from a mion dialect's exact `/drizzle` bridge, a resolved `toDrizzle` call, or a written type that depends on a Drizzle declaration (including through a local barrel).
3. A bridge import in a schema-authoring file is a dependency even when unused. A same-named user function is not the mion conversion bridge. Aliases/namespace access must resolve to the actual declarations.
4. Put recorded schemas and slim model definitions in the schema file. Put conversion, real Drizzle tables/views, relations, database setup, query types and queries in the companion file.
5. Allow the companion to import slim schemas/models and `toDrizzle` together with Drizzle. Ordinary route handlers can query that companion and expose slim written signatures.
6. Query-builder views stay in the Drizzle/query file, using materialized tables. No replacement warning for legitimate Drizzle query-side imports and no project-wide dependency-manifest recommendation is planned.
7. Reuse declaration provenance from rule 1 for heavy written types. Use AST child visitors for direct module dependencies and repeated/type-only imports. Keep all authoritative classification in Go.

Proposed message:

> This file defines a slim schema/model and imports Drizzle database types or calls toDrizzle. Move conversion and Drizzle code to a separate database/query file so clients can import the slim models without loading those dependencies.

Anchor on the offending import, re-export or import-type dependency in the authored schema/model file. Deduplicate overlapping import/call/type evidence for the same offending dependency. The public-type warning leaves builds running. Schema isolation is RuntimeError and blocks builds unless explicitly suppressed/downgraded; compiled output can still be produced.

### Exact frontend schema-isolation tests: `packages/drizzle-orm/test/lintImports.spec.ts`

| Case | Input | Required assertion |
| --- | --- | --- |
| `SchemaIsolation_Conversion` | Locally authored slim table plus actual toDrizzle call, with no direct Drizzle import | Schema RuntimeError with move-to-query-file explanation and direct-client-import reason. |
| `SchemaIsolation_Imports` | Slim schema/model plus root/dialect/driver Drizzle import, including type-only and repeated imports | RuntimeError at dependency import; actual module identity and correct source span. |
| `SchemaIsolation_BridgeImport` | Slim schema plus unused or used conversion-bridge import | RuntimeError because the import introduces heavy dependencies. |
| `SchemaIsolation_ModelOnly` | Separate module defines a slim inferred/refined public model but imports a materialized Drizzle table/type | RuntimeError; importing only existing slim models into an ordinary query file remains allowed. |
| `SchemaIsolation_QueryFile` | Imported slim users/User plus toDrizzle, driver, runtime SQL, relations, query-builder view and queries | No schema-isolation RuntimeError; no false replacement advice. |
| `SchemaIsolation_RouterBody` | Router imports slim models and a database companion; handler uses Drizzle types but exposes slim annotations | Neither diagnostic reports. |
| `SchemaIsolation_AllInOne` | Locally creates schema, converts, creates database and defines a slim-returning route in one file | Schema-isolation RuntimeError only; public-type warning remains absent. |
| `SchemaIsolation_Aliases` | Aliased/namespace builders and converter, and local barrels | Real local authoring/conversion is recognized; a same-named user builder/converter does not match. |
| `SchemaIsolation_AllDialectsAndTypeRoad` | pg/mysql/sqlite, builders and authored table types | Equivalent role classification and RuntimeError behavior for all six forms. |
| `SchemaIsolation_HeavyTypeViaBarrel` | Slim model file's written alias resolves to Drizzle through a local module | RuntimeError based on declaration provenance, not import spelling. |
| `SchemaIsolation_NoDuplicates` | One schema dependency appears as import, conversion call and inferred table type | No repeated warning for the same conflict. |

Add direct-import cost/graph regression cases to the frontend performance suite. Assert zero Drizzle sources when directly importing from an isolated slim schema, and the expected presence in the deliberately mixed control. Keep the API-client instantiation equality test; it covers rule 1's separate purpose.

## Compiler/editor integration

Expose `CheckDrizzleSourceFile` beside the existing route-rule entry. Its public-type check reuses checker-based handler discovery and reads public annotations. Its separate schema-isolation pass classifies authored schemas/models and their dependencies in every admitted source file. Invoke both checks in this diagnostic pass from scanFiles, transform and whole-program generate diagnostic assembly; preserve the current opt-in for existing lint-only route errors. Filter dependency-owned file diagnostics through the existing provenance convention.

No source classification or import inspection is added to the lint plugin. The plugin transports both Go diagnostics by their levels. Do not add a topic-specific rule export or new protocol flag.

Route admission uses marker/router gates. Add permissive schema-authoring admission to the lint and bundler prefilters where needed, and prove that a schema-only file with no router/marker call reaches the compiler. Also test aliases and local barrels. JS admission never decides a violation.

Rule 1 prose recommends the light row model or a written plain public type. Rule 2 prose explains moving database implementation out of the schema/model module for direct client model imports.

## Exact test plan

The names below are proposed Vitest case identifiers, not claims that they already exist. User preference: diagnostic behavior belongs in the frontend test suite. Do not duplicate these cases in Go.

Test placement is the root Drizzle package because its `vitest.config.ts` includes `test/**/*.spec.ts` without running the marker transform over the test implementation. Existing dialect integration tests already instantiate `ResolverClient` from devtools source and send fixture sources to the real Go binary. Use that established pattern here; fixtures can cover all three dialects from one suite.

Create `packages/drizzle-orm/test/lintFixture.ts` as a shared harness:

- Start the real built `mion-bin/mion` through `ResolverClient`, not a mock checker or mock diagnostic array.
- Supply fixture files and package manifests with `setSources`; use real workspace slim packages and the installed real `drizzle-orm` for the difficult provenance cases. Use small virtual declarations only for deliberate identity/manifest edge cases.
- Use fixture paths with an explicit package boundary so dialect-dependency tests do not accidentally inherit the root package's manifest. Exercise changing overlays in the same session for the cache regression.
- Expose scan (with/without `checkRouterRules`), transform (both modes) and generate operations; always close clients and remove temporary disk fixtures.
- Assert code, level, argument/fix text, file path, start/end line and column, and warning count from actual compiler responses.
- Fail clearly if the required binary is missing during the feature gate; do not let the new acceptance suites quietly skip the diagnostics they are meant to verify.
- Keep intentionally invalid route text in fixture strings. The test file itself must remain typecheck/lint clean.

No new package dependency is needed: the workspace has the compiler, devtools and Drizzle packages already. The recorder package's runtime source continues to avoid importing real Drizzle.

### TypeScript route/provenance tests: `packages/drizzle-orm/test/lintTypes.spec.ts`

| Proposed test | Input | Required assertion |
| --- | --- | --- |
| `TestDrizzleHandlerTypes_RealModels` | Real pg/mysql/sqlite Drizzle table `$inferSelect` return and `$inferInsert` parameter, separately | One warning at each written annotation; correct code, warning level and source span. |
| `TestDrizzleHandlerTypes_ModelHelpers` | Drizzle `InferSelectModel`/`InferInsertModel`, renamed imports and namespace-qualified names | All detected; message identifies the public annotation. |
| `TestDrizzleHandlerTypes_SlimAndPlain` | Real slim builders/type-road models; a handwritten identical object; handwritten primitive projection | No Drizzle-type warning. |
| `TestDrizzleHandlerTypes_Nested` | Drizzle model under a member, array, tuple, Promise, union, intersection, generic wrapper and index signature | One warning per annotation, including one and two levels of nesting. |
| `TestDrizzleHandlerTypes_AliasesAndBarrels` | Local aliases, imported aliases, re-exported models, interface extension, `DrizzleUser['id']` | Origin remains detectable; a same-named local type is accepted. |
| `TestDrizzleHandlerTypes_QueryResults` | Real query aliases with `Awaited<ReturnType<typeof query>>` and `typeof queryResult` | Drizzle-derived public results warn; an explicitly slim-typed query function does not. |
| `TestDrizzleHandlerTypes_ErasedPublicBoundary` | Published declaration returning only `Promise<{id: string}>`, and a local function explicitly returning that shape while querying Drizzle internally | No warning: there is no public Drizzle type dependency to prove. |
| `TestDrizzleHandlerTypes_IdentityNotSpelling` | User-defined `PgTable`, `InferSelectModel` and `$inferSelect`; ambient `drizzle-orm/pg-core`; real Drizzle declaration under a nonstandard install path | Same-named user declarations stay clean; genuine ambient/installed declarations match by ownership. |
| `TestDrizzleHandlerTypes_OnlyReturnDerivation` | Local inferred-return function that queries Drizzle but returns a handwritten object, alongside one that directly returns the query result | First stays clean; second warns. Unrelated and nested callback return statements do not taint the first. |
| `TestDrizzleHandlerTypes_Recursive` | Recursive wrapper with a nested Drizzle member; recursive plain wrapper | Terminates; first warns once, second stays clean. |
| `TestDrizzleHandlerTypes_HandlerForms` | Inline helper, alias/namespace helper, named local function, external function, typed handler and JSDoc handler | Discovered through existing mechanisms; external report stays in requested file. |
| `TestDrizzleHandlerTypes_ContextAndMissingAnnotations` | Drizzle-typed context only, exempt headers context, unannotated public return | No added context/inferred-type warning; existing missing-annotation check unchanged. |

Use both small virtual declarations supplied through the TypeScript harness for isolated cases and real workspace slim packages plus installed real Drizzle for provenance-erasure cases. A passing synthetic alias test alone does not satisfy the feature.

### TypeScript resolver integration: `packages/drizzle-orm/test/lintProtocol.spec.ts`

- `TestDrizzleWarnings_ScanTransformGenerate`: scan without `CheckRouterRules`, scan with it, transform and generate return identical public-type and schema-isolation RuntimeErrors for user-owned input, including a schema-only fixture with no route/marker calls. Existing opt-in route errors remain absent without the flag. No doubled diagnostics when the flag is present.
- `TestDrizzleWarnings_Directives`: a supported suppression directive hides only its named warning at its proper source location. Wrong code and unrelated declarations remain reported.
- `TestDrizzleWarnings_ExternalLibraries`: user route depends on a third-party model and warns at its annotation; unrelated dependency-owned mixed schema sources do not generate user-actionable file warnings.
- `TestDrizzleWarnings_NonFatal`: warning diagnostics leave transformed/generated output present and compilation successful.

### One Go structural guard, not a diagnostic behavior suite

Create `ts-go-runtypes/internal/compiler/routerrules/drizzlevisitor_test.go` with type-node dispatch, syntax dispatch, schema-surface and checker-child-slot guards. It checks the internal visitor dispatch against its kind-coverage table, as required by `ts-go-runtypes/AGENTS.md`. The resolver protocol does not expose dispatch arms, so a black-box TypeScript test cannot directly make this assertion. Deliberately remove a coverage row once and confirm the guard fails. All positive/negative errors, warnings, nesting, identities, directives and integration cases stay in TypeScript.

### JS lint and build tests

- `packages/devtools/test/eslint/plugin.test.ts`: run public-type fixtures through the real resolver binary and plugin; assert code, `warning` routing, fix text and exact line/column. Clean slim routes and bridge query files produce no warning. Include a single-file schema/conversion/router fixture with a slim public signature: assert no public-type warning and exactly the expected schema-isolation RuntimeError.
- `packages/devtools/test/eslint/routing.test.ts`: the public-type code routes to `mion/warning` and schema isolation to `mion/runtime-error` through their level, with no topic-specific rule.
- `packages/devtools/test/eslint/oxlint-e2e.test.ts`: actual OXlint run reports the public-type code through the warning rule and exits successfully when there are only warnings.
- `packages/drizzle-orm/test/lintProtocol.spec.ts` exercises both transform modes using the same real fixtures as scan and generate.

### Performance regression and reference app

Create `packages/private-drizzle-example-app/test/publicTypeBoundary.compile.test.ts` based on the follow-up investigation. It covers imported-schema and all-in-one-file layouts for every dialect and schema form, with:

1. Slim public types and an empty handler.
2. Slim public types and an ordinary select.
3. Slim public types and joins, relation queries and internal Drizzle type aliases.
4. A written return through the materialized table's `$inferSelect`.
5. A query-inferred return.

Assert zero TypeScript errors, equal client counts between imported and all-in-one slim cases, and no client count increase from adding the heavy body while holding public types constant. Keep raw counts as well as deltas so baselines cannot hide layout overhead. Compare heavy public-reference and inferred-return controls against the light cases. Measure server/whole-program scopes separately and label them accurately.

Use the real TypeScript compiler with the repository's `source` conditions, Node types and `noImplicitAny:false`. No mocked type counts or hand-authored nominal stand-ins for the cost assertion.

Run existing reference app schema, route-file, full-stack and cost tests. Split the builders/types reference schemas from conversion/database companions. Preserve the intentionally plain-Drizzle controls. Suppress the new warning explicitly only in those control routes; do not change their signatures to make the comparison pass. Their schemas remain whole.

## Fuzzing decision

Recommendation: no new fuzz suite. The difficult question is whether a real checker retains or erases public-type provenance. Random object generation lacks an independent cheap oracle for that question; determinism would also pass for a consistently missed type.

Use the deterministic provenance/wrapper/dialect matrix, real query fixtures, recursive cases and the internal visitor-coverage guard. If fuzzing is requested, invoke fuzzy-testing for its separate discovery and approval workflow before adding a suite.

## Complete planned file inventory

Paths are relative to `/workspace/mion`. Implementation changes start only after approval.

### Compiler

Modify:

- `ts-go-runtypes/internal/compiler/resolver/routerrulescheck.go`: advisory per-file wrapper and external-library filtering.
- `ts-go-runtypes/internal/compiler/resolver/dispatch.go`: scan/transform/generate integration, without enabling old route errors or doubling warnings.
- `ts-go-runtypes/internal/diagnostics/codes_mionroute.go`: code, family, Warning/RuntimeError levels and source scopes.
- `ts-go-runtypes/internal/diagnostics/messages.go`: headline/fix argument templates.
- `ts-go-runtypes/internal/diagnostics/prose.go`: summary and fix templates; package-dependent examples stay in real frontend fixtures.

Create:

- `ts-go-runtypes/internal/compiler/routerrules/drizzle.go`: public annotation provenance and schema/model dependency checks.
- `ts-go-runtypes/internal/compiler/routerrules/drizzlevisitor_test.go`: only the internal kind-coverage guard.

Regenerate with `pnpm miondevx core codegen diag`:

- `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts`
- `container/website/app/components/content/go-generated/diagnostics-catalog.json`

### Reference app schema/query split

Under `packages/private-drizzle-example-app/`, modify these six files to contain only slim schema/model authoring:

- `src/db/pg.builders.ts`
- `src/db/pg.types.ts`
- `src/db/mysql.builders.ts`
- `src/db/mysql.types.ts`
- `src/db/sqlite.builders.ts`
- `src/db/sqlite.types.ts`

Create these six database/query companions:

- `src/db/pg.builders.db.ts`
- `src/db/pg.types.db.ts`
- `src/db/mysql.builders.db.ts`
- `src/db/mysql.types.db.ts`
- `src/db/sqlite.builders.db.ts`
- `src/db/sqlite.types.db.ts`

Update the six `src/server/{pg,mysql,sqlite}.{builders,types}.routes.ts` files to import public model types from the schema and database/table values from the companion.

Update `test/routeVariants.ts`, `test/schemaForms.spec.ts` and `test/costHarness.ts` for the split. Existing route-file, type-pin and cost tests consume these updates. Run existing `test/fullStack.spec.ts`; change it only if a moved export requires an import update. Regenerate `reports/drizzle-example-app.json` and `.md` from the actual test.

Create `test/importHygiene.test.ts` to scan schema/query/route files and require both diagnostics to be absent after the split. The intentionally plain-Drizzle controls remain whole and retain their explicit public-type suppression.

### Frontend acceptance tests

Create:

- `packages/drizzle-orm/test/lintFixture.ts`: real resolver and virtual/disk fixture harness.
- `packages/drizzle-orm/test/lintTypes.spec.ts`: the provenance behavior matrix above.
- `packages/drizzle-orm/test/lintImports.spec.ts`: the schema-isolation matrix above.
- `packages/drizzle-orm/test/lintProtocol.spec.ts`: operation parity, directives, filtering and nonfatal output.
- `packages/private-drizzle-example-app/test/publicTypeBoundary.compile.test.ts`: single-file API-client equality plus isolated direct-model-import graph/cost regressions.

Modify:

- `packages/devtools/test/eslint/plugin.test.ts`: actual compiler/plugin warning and distinct single-file cases: slim route annotation stays clean for rule 1 while schema/database mixing gets rule 2.
- `packages/devtools/test/eslint/routing.test.ts`: level routing for Warning and RuntimeError.
- `packages/devtools/test/eslint/oxlint-e2e.test.ts`: actual editor-host warning and nonfatal exit.
- `packages/private-drizzle-example-app/src/server/pg.drizzle.routes.ts`: deliberate control suppression.
- `packages/private-drizzle-example-app/src/server/mysql.drizzle.routes.ts`: deliberate control suppression.
- `packages/private-drizzle-example-app/src/server/sqlite.drizzle.routes.ts`: deliberate control suppression.

The existing root Drizzle Vitest config already includes `.spec.ts` files without transforming the test implementation. No test-config or package dependency change is planned. No diagnostic behavior cases are duplicated in Go.

### Docs and examples

Modify:

- `container/website/content/01.rpc/07.devtools/01.linter.md`: one section for light public route types and one for schema/model dependency isolation. The second explains clients importing models directly.
- `container/website/content/01.rpc/05.drizzle-orm/00.drizzle-overview.md`: show separate schema and conversion/query files in Building the Drizzle Table; distinguish the public-signature benefit from the direct-model-import graph benefit.
- `container/website/content/01.rpc/05.drizzle-orm/05.relations.md`: import separate recorded schema and relations/query examples.
- `container/website/content/01.rpc/05.drizzle-orm/06.schema-file.md`: separate authoring from materialized drizzle-kit exports.
- `container/website/content/01.rpc/05.drizzle-orm/08.cloudflare-storage.md`: update included examples if model imports move.

Under `packages/private-examples/src/drizzle/`:

- Create `drizzle-relations-schema-example.ts`; modify `drizzle-relations-example.ts` to import its slim schemas/models and hold conversion/relations/database types.
- Modify `drizzle-query-routes-example.ts` to use the correct schema and database modules.
- Create `drizzle-schema-authoring-example.ts`; modify `drizzle-schema-file-example.ts` to import those declarations and export materialized tables, enums, sequences, policies and views.
- Modify `drizzle-cloudflare-d1-example.ts`, `drizzle-cloudflare-durable-example.ts` and `drizzle-proxy-sqlite-example.ts` so public Note/NewNote model definitions stay in the slim module.
- Create `drizzle-lint-schema-example.ts`, `drizzle-lint-query-example.ts` and `drizzle-lint-routes-example.ts` for valid documentation snippets.
- Inspect `drizzle-to-drizzle-example.ts` and `drizzle-types-to-drizzle-example.ts`; change only if markers are needed, since their schema/query split already fits.

Scan every Drizzle example with both diagnostics. Any additional concrete violation joins this same change. The performance-only all-in-one controls are intentional fixtures, not advertised valid schema organization.

### Spec and conditional support

- After approval, record the approved revised scope/plan in `docs/todos/drizzle-lint-rules.md`; reconcile it to the two-diagnostic implementation and measured reasons and move it to `docs/done/drizzle-lint-rules.md` after acceptance. The user clarified that schema isolation serves direct client model imports, separately from route-public-type cost.
- `scripts/core/test-skip.mjs`: add declared harness inputs only if required for caching; process/FS tests continue running unless their inputs are complete.
- `packages/devtools/src/core/unplugin.ts` and `packages/devtools/src/lint/prefilter.ts`: only if the route admission tests show a real gap. Add only conservative admission for potentially authored slim-schema files; keep decisions in Go.
- `ts-go-runtypes/internal/compiler/marker/writtenrefs.go` and its tests: only if traversal must become shared rather than staying local to routerrules.
- `ts-go-runtypes/internal/compiler/batchcompile/compile.go`: only if generate wiring does not cover CLI compilation. Verify nonfatal CLI behavior in the frontend protocol suite.

No migration-map edits, public API changes, package manifests, lockfile changes or third-party submodule edits are planned.

## Risks and possible blockers

| Risk | Required mitigation |
| --- | --- |
| Mapped/query result metadata becomes anonymous | Add real regression fixtures first; use the concrete declaration/type-syntax fallback above. No name/shape guessing. |
| Following a function's implementation taints a slim public type | Stop at explicit slim/plain public annotations; pair each inferred-positive with a clean explicit annotation and a hand-built plain-object return. |
| Detection flags a slim model whose implementation uses Drizzle | Require a public derivation edge, not merely any call inside a body; assert the public-type diagnostic is absent in mixed single-file cases while the separate schema-isolation diagnostic is present. |
| Advisory wiring enables existing lint-only errors or doubles warnings | Separate entry, operation parity, exact warning count and old opt-in behavior tests. |
| Nonstandard package paths or ambient subpaths break identity | Package-name/declaration ownership tests, not path matching. |
| Whole-program measurement is confused with client-file work | Record/check both scopes and both raw/net counts with zero diagnostics. |
| Intentional benchmark controls create lint warnings | Explicitly suppress only those controls; preserve original comparison signatures. |
| Required build/remote access fails | Use repository setup/runtime workflows, complete available local work, and report the exact blocker. Never claim a green PR without reading its latest checks. |

## Implementation sequence and gate

1. Record the completed single-file and direct-model-import investigation results. Obtain plan approval and Automatic/Manual mode. Use a feature branch and record the approved plan in the todo.
2. Write failing frontend provenance and schema-isolation tests, especially real query results, valid imported-schema query files, and direct model-import graphs.
3. Implement both Go checks and internal visitor-coverage guards in the one Go test file; wire advisory diagnostics and regenerate catalog outputs.
4. Rebuild binary/devtools. Add frontend protocol/plugin/host tests and the cost regression.
5. Split authored schema/model modules from conversion in the app/examples; update the specified docs and compile them. Suppress only intentional heavy benchmark controls.
6. Run focused checks and the full required gate, reconcile/archive the spec and commit coherent changes.
7. Run independent review-pr review; fix findings and rerun required checks.
8. Run independent docs/comment simplification concurrently, verify preserved facts and commit each pass separately.
9. Open/attach the PR with the website label, inspect applicable lanes and drive latest-commit CI green.

Focused verification:

```bash
pnpm miondevx core codegen diag
pnpm run check:builds
pnpm exec vitest run packages/drizzle-orm/test/lintTypes.spec.ts packages/drizzle-orm/test/lintImports.spec.ts packages/drizzle-orm/test/lintProtocol.spec.ts
pnpm exec vitest run packages/devtools/test/eslint packages/devtools/test/transform-modes.test.ts
pnpm exec vitest run packages/private-drizzle-example-app/test
pnpm run typecheck
pnpm exec vitest run website-links
```

Full required gate:

```bash
go -C ts-go-runtypes test ./internal/... ./cmd/...
pnpm run check:builds
pnpm test
pnpm run lint
pnpm run format
pnpm run check-format
pnpm miondevx core codegen all --check
```

After simplification, rerun typecheck/website-links for docs and lint/Go vet for comments; verify the comment pass changed only comments. Finish evidence includes actual passing frontend acceptance tests, the performance regression, archived spec, independent review, separate simplification commits and the latest green PR checks. Investigation measurements and frontend acceptance suites have run; the final gate is recorded below.


## Implementation Notes

The two compiler checks share `routerrules/drizzle.go`. Behavioral coverage lives in the three
`packages/drizzle-orm/test/lint*.spec.ts` suites. Go tests verify visitor dispatch and child slots only.
The frontend tests cover package ownership changes, exact spans, real query inference, recursion,
all three dialects, scan/transform/generate agreement and CLI build exit codes.

The schema check follows resolved slim-module imports and exports instead of instantiating every
exported builder type. Other dependency checks follow declaration syntax rather than expanding
recursive framework types. This preserves bridge detection and keeps whole-tree lint costs bounded.

Public-type messages identify the return or parameter position. Existing comparison fixtures use
code-specific file directives because comparing materializations requires both schema forms together.
The Cloudflare storage test worker also needed a separate `cloudflare-storage.schema.ts`.

The warning audit left the eight reviewed warnings at Warning. Their urgency is conditional or
advisory; none demonstrated universally broken emitted behavior. The published compiler-version
warning's prose was corrected to describe client-side mismatch detection after a response.


Additional affected sources:

- `packages/private-drizzle-example-app/test/importHygiene.test.ts` scans the 18 real schema, companion and route files.
- `packages/private-test-server/src/cloudflare-storage.schema.ts` owns the slim Note models; its worker consumes them.
- `container/drizzle-e2e/shared/vitest.types.config.ts` downgrades only schema isolation in the intentionally mixed database comparison harness.
- `packages/devtools/test/drizzle-e2e-lane-contracts.test.ts` checks that the comparison exception remains code-specific.
- Each dialect's existing comparison fixtures (`drizzleTypeSource.integration.spec.ts`, `index.spec.ts`, `nestedMarkerCalls.spec.ts`, `tableEquality.fuzz.spec.ts`, `type-pins.stub.ts`, `typeTables.spec.ts`, `valueHelpers.spec.ts`) has an explicit schema-isolation directive. Those fixtures compare slim schemas with their materializations.

The schema/model role check also covers standalone PostgreSQL enums, schemas and sequences, import-type model aliases, and `typeof table.$inferSelect` / `$inferInsert` model aliases. Real third-party test helpers have a regression case against recursive callable-type expansion.


## Local Verification (5 October 2026)

- All 24 JavaScript test projects passed, run sequentially because this host cannot fit all resolver processes at once.
- The completed-binary rerun passed all 149 root Drizzle tests and the 11 native comparison contract tests.
- The reference app passed 145 tests, including all six public-type boundary comparisons and its real-file import hygiene check. Its generated cost reports remained unchanged.
- The full Go internal and command suites passed. The diagnostic slot snapshot includes the new `position` argument.
- `pnpm run lint` passed, including directives, both linters, TypeScript checks and native compiler checks across 26 projects.
- Formatting checks passed. Full code generation reproduced the expected generated outputs.
- All 289 documentation code imports resolved.

Independent review, documentation/comment simplification and PR CI follow this local gate in Automatic mode.
