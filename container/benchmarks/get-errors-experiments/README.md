# getErrors optimization experiments

Why `createGetValidationErrorsFn` trailed typia on the Get Errors charts, and one runnable check per idea tried,
kept or dropped. The charts plot the **valid** path. There, typia's `validate` runs its boolean check first and
builds errors only on failure, while mion always ran the full error walk.

## The ideas

| Idea | What it changes | Status |
| --- | --- | --- |
| `spreadFree` | `newRunTypeErr` builds the error path with `slice` / `concat`, no spreads | kept |
| `shortcut` | the error function asks the validator first when called without an errors list | kept, container roots only |
| `shortcutAllRoots` | the same shortcut on every root (strings, dates, unions too) | dropped: nothing gained on a valid value, the check runs twice on an invalid one |
| `shortcutDefaults` | the shortcut keeping `pth=[], er=[]` defaults, gated on `arguments.length` | dropped: two allocations per call instead of one |
| `spliceToLength` | `pth.length -= n` instead of `pth.splice(-n)` after a recursive call | dropped: no measurable effect |

A caller passing its own errors list always gets the full walk. The fuzz oracle relies on it to keep comparing
`validate` with an independent error walk.

## Run

Isolated, plain Node, about 2 minutes. Every variant runs in its own process. A gate checks first that every variant
returns exactly the errors `base` returns:

```bash
node container/benchmarks/get-errors-experiments/isolated-experiment.mjs --runs 7 --ms 1000
```

Real benchmark lane, about 5 minutes per state and round. Needs the bench image (`pnpm miondevx container login`) and a
clean tree:

```bash
node container/benchmarks/get-errors-experiments/bench-refs.mjs --rounds 3
```

`--dry-run` prints the commit behind each state. `--report` reprints from saved results. `--states base,final` picks
states. `spliceToLength` and `shortcutDefaults` were never built into the generator, so only the isolated experiment
covers them.

## First numbers (noisy cloud box)

From a 4-core shared machine where unchanged code moved ±20% between runs, so treat these as a hint to confirm.
getErrors change vs `base`, machine drift removed, valid / invalid / mixed:

| Group | spreadFree | shortcutAllRoots | spreadFree + shortcutAllRoots |
| --- | --- | --- | --- |
| ALL | 0.98 / 1.12 / 1.16 | 1.12 / 0.97 / 1.03 | 1.09 / 0.96 / 1.03 |
| REALWORLD | 0.97 / 1.02 / 0.95 | 1.33 / 1.03 / 1.10 | 1.64 / 1.20 / 1.16 |
| CIRCULAR | 0.91 / 1.00 / 0.94 | 2.10 / 0.77 / 0.76 | 2.17 / 0.73 / 0.77 |
| STRICT | 0.91 / 1.03 / 1.44 | 1.75 / 1.06 / 1.19 | 1.48 / 1.09 / 1.10 |
| DATETIME | 0.99 / 0.95 / 1.11 | 1.07 / 0.76 / 0.95 | 0.96 / 0.68 / 0.87 |
| STRING_FORMAT | 1.00 / 0.95 / 1.03 | 1.06 / 0.92 / 0.95 | 1.00 / 0.77 / 0.87 |

The DATETIME and STRING_FORMAT losses on the invalid path are what limited the shortcut to container roots.
CIRCULAR's invalid path stays slower (the validator runs, then the full walk), still well ahead of typia there.
