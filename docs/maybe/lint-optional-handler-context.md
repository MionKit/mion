---
type: feature
spec: guidelines
status: maybe
created: 2026-10-16
---

# Lint Rule: a Handler's Context Param Is Never Optional

## Intent

`HandlerParams<H>` (`packages/rpc-router/src/types/handlers.ts`) drops the leading context param with
`Parameters<H> extends [any, ...infer P] ? P : []`. An optional context (`(ctx?: Ctx, tag?: string)`) has a minimum
length of 0, so it fails that match and every param after it is lost: the build compiles `[]`, the server reports
`paramsCount` 0, the middleware counts as private, and `tag` is never validated or sent. A default value on the
context (`(ctx = fallback, tag?: string)`) does the same. Nothing tells the author.

`(ctx, tag?: string)` works: only the context's own optionality breaks it.

## Direction

- New code in the `rpc-handler-*` family (`ts-go-runtypes/internal/diagnostics/codes_mionroute.go`), e.g.
  `rpc-handler-optional-context`, reported on the context param of a route, query, mutation, middleware or
  headers middleware handler that is optional or has a default. A raw middleware's context too, for consistency.
  Level: `LevelRuntimeError`, like its siblings (the build compiles the wrong params type, so the route is broken).
- Follow the add-diagnostic skill end to end: prose with both examples, both helper call shapes, a handler typed
  through an annotation as well as through the helper, the eslint opt-in (`CheckRouterRules`).
- The implementer plans the details.

## Docs

The diagnostics catalog page, generated from the registered code (`pnpm miondevx core codegen all`).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- An optional or defaulted context param on any mion handler reports the new code; `(ctx, tag?: string)` does not.
- The catalog lists it with both examples.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Parked (2026-10-30)

No commitment to implement. A first build raised one open question: a raw middleware compiles nothing from its
params, so an optional context there drops nothing. The "for consistency" line above then conflicts with the Level
rule (`LevelRuntimeError` needs code that is broken when it runs). Leave raw middlewares out, or give them a lower
level and their own message.
