# A red `fuzz soak` lane blocks the release

- Soak lanes = only place fuzz budgets run with a varying seed. The gate surfaces latent bugs,
  including ones this release did not introduce.
- **Every red soak lane blocks anyway.** No "it predates this version, ship it" carve-out.
- The finding is real and reproducible from the seed the job printed.
  A release is the worst moment to start trusting an unfixed oracle violation.
- Fix forward on `main` and re-cut, as in [promote.md](promote.md#red-job--fix-forward-on-main).
- `nondata` lane soaks 10 minutes in its own workflow, `fuzz-nondata-soak.yml`,
  called by the gate as its `fuzz-soak-nondata` job. Red there blocks the same way.

## Never re-roll the seed

- A fresh seed that passes is not evidence the bug is gone, only that the new seed did not reach it.
  The lane draws from a huge space; most draws miss any given defect.
- The green that counts: the failing seed replayed after the fix,
  `MION_FUZZ_SEED=<seed> pnpm miondevx core fuzz <lane> --soak` (the job echoes it on its first line).

## Deferring

- Default: fix the finding inside the cycle.
- Shipping without the fix = explicit developer decision, never an agent one: ask.
- Developer defers → `docs/todos/` spec naming the lane, the seed and the oracle, before anything ships.
  That spec is work still owed after the release, not a way to close the finding out.

## Drain between releases

- `fuzz-soak.yml` runs the same twelve lanes on demand (`gh workflow run fuzz-soak.yml`, or the Actions tab).
- Cost: twelve short jobs instead of the whole gate. Stops paying for findings at release time.
