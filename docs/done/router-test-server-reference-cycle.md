---
type: fix
spec: guidelines
status: done
created: 2026-09-22
---

# The router to test-server project reference made the whole graph circular

## The finding

`tsc --build` could not run over this workspace at all:

```
$ pnpm exec tsc --build tsconfig.json --dry
error TS6202: Project references may not form a circular graph. Cycle detected:
  /home/user/mion/tsconfig.json
  /home/user/mion/packages/router/tsconfig.json
  /home/user/mion/packages/test-server/tsconfig.json
```

pnpm said the same thing on every install:

```
[WARN] There are cyclic workspace dependencies: .../packages/devtools, .../packages/run-types;
       .../packages/platform-cloudflare, .../packages/router, .../packages/test-server
```

Eight cycles existed in the project-reference graph (four once rotated to a canonical start), and
every one of them ran through a single edge:

```
packages/router/tsconfig.json       "references": [{"path": "../core"}, {"path": "../test-server"}]
packages/test-server/tsconfig.json  "references": [core, router, platform-node, platform-cloudflare, platform-vercel]
```

## Why the edge was there

One file needed it. `packages/router/test/fuzz/security/httpFuzzRunner.ts`, the `sechttp` fuzz lane,
reached into two other packages:

```ts
import {compactTestRoutes} from '@mionjs/test-server';
// relative on purpose: the router package does not depend on its own adapter, the lane does
import {setNodeHttpOpts, startNodeServer, resetNodeHttpOpts} from '../../../../platform-node/src/mionHttp.ts';
```

The suite was the right idea in the wrong place: it drives hostile HTTP at the router through the
real node adapter, using the test-server fixture's routes. A package's own test tree cannot
legitimately import its downstream consumers.

The second import was the load-bearing one: a relative import into another package's source from a
composite project, which is illegal and only survived because the test-server reference gave tsc a
transitive path to platform-node. Deleting the reference alone surfaced it at once:

```
../platform-node/index.ts(8,15): error TS6059: File '.../platform-node/src/mionHttp.ts' is not under
  'rootDir' '/home/user/mion/packages/router'. 'rootDir' is expected to contain all source files.
../platform-node/index.ts(8,15): error TS6307: File '.../platform-node/src/mionHttp.ts' is not listed
  within the file list of project '.../packages/router/tsconfig.json'.
```

So the suite had to move.

## What shipped

**The suite moved into a NEW private package, `@mionjs/test-router-fuzz`.** `packages/router/test/` held
nothing else, so the directory is gone and router's tsconfig reference and its `@mionjs/test-server`
devDependency went with it.

`test-server` was tried first and rejected. It works, but it forces that package into a two-tsconfig
split (a typecheck-only `tsconfig.json` plus an emitting `tsconfig.build.json` that excludes `test/`),
a shape only `drizzle-orm-pg-core` uses. Paying that in a package that actually ships is the wrong
trade. `platform-node` is not a home either: it would need a reference to test-server, which recreates
the cycle the other way round.

A private package that NOTHING references has no back-edge to close, so the cycle cannot come back
through it. Five files, modelled on `packages/type-budget`:

```
packages/test-router-fuzz/package.json
packages/test-router-fuzz/tsconfig.json
packages/test-router-fuzz/vitest.config.ts
packages/test-router-fuzz/CLAUDE.md
packages/test-router-fuzz/test/fuzz/security/{httpFuzz.integration.test.ts,httpFuzzRunner.ts}
```

The `test/fuzz/security/` path is kept so the `sechttp` dispatch pattern in `scripts/miondevx.mjs`
(`patterns: ['security/httpFuzz.integration']`) keeps matching, and the directory sits at the same
depth as its old home, so the relative `../../../../run-types/test/fuzz/core/*` imports are unchanged.
Every cross-package import is a plain package name now:

```ts
import {createMionRouter, resetRouter, getRouteExecutionChain, setPlatformConfig, dispatchRoute,
        headersFromRecord, decodeQueryBody, registerBatches, getRouterFatalErrorResponse} from '@mionjs/router';
import {setNodeHttpOpts, startNodeServer, resetNodeHttpOpts} from '@mionjs/platform-node';
import {compactTestRoutes} from '@mionjs/test-server';
```

Nine symbols, not the eight the original survey counted: a **dynamic** import of
`getRouterFatalErrorResponse` sat inside a catch block and was missed by a grep of the import block.
It failed at run time, not at type-check time, with `Cannot find module '/src/lib/dispatchError.ts'`.
It is a static import now.

**The package has ONE tsconfig and no `references`.** `composite: false`, `noEmit: true`,
`rootDir: "../.."`, and it is deliberately absent from the root tsconfig's references, following
`packages/go-be-sidecar`. Non-composite with a widened root is what makes the relative import of the
run-types fuzz core legal (a composite project with `rootDir: "."` refuses a source file above its
root, TS6059). Its `vitest.config.ts` DOES install `mionVitePlugin`, unlike the other test-only
projects: the suite declares its own fixture routes, and without build-time type information every one
fails at run time with `MissingRtFnsError`.

**Registration.** `vitest.config.ts` lists the project, it joins the `mion-core` batch in
`scripts/core/test-batches.mjs` (where the suite already ran as part of `router`), and
`packages/devtools/test/test-batch-contracts.test.ts` classifies it `LIGHT` because its tests carry
their own inline timeouts. The root `package.json` `lint:eslint` and `lint-staged` brace globs name it
so the suite is linted exactly as it was before. Nothing else needed a hand-written entry: private
packages are filtered out of every release script and of the thin-README and publishable-manifest
contracts, and `scripts/ci/lanes.mjs` classifies by the `packages/` prefix.

**A gate stops the cycle coming back.** `scripts/ci/check-tree.mjs` grew a sweep over the project
graph: `referenceGraph` walks the `references` of every reachable tsconfig from the root, and
`referenceCycles` reports each cycle once, rotated to start at its alphabetically first project.
Both are pure, and `packages/devtools/test/repo-contracts.test.ts` drives them with fixtures plus one
case over the real tree. Putting the old reference back makes it fail:

```
==> no tsconfig project reference cycle — 4 offender(s):
  packages/router/tsconfig.json -> packages/test-server/tsconfig.json -> packages/router/tsconfig.json
  packages/platform-node/tsconfig.json -> packages/router/tsconfig.json -> ... -> packages/platform-node/tsconfig.json
  packages/platform-cloudflare/tsconfig.json -> ...
  packages/platform-vercel/tsconfig.json -> ...
```

**The reasoning lives in the repo, not only here.** `packages/test-router-fuzz/CLAUDE.md` says why the
package exists and why its tsconfig carries no references; `packages/router/CLAUDE.md` carries the rule
that a package's test tree never imports a downstream consumer. Neither names this document.

## What was checked and left alone

- **`client` has the same dependency and no cycle.** It imports `@mionjs/test-server` from 17 files,
  which is fine because nothing references `client`. Untouched.
- **`devtools` / `run-types`** appear in pnpm's cyclic warning but have no tsconfig `references`
  between them, so they are a package.json cycle only. Still warned about, still out of scope.
- **`test-server` was left untouched.** It keeps its single composite tsconfig and its `echo` test
  script; nothing about this fix reaches into it.

## Out of scope

- The `devtools` / `run-types` package.json dependency cycle. Different mechanism, no tsconfig
  references involved, and it does not block build mode.
- Making `tsc --build` a typecheck path. It cannot be one: `tsc --build --noEmit` is refused outright
  with 45 instances of `error TS6310: Referenced project '...' may not disable emit`, cycle or no
  cycle. So this fix does NOT let the per-package `tsconfig.test.json` files go away, and nobody
  should expect it to. The reason to do it was a correct project graph and a test file that no longer
  reaches into two other packages illegally.
