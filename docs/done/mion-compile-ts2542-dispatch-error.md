---
type: fix
spec: guidelines
status: done
created: 2026-10-03
---

# mion compile reports TS2542 in dispatchError.ts that tsc does not

## Intent

`mion compile` now reports TypeScript errors the way `tsc` does. On `packages/private-test-server` it reports one
that plain `tsc` on the same tsconfig does not:

```
packages/rpc-router/src/lib/dispatchError.ts(77,3): error TS2542: Index signature in type 'Readonly<Record<string, RpcError<string, any>>>' only permits reading.
```

Repro, from the repo root:

```bash
cd packages/private-test-server
../../mion-bin/mion compile --cwd $PWD --tsconfig tsconfig.json --gen-dir /tmp/gen --no-emit   # reports TS2542
../../node_modules/.bin/tsc -p tsconfig.json --noEmit                                          # exits 0
```

The line is `thrownErrors[key] = rpcError;` in `addThrownError`, where
`const thrownErrors = context.request.thrownErrors || ({} as Record<string, RpcError<string>>);` and
`MionRequest.thrownErrors` is `Readonly<Record<string, RpcError<string>>>` (`packages/rpc-router/src/types/context.ts:49`).
`mion compile` checks with the bundled tsgo, which types the `||` union as readonly; tsc does not. Any consumer
that runs `mion compile` over the router's source (an in-repo build through the `source` condition) hits it.

## Direction

- Make the code correct under both checkers, most likely by typing the local as a mutable record in
  `addThrownError`, so no cast to readonly survives the write.
- Find out whether other files raise errors under `mion compile` that `tsc` does not: run `mion compile --no-emit`
  over each package tsconfig that compiles router or core sources and compare with `tsc -p … --noEmit`.
- Decide whether CI should run that comparison, so a tsgo-only error fails CI instead of a consumer's build.
- The implementer plans the details.

## Docs

None, because this is a source fix with no user-visible behaviour change.

## Done when

- `mion compile --no-emit` on `packages/private-test-server` reports no TypeScript error.
- Any other tsgo-only errors found are fixed in the same PR, each covered by the comparison above.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan, automatic run (approved 2026-10-03)

Delegated session with no one to answer, so the plan ran in automatic mode.

- Fix: `addThrownError` casts the whole `||` union to `Record<string, RpcError<string>>`, so the write type-checks under tsgo and tsc.
- Sweep: ran `mion compile --no-emit` and `tsc -p … --noEmit` over every package `tsconfig*.json`. The only tsgo-only
  error a consumer can hit was this TS2542, in every project that pulls router sources. The other differences:
  - `run-types/tsconfig.cjs.json` raises TS5108 (`moduleResolution: node10` removed in tsgo). It is read by tsc only
    (the CommonJS emit), so the new check skips it with that reason.
  - `private-test-server/tsconfig.build.json` and the examples' `tsconfig.runtypes.json` fail under both checkers
    without built dists, so they are not tsgo-only.
- CI: `scripts/core/tsgo-check.mjs` (`pnpm run check:tsgo`, `pnpm miondevx core tsgo-check`) runs `mion compile --no-emit`
  over every project a package or root script names with `-p` (minus `TSC_ONLY`) and fails on any `error TS` line. The root `typecheck` runs it last,
  so CI's lint job runs it. About 20 s for 26 projects.
- Tests: `repo-contracts.test.ts` pins the root wiring, the tsc-only list and the error-line parser. The check itself
  fails on the old `dispatchError.ts`.
