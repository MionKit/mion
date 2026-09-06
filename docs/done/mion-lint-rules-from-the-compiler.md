---
type: feature
spec: full-plan
status: done
created: 2026-09-06
---

# Move the mion lint rules into the Go compiler

## Problem

The `@mionjs/*` ESLint rules were hand-written and purely syntactic, because OXlint's
plugin host gives them no type information. That cost real coverage:

- They found a handler only when it was written inline in the helper call. A named function
  reference (`mion.route(myHandler)`), a `Handler`-typed const, a `satisfies Handler`
  expression and a `@mion:route` JSDoc tag were invisible to some or all of them.
- They identified the router by reading import specifiers, so an alias, a namespace import or a
  re-export through a local barrel could slip past, and a same-named import from another package
  could be mistaken for one.
- Rules that need the checker could not be written at all. The one that matters: a handler must
  answer with an `RpcError` or a subclass. Anything else has no mion brand, so the dispatcher
  routes it to `@thrownErrors` rather than a typed slot, and the declared return type is a lie.

Meanwhile the compiler is already a type-aware, mion-aware linter, and already feeds lint.

## What shipped

Four rules now come from the compiler, under the same `@mionjs/*` names and at the same default
levels, and the hand-written modules are gone.

| rule | how it is decided |
| --- | --- |
| `strong-typed-routes` | AST only: is a return type annotation written, is each non-context parameter annotated |
| `no-throw-in-handlers` | walk the handler body for a `throw`, skipping one caught by a `try` / `catch` inside the handler |
| `returned-error-type` | NEW. Read the handler's written return type; every arm derived from `Error` must also derive from `RpcError` |
| `no-unsafe-property-names` | a walk over the file's own type declarations |

### Three rules did NOT move, and why

The original plan listed five rules to port. Two were dropped instead, decided with the
maintainer before any code was written:

- **`no-unreachable-union-types` is deleted.** It asked the author to put the more specific member
  of a union first so a subset arm could not shadow it. `finalizeUnion` /
  `sortUnreachableTypes` (`ts-go-runtypes/internal/cachegen/runtype/union_safeorder.go`) already
  reorders object arms by their property sets before the validator is emitted, so the build fixes
  exactly what the rule reported. Porting it would have shipped a rule whose message was no longer
  true.
- **`no-mixed-union-properties` is deleted.** It was registered but commented out of
  `recommended` ("not too useful and overlaps with some ts rules"), and its only remaining
  dependency was the syntactic router recogniser this change removes.
- **`enforce-type-imports` stays in TypeScript.** It is bundle hygiene over import statements: it
  takes its own `backendSources` option, is a fixer, has no router coupling, and never wanted the
  checker. It stays registered on `mionPlugin` and stays out of `recommended`, where it already
  was.

### `returned-error-type` requires RpcError, not just the brand

`isRpcError` accepts a bare `TypedError` at run time (it carries the brand), but `TypedError` has
no `publicMessage`, no `errorData` and no status code, so it is not an answer a client can use.
The rule therefore reports it, matching the plan's original wording rather than the runtime guard.

### `no-unsafe-property-names` was not the big piece

The plan flagged it as the largest item and offered to leave it in TypeScript, on the belief that
it needed a program-wide declaration walk. It does not: the ESLint rule was a 68-line walk over the
LINTED FILE's own declarations, and the port is the same walk over the same file's AST. It ported
with the rest.

## How it is built

### The Go package

`ts-go-runtypes/internal/compiler/routerrules/`, three files:

- `routerrules.go` — `CheckSourceFile`, the per-file entry point, plus the cheap text pre-filter.
- `handlers.go` — route-call detection and handler discovery.
- `rules.go` — the four checks.

Route detection follows `routerinit.isFactoryCall`: resolve the callee's signature, then require
its declaration to sit inside `RouteHelper`, `MiddleFnHelper` or `HeadersFnHelper` as declared by
`@mionjs/router`. `RawMiddleFnHelper` is deliberately absent (a raw middleFn takes no typed params
and declares no return type). That covers `mion.route(h)`, a destructured `route(h)`, an alias, a
namespace import and a local barrel, and rejects a same-named call from anywhere else.

Handler discovery has three roads, deduped by function node so a `Handler`-typed const passed into
`mion.route()` is one handler, not two: argument 0 of a helper call (unwrapping parens, `as`,
`satisfies` and `!`, and following an identifier to its function), a declaration annotated with a
`Handler` / `HeaderHandler` type resolved through the checker, and a `@mion:` JSDoc tag read from
the statement's leading trivia (tsgo parses those as comment text, not as known tags).

`returned-error-type` walks the base-class chain over SYMBOLS, not types: the DECLARED type of a
symbol is what carries the base list, so a generic class reached as `RpcError<'not-found'>` walks
the same chain as a plain one. Asking a type reference for its base types answers nothing, which is
the bug the first version had.

### Diagnostics

`FamilyMionRoute = 5` and a new `codes_mionroute.go` with prefix `MRT`: `MRT001` missing return
type, `MRT002` missing parameter type, `MRT003` throw in handler, `MRT004` returned error without
the mion brand, `MRT005` unsafe property name. All `SeverityError`, matching the levels the rules
shipped at. Headlines and details in `messages.go`.

Scope, which differs from the plan: `MRT001`-`MRT004` are `ScopeNotSource` and carry no `Example`,
because they fire at a call site rather than inside a marker's type and the inline example harness
has no `@mionjs/router` to resolve against — the same reason the whole BAT family carries none.
Only `MRT005` is `ScopeGraph`, with an `Example` and a `NestedExample`, since it needs no router.
Both dispatches in `diag_examples_test.go` now set `CheckRouterRules` so the gated codes reach the
harness at all.

### The gate

`protocol.Request.CheckRouterRules`, read in `dispatch.go` beside `CheckEnrich`, implemented by
`resolver/routerrulescheck.go`. Only `lint-worker.ts` sets it.

This is semantics, not speed. A rule turned off in an eslint or oxlint config is still produced by
the compiler; the config only decides whether anything REPORTS it. `mion compile` prints every
diagnostic it collected and exits non-zero on an Error-severity one, and the bundler plugin's
`failOnError` halts the build on the same. So an ungated route diagnostic would fail the build of a
team that had disabled the rule. `TestCheckRouterRules_OptIn` pins both the scan and the transform
lanes.

### The lint plugin

`RuleSpec` grew `namespace: 'runtypes' | '@mionjs'` and the four mion rules joined `RULE_SPECS`.
`index.ts` partitions that one table into both plugin objects and builds `configs.recommended` from
it, so nothing is hand-listed any more.

Routing uses a per-code `mionRouteFamily(code)` switch rather than a `PREFIX_TO_FAMILY` entry: one
prefix carries four rules, which is the same shape `enrichFamily` already has.

`needsResolverPass` gained a third gate, `referencesRouter`. Without it a route file carrying no
runtypes marker was skipped before the resolver was ever asked, and the rules would silently never
fire. It matches a quoted `@mionjs/router` specifier, a `@mion:` tag, or any of the five helper
names followed by `(` — deliberately permissive, because the router is usually imported from a
relative module and the file then names the package nowhere.

Deleted: `lint/routerHelperCall.ts` and five rule modules with their specs.

### One unrelated fix taken inline

`UPN001` had no entry in the diagnostics catalog generator's `SUBSYSTEMS` table, so it was landing
in the "other" bucket on the website with a `no subsystem for UPN001` warning on every run. It is
the runtypes twin of `MRT005` and the table was already being edited for the new prefix, so it was
given its place under `serialization`. The "other" bucket is now empty.

## Tests

- Go: `internal/compiler/routerrules/routerrules_test.go`, per rule, valid and invalid, including
  the four handler shapes the ESLint rules could not see and the aliased / namespaced /
  destructured / relative-barrel router forms, plus a same-named `app.route()` that must stay
  silent.
- Go: `internal/compiler/resolver/routerrulescheck_test.go`, the one-pass contract and the opt-in
  gate on both the scan and transform lanes.
- Go: `diag_examples_test.go` covers `MRT005`'s `Example` and `NestedExample`.
- JS `test/eslint/plugin.test.ts`: `recommended` and both plugin objects asserted from the
  partitioned table, and a "Family C" integration block running the real binary over a route file
  that imports no marker.
- JS `test/eslint/prefilter.test.ts`: the router gate, including the relative-import layout.
- JS `test/eslint/routing.test.ts`: its existing catalog-coverage guard pins every new code for
  free (an unrouted prefix fails it).
- e2e `container/pre-publish-e2e/mion-consumer`: the caveat file gained a `returned-error-type`
  case and the spec now matches on `[MRT00x]` in the message, since a compiler-fed rule reports a
  plain message with no ESLint `messageId`. The lane now also proves the resolver path for a real
  consumer install.

The marker coverage rule does not apply: these tests exercise route calls, not the `getRunTypeId`
marker API, so no paired call-shape tests are owed.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md` was rewritten: the rules read as
compiler-fed, `returned-error-type` has its own section, the two deleted rules are recorded in a
"Two rules that are gone" section next to the existing pure-functions note, and the page's section
order was repaired (two rule sections were sitting after the closing notes, and there were two
`code-import-timestamp` markers).

`packages/examples/src/introduction/eslint-rule-test.routes.ts` gained valid and invalid
`returned-error-type` regions and lost the union-unreachable and mixed-union ones.

## Out of scope

- The `runtypes/*` rules. They already came from the compiler and did not move.
- Changing any rule's default severity.
- Loading the `@mionjs/*` rules into OXlint's own rule set; they stay ESLint-registered.
