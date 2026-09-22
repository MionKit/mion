---
type: fix
spec: guidelines
status: done
created: 2026-09-22
---

# `pnpm run typecheck` silently skips twelve packages

## The finding

The root `typecheck` script runs `pnpm -r run typecheck:test`. A package without that script is skipped
without a word, and twelve of them had none:

```
bin-compiler  bin-uws  core  go-be-sidecar  test-server
platform-aws  platform-bun  platform-cloudflare  platform-gcloud
platform-node  platform-uws  platform-vercel
```

So nothing type checked the seven platform adapters, `@mionjs/core`, or the CLI launcher. The only thing
standing between a type error in those packages and a release was whatever their own vitest run happened
to execute.

This was on `main`, not something a branch introduced:

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

## What shipped

### One config per package, the pattern the repo already had

The blocker is `references`. A package's `tsconfig.json` was a BUILD config being used to check: composite,
with `references` naming its siblings. tsc then resolves every cross-package import to the sibling's
declaration output and reports it unbuilt:

```
$ tsc -p packages/platform-node/tsconfig.json --noEmit
error TS6305: Output file 'packages/core/.dist/esm/index.d.ts' has not been built from
              source file 'packages/core/index.ts'
```

Isolated on two copies of that one config, only `references` matters:

| copy | TS6305 errors |
| --- | --- |
| `references` removed, `composite: true` kept | 0 |
| `composite: false`, `references` kept | 12 |

`references` has no command-line flag, so no combination of flags on the one command that runs them all
gets there. That is also why the editor was always fine: its language server never runs build bookkeeping,
and on a machine that has built once the declarations exist and `tsc -p` is clean too. On a fresh checkout
nothing is built, and CI cannot build first because `pretypecheck` builds the Go binary plus the run-types
and devtools dists, not the mion package dists.

`drizzle-orm-pg-core` already solved this, with the answer written in its own comment: the check config is
non-composite with no references, and `tsconfig.build.json` carries the emit. Fourteen packages had never
been migrated. They are now, so `tsconfig.json` is the one config the check and the editor share, and it
never looks at dist:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {"composite": false, "noEmit": true, "incremental": false, "rootDir": "../.."},
  "include": ["."],
  "exclude": ["node_modules", ".dist", "vite.config.ts"]
}
```

`tsconfig.build.json` is the only place dist appears. It re-enables what the check turns off, and its
`references` name sibling BUILD configs because a reference target must be composite:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {"composite": true, "noEmit": false, "incremental": true,
                      "outDir": ".dist/esm", "rootDir": "."},
  "references": [{"path": "../core/tsconfig.build.json"}],
  "exclude": ["...", "**/*.spec.ts", "**/*.test.ts"]
}
```

The root tsconfig references the build configs for the same reason. Every `typecheck:test` is now one line,
`tsc -p tsconfig.json --noEmit`, and no package carries a second config for checking. Nothing compiles with
`tsc` anyway: every package builds with `vite build`, and declarations come from `vite-plugin-dts` reading
`tsconfig.build.json`.

Two packages keep a `tsconfig.test.json`, both pre-existing and both left alone: `run-types`, whose
`tsconfig.json` IS its ESM build config, and `devtools`, which builds with `tsc --build tsconfig.dist.json`
rather than vite.

Two stale reference targets were fixed on the way. `devtools/tsconfig.build.json` named the check configs of
core and router, and the root named `type-budget`, which is never built and not composite. Both would fail
`tsc --build` with TS6306; the type-budget one predates this change. Every reference target in the repo is
now composite, which was not true before.

Four packages needed more than the shared four options, each for a reason written into the file:

| package | what it needed |
| --- | --- |
| bin-uws | `"types": ["node", "vitest/globals"]`: its vitest runs `globals: true`, so `describe`, `it` and `expect` are ambient. All 22 of its reported errors were this one missing entry. Also `allowJs` + `checkJs` over `lib/`, see below |
| platform-bun | `"paths": {}`: under `moduleResolution: bundler` the root `paths` entry reaches each package's built dist, so the program held both the `src` and the `dist` copy of every run-types type. Same fix, and the same reason, as `examples/tsconfig.check.json` |
| platform-bun | its `tsconfig.json` set `"lib": []`, which left the program on es2020 and failed on `Object.hasOwn` in `core`. Dropped, so it inherits the `["ES2023"]` its `target` already declares |
| go-be-sidecar | `rootDir: "../.."`: its fuzz specs import the shared harness out of `packages/run-types`, and six of its seven errors were TS6059 rootDir complaints |

`bin-compiler` is not TypeScript: `lib/index.js` behind a hand-written 7-line `lib/index.d.ts`, plus
`bin/cli.js`. It got a `tsconfig.json` with `allowJs` + `checkJs`, which checks the implementation against
its own declarations.

### A second package shipping unchecked JavaScript

Writing the coverage test turned up the same bug one package over: `packages/bin-uws/lib/index.js`, the
shipped uWebSockets loader, was in no project at all. Its `tsconfig.json` included only
`lib/index.d.ts`, so the declarations were read and the 136-line implementation behind them never was.
Its `tsconfig.json` now covers `lib/` with `checkJs`. It was already clean.

### The errors, fixed rather than silenced

The counts in the original finding came from a run with the TS6305 noise in it. Measured against the real
config, three packages the finding called clean were not, and the true total was 29:

| package | errors |
| --- | --- |
| platform-gcloud | 6 |
| platform-uws | 6 |
| platform-vercel | 6 |
| platform-cloudflare | 4 |
| platform-node | 3 |
| bin-uws | 22, all one missing `types` entry |
| go-be-sidecar | 7, six of them one missing `rootDir` |
| platform-bun | 2 |
| platform-aws | 1 |
| bin-compiler | 1 |
| core, test-server | 0 |

Most were the same shape, a `response.json()` result indexed without narrowing:

```
src/security.spec.ts(48,12): error TS18046: 'body' is of type 'unknown'.
src/uwsHttp.spec.ts(208,14): error TS2571: Object is of type 'unknown'.
```

Every one of those reads the mion response envelope, so each spec declares the shape it reads, built from
the types `@mionjs/core` already exports:

```ts
type RpcBody = Record<string, unknown> & Record<typeof MION_ROUTES.thrownErrors, Record<string, PublicRpcError<string>>>;
```

The rest were one-offs:

- **platform-vercel** `src/security.spec.ts` passed `basePath: ''` to `setVercelHandlerOpts`, and
  `VercelHandlerOptions` has no such field. The vercel adapter never strips a path prefix (cloudflare's
  does, and has the option); the line was a copy-paste that did nothing. Removed.
- **platform-aws** `src/awsLambda.spec.ts` built its event with `@serverless/event-mocks`, a CommonJS
  package whose default import lands on the module namespace under NodeNext, so the call was not callable
  and only worked because vite applies its own interop. The library is a typed deep-merge over a JSON
  template, and the test already passed all twelve fields of `APIGatewayProxyEvent`, so the event is now a
  typed literal. The dependency was used nowhere else and is gone from the root `devDependencies`.
- **platform-gcloud** `src/googleCF.spec.ts` annotated a helper with `BodyInit`, which is not a global
  under `types: ["node"]`. Now `NonNullable<RequestInit['body']>`, and `RequestInit` is global (the same
  file already used it).
- **go-be-sidecar** `test/patternGenFuzz.test.ts` annotated a `spawn` with
  `stdio: ['pipe', 'pipe', 'ignore']` as `ChildProcessWithoutNullStreams`. That stdio gives a null stderr,
  so the annotation is now `ChildProcessByStdio<Writable, Readable, null>`.
- **bin-compiler** `bin/cli.js` read `err.status` off a `catch` binding. Narrowed with `in` rather than
  cast.

No `as any`, no `@ts-expect-error`, and no tsconfig was loosened. Two tsconfig changes went the other way:
platform-bun gained the ES2023 lib its target already declared, and bin-uws gained the `lib/` its
declarations describe.

### The gate

New `scripts/core/typecheck-coverage.mjs`, modelled on `scripts/core/test-batches.mjs`: pure exported rules
plus a `--check` CLI. The root script runs it before the recursive run, so `pnpm run typecheck` itself fails
on a hole rather than a separate lane noticing later:

```json
"typecheck:test": "node scripts/core/typecheck-coverage.mjs --check && pnpm -r run typecheck:test",
"check:typecheck-coverage": "node scripts/miondevx.mjs core typecheck-coverage --check",
```

Plus a `core typecheck-coverage` row in the devx registry, so `miondevx core --help` renders it, and a
named CI step beside the other drift gates so a failure reads as the gap it is rather than as a typecheck
error. A package may be exempt only with a written reason in the script's `EXEMPT` list. That list is
empty: all 22 packages run a type check.

Decided against one root project covering `packages/**`, which the finding floated as the alternative.
The packages do not share a compiler setup: platform-bun runs on `bun-types` with bundler resolution and
cleared paths, bin-uws needs vitest's ambient globals, the two JavaScript packages need `checkJs`,
go-be-sidecar keeps `noImplicitAny: true`, and `examples` splits one `src/` tree across three programs on
purpose. One project would have to be the loosest of all of them.

The gate asks two things, because the script existing is not the same as it looking at the code: bin-uws
had one, and its shipped `lib/index.js` sat in no project at all.

1. **Coverage.** Every package declares `typecheck:test`, or names itself in `EXEMPT` with a reason.
2. **Reach.** Per package, expand every tsconfig its own scripts and the root's name, then check the union
   contains every tracked file under `src/`, `lib/` and `bin/`. Expanding uses TypeScript's own config
   parser rather than 25 `tsc --showConfig` spawns: 0.5 s for the whole gate against ~17 s. One deliberate
   omission is listed with its reason (`examples/src/run-types/comparison-typia.ts`, which compares against
   a typia the workspace does not install), and a floor on the swept file count keeps a bad pathspec from
   turning the check into a no-op.

The reach check went into the gate script rather than a vitest contract because
`ci-lane-contracts.test.ts` says so, and caught the first attempt:

```
expect(contracts).not.toContain("['ls-files', '-z'");
```

A whole-tree sweep belongs in `scripts/ci/check-tree.mjs`, which runs ungated with git plus node and no
install. This one needs the installed `typescript`, so it rides the typecheck it gates instead.

### Tests

In `packages/devtools/test/repo-contracts.test.ts`, which is already the home for gates over
hand-maintained mirrors, and only the rules rather than a sweep: `coverageDrift` against the real tree
plus a fixture case per drift kind, `projectsOf` over a package's own scripts and the root's, and
`staleOmissions` for an omission that no longer names a file. Adds 0.2 s to the suite.

Verified by hand as well. Removing an import from `packages/platform-uws/src/uwsHttp.ts` now fails the
check with `error TS2304: Cannot find name 'bufferedResponseHeaders'`, which is the class of bug that
started this. And narrowing platform-uws's project to a single file fails the gate:

```
gap `pnpm run typecheck` does not cover all of packages/:
   platform-uws ships 7 file(s) no project reaches:
      src/bodyDrain.spec.ts
      ...
```

`pnpm run typecheck` went from 34 s to 46 s on this host, for eleven more packages.

## Done when

- [x] Every package under `packages/` runs a type check. All 22, with an empty exempt list.
- [x] `pnpm run typecheck` fails on a missing import in any adapter's `src/`. Verified by removing one.
- [x] A new package cannot join the workspace unchecked without something noticing: the gate runs inside
      `pnpm run typecheck` itself, and a contract test pins it.
- [x] The pre-existing errors are fixed rather than silenced.

## Out of scope

- The type errors under `container/` and `scripts/`, which the root typecheck still does not cover. Same
  shape of problem, different tree, and those are not published.
- Test trees rather than shipped sources. The reach test checks `src/`, `lib/` and `bin/`. Two test trees
  sit outside their package's project on purpose, each with the reason written where it is excluded:
  `run-types/test/playground/` imports the engine cross-tree out of `container/website` and runs as its
  own vitest project, and `devtools/test-fixtures/` holds code written to trigger lint rules.
