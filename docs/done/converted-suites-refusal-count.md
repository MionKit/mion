---
type: fix
spec: guidelines
status: done
created: 2026-10-02
---

# Converted-suites refusal count is stale on main

## Intent

`pnpm miondevx core converted-suites` fails on `main` (reproduced on a macOS host and in CI):

```
-> builders: rewrote 87 file(s), 21 refusal(s)
converted-suites: builders produced 21 refusals, expected 22.
A limitation was fixed. Lower the expected count in this file with the commit that fixed it.
```

The expected count lives in `scripts/core/converted-suites.mjs:28` (`expectedRefusals: 22` on the `builders` target).
A change already on `main` removed one refusal without lowering the count. The check only runs in the release gate
(`release-gate.yml`, job "suite tree in the value forms"), so no PR lane caught it, and the next release cut fails there.
Seen in the `workflow_dispatch` run https://github.com/MionKit/mion/actions/runs/37071291695.

## Direction

- Find which refusal went away (compare the 21 printed refusals with the previous set) and which commit removed it.
- If the drop is a real fix, lower the count to 21. If a refusal vanished because a conversion now silently emits
  something wrong, fix that instead.
- Consider whether a PR lane should run this check when the convert code or the converted suites change, so the
  count cannot drift again unseen.

## Done when

- `pnpm miondevx core converted-suites` passes on `main`.
- The reason the count changed is recorded in the commit message.

## Plan (approved 2026-10-02, implemented the same day)

Findings: building the resolver at 2fc113bdb6 (where 22 was set) and converting that commit's own suite tree gives
exactly 22 refusals. Diffed against today's 21:

| Change | Refusals | Commit |
|---|---|---|
| `SerializationCase` and `OverrideCase` lost a `[Symbol.toStringTag]` member (binary encoder types removed) | -2 | 7880680422 (binary serialization removal) |
| New `DeclaredKeys` helper type in `strict-validation/Strict.ts` refuses ("cycle through an unnamed type") | +1 | 883f5ea2ed (feature tests use the checkUnknowns validators) |

Neither is a conversion that now emits something wrong. The `DeclaredKeys` refusal is the documented unnamed-cycle
limit: `DeclaredKeys | null` is a new union with no name, and the cycle runs through it. Naming that union makes it
convert, so the website's advice holds.

What shipped:

1. `scripts/core/converted-suites.mjs`: `expectedRefusals: 21`, the reason in the commit message.
2. Same script: `--refusals-only` converts and checks the count and the documented list, without the vitest run
   over the tree (about 2 s). Listed in the `converted-suites` row of `scripts/lib/devx-registry.mjs`.
3. `ci.yml` runs `pnpm miondevx core converted-suites --refusals-only` on the `go-tools` lane, whose inputs cover
   the suites, the run-types sources and the converter. The full run stays in `release-gate.yml`.
4. `packages/devtools/test/ci-lane-contracts.test.ts` pins that step to the go-fuzz job and the lane's inputs; `packages/devtools/test/converted-suites.test.ts` runs the flag and checks it skips only the test run.

Found on the way and handed to a separate session with its own todo: convert drops `readonly` on tuples.
