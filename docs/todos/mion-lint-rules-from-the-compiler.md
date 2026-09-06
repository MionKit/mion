---
type: feature
spec: full-plan
status: ready
created: 2026-09-06
---

# Move the mion lint rules into the Go compiler

## Problem

The five `@mionjs/*` ESLint rules are hand-written and purely syntactic, because OXlint's
plugin host gives them no type information. That costs real coverage:

- They find a handler only when it is written inline in the helper call. A named function
  reference (`mion.route(myHandler)`), a `Handler`-typed const, a `satisfies Handler`
  expression and a `@mion:route` JSDoc tag are invisible to some or all of them.
- They identify the router by reading import specifiers, so an alias, a namespace import or a
  re-export through a local barrel can slip past, and a same-named import from another package
  can be mistaken for one.
- Rules that need the checker cannot be written at all. The one that matters: a handler must
  answer with an `RpcError` or a subclass. Anything else has no mion brand, so the dispatcher
  routes it to `@thrownErrors` rather than a typed slot, and the declared return type is a lie.

Meanwhile the compiler is already a type-aware, mion-aware linter, and already feeds lint.

## What already exists

Confirmed by reading the tree, this is the ground the work stands on.

**The compiler knows mion, not just runtypes.**

- `ts-go-runtypes/internal/compiler/routerinit/routerinit.go` finds every `createMionRouter`
  call declared by `@mionjs/router`. Detection is checker-based, never textual: it resolves the
  callee's signature, so aliases, namespace imports and barrels all match and a same-named
  function elsewhere does not. This is exactly the route identification the ESLint rules lack.
- `ts-go-runtypes/internal/compiler/requestbatch/routes.go` resolves route calls and route ids.
- `ts-go-runtypes/internal/diagnostics/codes_batch.go` holds `BAT001`-`BAT009`, mion-specific
  diagnostics **already routed to lint rules**. `BAT006` checks an `inputFrom()` argument index
  against the target route's declared parameter count, so route-aware type-aware analysis
  already ships through this pipeline.
- `ts-go-runtypes/internal/cachegen/purefunctions/purity.go` walks function bodies and reports
  `await`, `this`, `yield` and dynamic import. Finding a `throw` in a handler body is the same
  kind of walk.

**The Go to lint pipeline is automatic.**

- `ts-go-runtypes/cmd/gen-diag-catalog` dumps the catalog;
  `scripts/core/gen-diagnostics-catalog.mjs` turns it into
  `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts` and the website
  diagnostics JSON. The wire carries only code plus args, so all human text is generated.
- `packages/devtools/src/lint/diagnosticRouting.ts` maps code prefixes to rule names in
  `PREFIX_TO_FAMILY`, with a primary / warn tier per family.

**Enablement is not duplicated, so there is nothing to reinvent.** Go always emits; the lint
host sets the level. `catalog.go` states it outright: "Severity is purely informational: it does
not control runtime behavior." `RULE_SPECS` carries the Go catalog default and the host's
per-rule level is what applies.

## Plan

### 1. A Go package for the route rules

New `ts-go-runtypes/internal/compiler/routerrules/`. Identify route calls the way
`routerinit` identifies the factory: resolve the callee signature and require it to be declared
by `@mionjs/router`. From a route call, argument 0 is the handler.

| rule | how it is decided |
| --- | --- |
| `no-throw-in-handlers` | walk the handler body for a `throw`, skipping one caught by a `try` / `catch` inside the handler |
| `returned-error-type` | read the handler's resolved return type; every arm derived from `Error` must also derive from `RpcError` |
| `strong-typed-routes` | AST only: is a return type annotation written, is each non-context parameter annotated |
| `no-unreachable-union-types` | union arm reachability, on resolved types rather than syntax |
| `no-unsafe-property-names` | a walk over the program's type declarations |

### 2. Diagnostics

A new `ts-go-runtypes/internal/diagnostics/codes_mionroute.go` with its own code prefix and a
new `Family`. Every code must declare a `Scope` (`register` panics without one): the body and
AST rules are `ScopeNotSource`; `returned-error-type` and `no-unsafe-property-names` are
type-derived, so they are `ScopeGraph` and each needs a `NestedExample` beside its `Example` in
`prose.go`, which `TestDiagExamples_TriggerAtDepth` then feeds through the real scan.

Add a `CheckRouterRules bool` to `protocol.Request`, mirroring the existing `CheckEnrich` flag,
so the build path pays nothing and the lint plugin is the only consumer. Regenerate with
`pnpm run gen:diag-catalog`.

**The gate is not an optimisation, it is the semantics.** A rule turned off in an eslint or
oxlint config is still produced by the compiler; the config only decides whether anything
REPORTS it. `mion compile` prints every diagnostic it collected and exits non-zero on an
Error-severity one, and the bundler plugin's `failOnError` halts the build on the same. So a
mion route diagnostic that ran during a build would fail that build even for a team that had
disabled the rule, which is not how these rules behave today and not how a style rule should
behave. Gating them behind `CheckRouterRules` is what keeps "off in the editor and the linter"
meaning off. Only the lint plugin sets the flag; a build never does.

That also fixes the severity level for these codes: they are lint findings, not "the compiler
cannot represent this", so nothing in the emitted output depends on them.

### 3. Keep the `@mionjs/*` namespace

`RuleSpec` in `diagnosticRouting.ts` grows a `namespace: 'runtypes' | '@mionjs'` field.
`PREFIX_TO_FAMILY` maps the new prefix to the mion rule names. `index.ts` partitions the one
table into both plugin objects instead of hand-listing `mionPlugin.rules`, and
`configs.recommended` registers both from that same table. Users' existing configs keep working
unchanged.

**Easy to miss:** the plugin's `needsResolverPass` pre-filter (`packages/devtools/src/lint/prefilter.ts`)
admits a file only when it looks like it uses runtypes markers. A route file carrying none would
be skipped and never linted. The gate must also admit files that reference the router.

### 4. Retire the TypeScript rules

Delete the five rule modules and their specs under `packages/devtools/src/lint/rules/`, plus
`packages/devtools/src/lint/routerHelperCall.ts`, which exists only to serve them. Keeping both
engines would double-report every finding.

## Two findings that change the shape of the work

- **`strong-typed-routes` does port.** The worry that the checker would paper over missing
  annotations is unfounded: the AST records whether an annotation was *written*, independently
  of what the checker infers, and `purity.go` already works at that level.
- **`no-unsafe-property-names` is NOT already covered by `UPN001`.** That code is emitted from
  `ts-go-runtypes/internal/cachegen/typefunctions/module.go:592`, while *rendering* a type
  function, so it only fires for types a marker actually reaches. The TypeScript rule
  deliberately covers types no route reaches yet. Porting it therefore needs a program-wide
  declaration walk, not a reuse of `UPN001`. This is the largest single piece of the work. If it
  proves disproportionate, leaving that one rule in TypeScript and saying so is better than
  shipping it with narrower reach than it has today.

## Tests

- Go: a `routerrules` suite per rule, valid and invalid fixtures, including the handler shapes
  the ESLint rules cannot see (named reference, `Handler`-typed const, `satisfies`, JSDoc tag)
  and the aliased / namespaced / re-exported router forms.
- Go: the catalog test and `TestDiagExamples_TriggerAtDepth` for the two `ScopeGraph` codes.
- JS: `packages/devtools/test/eslint/plugin.test.ts` pins each mion rule at its default level and
  under the `@mionjs/` prefix, built from the partitioned table.
- JS: a fixture project proving a route file with no runtypes marker still gets a resolver pass.
- e2e: `container/pre-publish-e2e/mion-consumer` keeps asserting `@mionjs/*` rules fire from the
  published package, which now also proves the resolver path for a real consumer.
- The marker coverage rule does not apply: these tests exercise route calls, not the
  `getRunTypeId` marker API, so no paired call-shape tests are owed.

## Docs

Rewrite the mion half of `container/website/content/01.rpc/06.devtools/01.linter.md` so the rules
read as compiler-fed, and document the new `returned-error-type` rule with its own examples in
`packages/examples/src/introduction/eslint-rule-test.routes.ts`.

## Out of scope

- The `runtypes/*` rules. They already come from the compiler and do not move.
- Changing any rule's default severity.
- Loading the `@mionjs/*` rules into OXlint's own rule set; they stay ESLint-registered.

## Done when

- The five rules are emitted by the Go compiler, still named `@mionjs/*`, still at their current
  default levels, and the TypeScript rule modules are gone.
- `returned-error-type` exists and catches a handler answering with an error that carries no mion
  brand.
- Each rule catches the handler shapes the syntactic versions missed, pinned by tests.
- `go -C ts-go-runtypes test ./internal/...`, `pnpm test`, `pnpm run lint` and
  `pnpm run typecheck` are all green, and the e2e consumer lane proves the rules fire from the
  published package.
