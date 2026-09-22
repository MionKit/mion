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

**The suite moved into `packages/test-server`.** `packages/router/test/` held nothing else, so the
directory is gone and router's tsconfig reference and its `@mionjs/test-server` devDependency went
with it. test-server already referenced core, router, platform-node, platform-cloudflare and
platform-vercel, so every import in the suite is now a package name or a path inside test-server:

```ts
import {createMionRouter, resetRouter, getRouteExecutionChain, setPlatformConfig, dispatchRoute,
        headersFromRecord, decodeQueryBody, registerBatches, getRouterFatalErrorResponse} from '@mionjs/router';
import {setNodeHttpOpts, startNodeServer, resetNodeHttpOpts} from '@mionjs/platform-node';
// relative, not '@mionjs/test-server': this file lives inside that package
import {compactTestRoutes} from '../../../src/test-server.ts';
```

Nine symbols, not the eight the original survey counted: a **dynamic** import of
`getRouterFatalErrorResponse` sat inside a catch block and was missed by a grep of the import block.
It failed at run time, not at type-check time, with `Cannot find module '/src/lib/dispatchError.ts'`.
It is a static import from `@mionjs/router` now.

**test-server's tsconfigs took the shape `drizzle-orm-pg-core` already uses** for the identical
problem (a fuzz spec that imports the run-types fuzz core by relative path). Excluding `test` from
the one `tsconfig.json` was tried first and broke both eslint (`projectService` finds the nearest
tsconfig, and the suite was in none) and the devtools resolver (it only injects type information for
call sites its program can see, so every route failed with `MissingRtFnsError`). The split instead:

- `tsconfig.json` is typecheck-only now: `composite: false`, `noEmit: true`, `rootDir: "../.."`.
  It includes `test`, so eslint, the editor and the vitest plugin all see the suite.
- `tsconfig.build.json` re-enables composite and emit, keeps the five references and excludes `test`.
  The root `tsconfig.json` and `packages/client/tsconfig.json` point their references at it.

**test-server got a vitest project and a typecheck script.** `packages/test-server/vitest.config.ts`
declares the project `test-server` (`include: ['test/**/*.test.ts']`), the root `vitest.config.ts`
lists it, and it joins the `mion-core` batch in `scripts/core/test-batches.mjs`, which is where the
suite already ran as part of `router`. `package.json` gained `"typecheck:test": "tsc -p tsconfig.json
--noEmit"` and its `test` script is `vitest run` rather than an echo.

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

## What was checked and left alone

- **`client` has the same dependency and no cycle.** It imports `@mionjs/test-server` from 17 files,
  which is fine because nothing references `client`. Untouched.
- **`devtools` / `run-types`** appear in pnpm's cyclic warning but have no tsconfig `references`
  between them, so they are a package.json cycle only. Still warned about, still out of scope.
- **`platform-node` was not a viable home** for the suite: it would need a reference to test-server,
  which recreates the cycle the other way round.

## Out of scope

- The `devtools` / `run-types` package.json dependency cycle. Different mechanism, no tsconfig
  references involved, and it does not block build mode.
- Making `tsc --build` a typecheck path. It cannot be one: `tsc --build --noEmit` is refused outright
  with 45 instances of `error TS6310: Referenced project '...' may not disable emit`, cycle or no
  cycle. So this fix does NOT let the per-package `tsconfig.test.json` files go away, and nobody
  should expect it to. The reason to do it was a correct project graph and a test file that no longer
  reaches into two other packages illegally.
