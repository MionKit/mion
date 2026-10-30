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

From a 4-core shared machine where unchanged code moved ±20% between runs (isValid on one case: 12 to 21 million/s),
so treat these as a hint to confirm. `bench-refs.mjs --report`, 3 base rounds, 1 round per state, getErrors change vs
`base` with machine drift removed, valid / invalid / mixed:

| Group | spreadFree | shortcutAllRoots | final |
| --- | --- | --- | --- |
| ALL | 0.99 / 1.15 / 1.21 | 1.14 / 1.00 / 1.07 | 1.05 / 1.11 / 1.13 |
| REALWORLD | 0.89 / 1.04 / 0.93 | 1.21 / 1.05 / 1.07 | 1.20 / 1.18 / 1.26 |
| CIRCULAR | 0.89 / 1.13 / 1.12 | 2.05 / 0.87 / 0.91 | 2.09 / 0.88 / 1.04 |
| STRICT | 0.98 / 1.14 / 1.63 | 1.89 / 1.18 / 1.35 | 2.47 / 1.58 / 1.15 |
| DATETIME | 0.99 / 1.02 / 1.11 | 1.07 / 0.82 / 0.95 | 0.75 / 1.11 / 1.09 |
| STRING_FORMAT | 0.97 / 0.93 / 1.05 | 1.03 / 0.91 / 0.97 | 1.02 / 1.00 / 1.03 |
| TEMPLATE_LITERAL | 0.82 / 1.15 / 1.41 | 0.85 / 0.86 / 0.95 | 0.69 / 0.93 / 1.04 |

The invalid-path losses of `shortcutAllRoots` on DATETIME and STRING_FORMAT are what limited the shortcut to container
roots. `final`'s valid-path drops on DATETIME and TEMPLATE_LITERAL sit in groups where its only change is moving the
`pth` / `er` defaults into the body (the isolated `date` case shows no cost), so they read as noise. They are the first
thing to confirm on a quiet machine. CIRCULAR's invalid path stays slower (the validator runs, then the full walk),
still well ahead of typia there.
