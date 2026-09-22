---
type: fix
spec: guidelines
status: ready
created: 2026-09-22
---

# `pnpm run typecheck` silently skips twelve packages

## The finding

The root `typecheck` script runs `pnpm -r run typecheck:test`. A package without that script is skipped
without a word, and twelve of them have none:

```
bin-compiler  bin-uws  core  go-be-sidecar  test-server
platform-aws  platform-bun  platform-cloudflare  platform-gcloud
platform-node  platform-uws  platform-vercel
```

So nothing type checks the seven platform adapters, `@mionjs/core`, or the CLI launcher. The only thing
standing between a type error in those packages and a release is whatever their own vitest run happens to
execute.

This is on `main`, not something a branch introduced:

```bash
git show origin/main:packages/platform-uws/package.json | grep typecheck:test   # nothing
```

## How it was found

A change to `packages/platform-uws/src/uwsHttp.ts` called `getGlobalResponseHeaders()` without importing
it. `pnpm run typecheck` passed. `pnpm run lint` passed. The bug only surfaced when the uws suite ran and
every request died:

```
ReferenceError: getGlobalResponseHeaders is not defined
 ❯ getResponseDefaults packages/platform-uws/src/uwsHttp.ts:37:4
 ❯ uwsRequestHandler packages/platform-uws/src/uwsHttp.ts:149:47
```

A missing import in production code is the cheapest possible thing for a type checker to catch. It shipped
because no type checker looked.

## What has to happen first

Turning the script on is one line per package. The work is the pre-existing errors it surfaces. Counts from
`pnpm exec tsc -p tsconfig.json --noEmit` in each package, ignoring the `TS6305` build-mode noise:

| package | errors |
| --- | --- |
| bin-uws | 22 |
| go-be-sidecar | 7 |
| platform-gcloud | 6 |
| platform-uws | 6 |
| platform-bun | 4 |
| platform-aws | 1 |
| bin-compiler | 1 |
| core, platform-cloudflare, platform-node, platform-vercel, test-server | 0 |

Almost all of them are in `.spec.ts` files, and most are the same shape: a `response.json()` result used
without narrowing.

```
src/security.spec.ts(48,12): error TS18046: 'body' is of type 'unknown'.
src/uwsHttp.spec.ts(208,14): error TS2571: Object is of type 'unknown'.
```

Five packages are already clean, so they can have the script the moment someone adds it.

## Done when

- Every package under `packages/` runs a type check, or the reason one cannot is written down.
- `pnpm run typecheck` fails on a missing import in any adapter's `src/`.
- A new package cannot join the workspace unchecked without something noticing. Worth deciding whether the
  check belongs per package at all, or whether one root project covering `packages/**` would be harder to
  leave a hole in. The existing `check:test-batches` gate is the model: it fails when a vitest project sits
  in no batch.
- The pre-existing errors are fixed rather than silenced. Do not reach for `as any`, `@ts-expect-error` or
  a loosened `tsconfig` to clear the table.

## Out of scope

- The type errors under `container/` and `scripts/`, which the root typecheck also does not cover. Same
  shape of problem, different tree, and those are not published.
