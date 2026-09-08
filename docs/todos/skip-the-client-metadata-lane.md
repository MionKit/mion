---
type: feature
spec: guidelines
status: ready
created: 2026-09-08
---

# An option that turns the client metadata lane off completely

## Intent

`mion@methodsMetadata` (`packages/router/src/routes/client.routes.ts`) is a middleFn that sits in the
execution chain of every route, unconditionally. On every request it goes through the full params
pipeline, decode, sanitize and a compiled validator run, for a params tuple that is empty unless a
client is actually asking for metadata. Its own early return (`if (!methodsIds || methodsIds.length
=== 0) return;`) is only reached after all of that.

A deployment that never serves client metadata, an internal service with a hand-written client, or
one that ships the metadata in the client bundle instead, pays this on every request for an answer
nobody asks for. The goal is an option that removes the whole lane, chain member included.

## Direction

The implementer plans the details. What was already checked, the hard way:

- **`skipClientRoutes` is NOT that option, and must not be repurposed into it.** It skips registering
  the metadata ROUTE (`mionClientRoutes`), while the metadata MIDDLEFN stays in
  `defaultEndMiddleFns` (`packages/router/src/router.ts:90`). That is load-bearing, not an oversight:
  the middleFn answers a metadata request piggybacked on any call and does not need the route
  registered. Making `skipClientRoutes` drop both was tried and reverted; it broke six tests that
  exercise exactly that capability (three in `packages/router/src/routes/client.routes.spec.ts`
  covering the middleFn's stringifyJson framing, three in `packages/router/src/router.spec.ts`
  counting chain members). `skipClientRoutes` also defaults to `IS_TEST_ENV`
  (`packages/router/src/constants.ts:25`), so any change to its meaning moves the chain shape under
  every test in the repo.
- **So this needs its own option**, with its own name and its own default (off, keeping today's
  behaviour). Whether it should also imply skipping the metadata route is a design question worth
  answering explicitly rather than assuming.
- **Do not attack the cost by skipping validation instead.** That was considered and rejected on its
  own merits: absent params are how a caller omits a required argument, and the compiled validator
  already checks optionality as its first operation, so a hand-rolled "all params optional" gate
  would duplicate what the generated code does better. `packages/router/src/dispatch.spec.ts` has a
  guard test for this ("omitting the params of an all-optional handler is valid, a required one is
  not").
- **Size the prize before building.** Removing one chain member of four is worth measuring with
  `pnpm exec vitest bench --project router dispatch` and the container lane
  (`pnpm miondevx bench servers repeat mion hello-world --runs 3`). Note that box spread was 6.9%
  against a 10% tolerance, so a small win may not be resolvable there.

## Done when

There is an option that removes the metadata middleFn and the metadata route together, defaulting to
today's behaviour; the capability still works with the option off, pinned by the existing client
route tests; the option is documented on the website; and the doc carries a before/after number, or
says plainly that the win was under the noise floor.
