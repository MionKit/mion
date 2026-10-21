---
type: feature
spec: full-plan
status: done
created: 2026-09-30
---

# Check Headers When a HeadersSubset Is Built

## Problem

A handler that returns a `HeadersSubset` is only checked after it returns: `validateReturnedHeadersOrThrow`
in `packages/rpc-router/src/dispatch.ts` (~line 310, called ~136) runs the compiled `headersReturn` check on
the returned value. Rule: nothing is validated after a handler returns. The check belongs where the
subset is built, inside the handler, so a bad header throws like any other handler bug.

The constructor cannot check today because the build step only fills marker params on call expressions,
never on `new X<T>(...)`: `forEachCallExpression` (`ts-go-runtypes/internal/compiler/resolver/scan.go`
~1591) matches `ast.KindCallExpression` only, and `analyzeCall` (~485) calls `AsCallExpression()`.

## Plan

### 1. Build step: marker params on `new` expressions (Go)

- `scan.go`: add `forEachCallOrNewExpression` beside `forEachCallExpression`, matching
  `KindCallExpression || KindNewExpression`. Use it only at the marker scan sites (`scan.go` ~231,
  `scan_parallel.go` ~103). Leave `overrides.go` ~75, `apigen.go` ~661, `apiversion.go` ~98, apimeta and
  requestbatch on calls only (they find `initRoutes` / router / batch calls; `detectOverrideSite` would
  panic on a `new` node).
- `analyzeCall` (~485): replace `AsCallExpression()` with the generic `ArgumentList()` /
  `TypeArgumentList()` accessors (nil-safe for `new X` with no parens).
  `Checker_getResolvedSignature` already accepts `new` nodes. Pass `{args, typeArgs, hasArgList}` instead
  of `*ast.CallExpression` to `analyzeTrailingInjection` (~648) and the helpers that call
  `AsCallExpression()` today: `optionsArgumentAt` (~1043), `callExpressionName` (~1554, label `new X`),
  the `findMissingTypeArgs` caller (~705), `detectWrittenTypeRefGuards` / `reflectValueLabel`
  (`unresolved_name_guard.go` ~23, ~113), `hasExplicitBroadKeywordTypeArg`
  (`unresolved_import_guard.go` ~41). Trailing comma: `args != nil && args.HasTrailingComma()`.
- Reflect form (`scan.go` ~724-762) swaps T for the annotation on argument 0. Gate it on "parameter 0's
  declared type is the marker's T", so a constructor whose argument 0 is data (the headers map) keeps
  the resolved T and raises no "function-call argument" warning.
- Options bag (`extractValidateOptions` / `computeSiteFn`, ~763, ~798): read `lastIndex-1` only when that
  parameter was detected as CompTimeArgs / CompTimeFnArgs, never blindly.
- `enclosedByInjectionMarker` (~1323): widen the parent test to call-or-new.
- Insertion point: today `pos = call.End()-1` (the `)`, ~819 / ~846). For `new X` / `new X<T>` with no
  argument list, `pos = call.End()` and a new `NoArgList bool` rides `pendingCall`, `commitPending`
  (~412) and `protocol.Site` (`internal/protocol/protocol.go` ~203-229). `buildGroupInsertion`
  (`internal/compiler/sourcerewrite/transform.go` ~283-311) wraps the body in `(...)` when set. Both wire
  modes take their text from `buildGroupInsertion` (`edits.go` ~42), so the JS `applyEdits` twin needs no
  logic change; mirror `noArgList?: boolean` in `packages/devtools/src/core/protocol.ts` ~113-133.
- No lint change: every check lives in Go and reports through `textpos.NodeSite`, which takes any node.

### 2. `HeadersSubset` checks itself (`packages/core/src/headers.ts` ~12-17)

```ts
constructor(
  headers: {[K in Required]: string} & {[K in NoInfer<Optional>]?: string},
  fns?: InjectTypeFnArgs<HeadersSubset<Required, Optional>, 'validate', 'validationErrors'>
)
```

- T is the class type, so the type id equals the handler's declared `HeadersSubset<...>` return type and
  error paths stay `headers.<name>`. `NoInfer<Optional>` stops TS from inferring `Optional` from the
  argument too (`Required` comes from the written keys, `Optional` from the return type or `never`).
- Resolve the fns with the logic of `buildHeaderJitFnsFromMarker`
  (`packages/core/src/runtypes/mionAdapter.ts` ~385), moved to a shared core helper, cached per injected
  array in a `WeakMap`.
- On a mismatch throw `FatalError({statusCode: UNEXPECTED_ERROR, type: 'headers-validation-error',
  errorData: {typeErrors}})`. The name is new because the same constructor runs on the client too.
- `fns` undefined (a consumer not built with mion): no check, no throw.
- No-check path for internal use: `trustedHeadersSubset(map)` exported from core
  (`Object.create(HeadersSubset.prototype)` + `headers`), keeps `instanceof`, never a scan site.
  Use it at:
  - the class deserializer (`headers.ts` ~24): body values are checked by the route's own fns;
  - router request headers (`dispatch.ts` `runHeadersMiddleware` ~182): `validateHeaderParamsOrThrow`
    stays the single check;
  - `reconstructHeadersSubsetFromResponse` (`packages/rpc-client/src/lib/headers.ts` ~91):
    `validateServerResponses` keeps checking via `lib/validation.ts` `getResponseError`.
- Users building request headers on the client get the same check when their build runs mion.

### 3. Router: no check after return

- Delete `validateReturnedHeadersOrThrow` and its call in `dispatch.ts`. Keep `headersReturn` metadata
  (header names; the client still uses its `jitFns`).
- Core is built and tested with `mionVitePlugin`; its `.d.ts` keeps the `InjectTypeFnArgs` import, so
  injection happens at the user's call site, the same way `route()` works.

## Tests

- Go, new `resolver/new_expression_test.go`, paired (not parameterized) per the Marker test coverage rule:
  - static `new HeadersSubset<'A'>({A: x})` vs inferred `return new HeadersSubset({A: x})` inside a function
    declared `: HeadersSubset<'A'>`, asserting both hash to the same id;
  - inferred from an async handler, a union return, an argument position, and module scope;
  - `new X<T>` with no parens (position and `NoArgList`); trailing comma; explicit pass-through makes no
    site; a free type parameter gives MKR003; an annotated const in argument 0 does not override T; the
    options bag is not read from argument 0; a generic class wrapper shaped like `getRunTypeId`.
- sourcerewrite: `testdata/new_expression.json` and `new_no_parens.json` via
  `cmd/gen-sourcerewrite-fixtures`, a `buildGroupInsertion` unit test; the mode-parity corpus
  (`packages/devtools/test/transform-modes.test.ts`) replays them in both wire modes.
- devtools plugin: a transform test for `new` injection, static and inferred shapes paired.
- core: the constructor throws on a wrong value and a missing required header, passes a good one, skips
  when not injected; `trustedHeadersSubset` passes `instanceof`.
- router (`packages/rpc-router/test/dispatch.spec.ts`, the returned-headers block): the error now comes
  from the constructor as a `headers-validation-error` in `thrownErrors`; add a test that request headers
  are checked once.
- client: request-header construction checks; the response rebuild never throws.
- platform-node (`test/mionHttp.spec.ts`, the line-break test): a CRLF value is still a valid string, so it
  stays `unknown-error` from the platform; verify only.

## Docs

- `container/website/content/01.rpc/02.server/04.headers.md`, existing section "Sending Response Headers":
  returned headers are checked when the `HeadersSubset` is built, inside the handler, and fail with
  `headers-validation-error`.
- `container/website/content/01.rpc/04.client/00.client-overview.md`, existing section "Checking Server
  Responses": drop "the server checks only the headers a route returns".
- `container/website/content/02.runtypes/02.guide/10.compiler-markers.md`: markers also work on constructor
  calls, `new X<T>()` and `new X(value)`.
- Check the MKR003 / MKR010 wording in `02.runtypes/08.diagnostics/02.all-diagnostics.md`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

Not a candidate: the check is the existing compiled `validate` family, already fuzzed. The new code is
call-site plumbing, covered by the paired Go tests and the mode-parity corpus.

## Out of scope

- Injection on `super(...)` calls, tagged templates and JSX.
- `new` support in apigen, apiversion, apimeta and requestbatch.
- A lint hint for a subset built outside the handler (module scope) and returned later.
- A subset built through `trustedHeadersSubset`, or by a library built without mion, is never checked on
  the server. Accepted under the "no check after return" rule; the docs say so.

## Done when

- `new X<T>(...)` and `new X(value)` get their marker params filled in both wire modes, with paired Go
  tests asserting equal hashes and the mode-parity corpus green.
- `new HeadersSubset(...)` with a wrong or missing header throws `headers-validation-error` inside the
  handler; the router runs no check after a handler returns.
- Request headers are checked once; response rebuilds on the client never throw.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint` green.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.

## What shipped (2026-10-01)

Built as planned, with these differences:

- `analyzeCall` and the guard helpers read `call.ArgumentList()` / `call.TypeArguments()` straight off the node
  instead of taking a new `{args, typeArgs, hasArgList}` struct. `callExpressionName` was left alone: it only
  names a call written as argument 0, never the `new` site itself.
- The marker scan and the router scans share one walker (`forEachNodeWhere`); the marker scan matches
  `ast.IsCallOrNewExpression`, the others stay on calls.
- Reflect-form gate (`paramZeroCarriesT`): parameter 0 must be the marker's T or `RunType<T>`, compared with null and
  undefined stripped. An untrusted brand resolves no T, so it keeps the old annotation swap.
- Options bag (`optionsArgsCountFor`): a `new` site reads options only when the slot before the marker is
  CompTimeArgs / CompTimeFnArgs / CompTimeHints, on the single-marker AND the multi-slot path. A call keeps the
  plain options-before-the-marker convention, so a wrapper typing its options slot plainly still works.
- No cache in the constructor: `getRTFunction` already caches the resolved fns per entry tuple.
- No exported error alias: the constructor throws `FatalError<'headers-validation-error', ValidationErrorData>`.
- The rewrite fixture `new_no_parens.json` (marker at parameter 1, so it also pads) replays in the Go `sourcerewrite`
  tests in both modes; a separate `new_expression.json` added nothing over the existing call fixtures. The JS
  mode-parity test got `new Holder<T>()`, `new Holder(value)` (same id asserted) and paren-less `new Holder<T>`.
- The parallel scan is pinned by a `new` file in `parallelFixtureSources()`.
- A `headers-validation-error` counts as "the handler ran" in the client's `routeSucceeded`, like
  `response-validation-error`, so a mutation that failed its headers check is never resent.
- Generic code: `new HeadersSubset<N>(map)` inside a generic function still stops the build with MKR003 / MKR010,
  like any marker. `new HeadersSubset<N>(map, undefined)` builds it unchecked; the headers page says so. This is a
  breaking change for such code, marked on the `feat(core)!` commit.
- MKR003 / MKR010 wording already fits `new`, so no change.
- The compiler markers page shows a constructor example (`markers-wrap-class.ts`).
