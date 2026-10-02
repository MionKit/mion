---
type: fix
spec: guidelines
status: ready
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
