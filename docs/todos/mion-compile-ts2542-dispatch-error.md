---
type: fix
spec: guidelines
status: ready
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
