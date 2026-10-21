---
type: fix
spec: guidelines
status: done
created: 2026-09-04
---

# Measure the server benchmarks with wrk, not autocannon

## Intent

autocannon cannot measure the bun lanes reliably. That is why the benchmarks repo moved to
wrk before this repo absorbed it, and the reason is written on the commit that did it:
"add option to run the reports using wrk instead autocannon so we can get reliable results
for bun". Three of the ten lanes are bun (`mion.bun`, `hono.bun`, `elysia.bun`), so an
unreliable bun path is a third of every comparison the rpc benchmark pages publish.

The wrk work is not missing because the wrong branch was imported. The import came from
`mion-runtypes-`, and wrk was left out deliberately, for two reasons that are worth
re-examining: that the pages' method line describes autocannon (circular, the line is
generated from whatever ran) and that wrk needs a compiled binary in the image (real, but
ordinary work). Neither addressed the bun problem.

## Direction

The implementer investigates and plans. What is already established:

- **Upstream source.** `https://github.com/MionKit/Benchmarks`, branch `mion-runtypes-`,
  commits `b413b0e` (adds wrk beside autocannon) and `4200cf2` (re-runs with it). The
  branch is 38 commits ahead of `master`; the rest is mostly "run benchmarks for version
  X". `b413b0e` adds `lib/wrk.js`, `scripts/wrk/benchmark.lua` and
  `scripts/install-wrk.sh`, and touches `lib/autocannon.js`, `lib/bench.js`,
  `lib/payloads.js`, `reports.js`, `package.json`. Note it added wrk as an OPTION rather
  than a replacement, which is a decision to make again rather than inherit: one generator
  is simpler to reason about, two let the numbers be cross-checked.
  Read the whole branch for anything else worth having, which was the other half of this
  request. `claude/migrate-autocannon-to-wrk-zBxxV` is a 2024 dead end already in master.
- **Where it lands.** The harness is `container/mion-bench/harness/run.mjs`: autocannon is
  imported at the top and driven by `load()`, which also sets the request timeout and the
  in-flight budget, and feeds a fresh body per request through `setupRequest` so no
  framework can cache a response. Whatever replaces it has to keep the per-request body,
  the correctness gate that runs before any measurement (`verify` / `verifyRejects`) and
  the non-2xx check that deletes a failed lane's record.
- **The image.** wrk is a compiled binary, so `container/mion-bench/Containerfile` has to
  build or install it. That is the one genuinely new cost, and the reason it was deferred
  before; `scripts/install-wrk.sh` upstream is the starting point.
- **What reads the numbers.** `scripts/website/bench-data/gen-servers-docs.mjs` projects
  each result row and assembles the method line from what actually ran
  (`autocannon -c … -d … -p … localhost:3000`); `ServerBenchBars.vue` renders that line and
  a closed set of metrics (`requests`, `throughput`, `latency`, `maxMem`, `maxCpu`);
  `scripts/website/check-static.mjs` gates the datasets on deploy. If wrk reports a
  different metric set (its latency distribution in particular), the row shape, the
  component's metric registry and the pages may all move together, which is the "update the
  website functionality that reads them" half of this.
- **Pins that name autocannon.** `packages/devtools/test/repo-contracts.test.ts` asserts
  the baked harness manifest depends on `autocannon`, and a second test pins the
  request-timeout comment explaining autocannon's own 10s default. Both move with the
  change.
- **Prove the reason.** The point is bun measurability, so the acceptance evidence is a
  before/after on the three bun lanes, not just a green run. Run each lane repeatedly under
  both generators and compare the spread; the current numbers move enough between runs that
  mion changes position, which is the symptom to chase.

## Done when

- The server benchmarks are measured by wrk, on every lane, in the container.
- The bun lanes are repeatable: the same lane run twice lands within a stated tolerance,
  and that tolerance is written down somewhere a future reader will find it.
- The method line, the dataset and the rpc benchmark pages describe what actually ran.
- Whatever else on `mion-runtypes-` is worth having is either ported or listed, with a
  reason, so the next person does not have to read 38 commits to find out.

## Plan — wrk only, ported from upstream b413b0e (approved 2026-09-04)

Two decisions the Direction section left open were settled with the developer:

- **wrk only.** autocannon is removed rather than kept as a selectable loader. Upstream
  added wrk beside autocannon and then never removed the old one, which is how its own
  tables ended up printing `Method: autocannon …` under numbers wrk had produced. One
  generator, one code path, one method line.
- **The before/after evidence is taken with quick windows** on the 4 vCPU cloud box this
  was implemented on, so it is directional. The shipped tolerance says under what
  conditions it was measured, and `bench servers repeat` re-measures it on a real box.

### What upstream built, and where each piece lands

`b413b0e` is the whole wrk implementation and was never revised afterwards. Eight files:

| upstream | here |
| --- | --- |
| `lib/wrk.js` (spawn wrk, sample pidusage, parse the result) | folds into `container/mion-bench/harness/run.mjs`, which already spawns, samples and gates |
| `scripts/wrk/benchmark.lua` | `container/mion-bench/harness/wrk.lua` |
| `scripts/install-wrk.sh` (brew / build from source) | one apt layer in `container/mion-bench/Containerfile`; the benchmarks only ever run in the container |
| `lib/payloads.js` (bodies pulled out so both loaders share them) | `shared/payloads.mjs`, which already does this |
| `lib/bench.js` loader switch, `reports.js --loader`, the `report-*-wrk` scripts | not ported: wrk only |
| `testingTool: "wrk"` on the result | `loader: 'wrk'` on the record |
| the hello-world bun exclusion, lifted when `--loader=wrk` | nothing to lift; this repo never excluded them, which is the bug |
| upstream's `killForked()` (kill, wait 2s for the port) | already solved differently: every lane is its own `--rm` container |

Ported as-is: threads capped at 8, `--latency`, and wrk checked on PATH **before** any
server is forked, so a missing generator is not reported as a lane failure.

### Four deviations from upstream, each with a reason

1. **The bodies come from `shared/payloads.mjs`, not pasted into Lua.** Upstream's Lua
   hardcodes the two JSON bodies, so it holds a second copy that can drift from
   `lib/payloads.js`, and the payload-size sweep (1 KB to 4 MB, which upstream does not
   have) cannot be expressed that way at all. Here run.mjs splits one real built body
   around its `id` and hands Lua the halves; Lua stamps a fresh id per request.
2. **`done()` writes the result to a file** instead of printing a `__WRK_RESULT__` marker
   into the same stdout wrk writes its own summary to.
3. **Pipelining is implemented in Lua** (a batch of N formatted requests) rather than
   upstream's "the pipelining option is ignored". This repo records `pipelining` on every
   result and prints it in the published method line, so ignoring it would publish a
   number nothing honours, which is the mistake upstream made.
4. **The errors map onto this repo's correctness gate.** wrk reports
   `connect / read / write / status / timeout`; the record needs `non2xx` (`status`),
   `timeouts` (`timeout`) and `errors` (`connect+read+write+timeout`, autocannon's
   convention, so the existing `errors - timeouts` breakdown still reads). The gate
   deletes a failed lane's record, so the cause has to be in the thrown message.

### The rest

- `wrk` from Debian trixie (4.1.0-4, main, amd64 and arm64), pinned by the base image tag.
  `_deps/harness/package.json` drops `autocannon` and keeps `pidusage`.
- `run.mjs` keeps every load-bearing piece: `verify` / `verifyRejects` before any
  measurement, the non-2xx and error gate, `connectionsFor(size)` and the in-flight budget,
  the per-second sampler, the warm-up round. `MION_BENCH_TIMEOUT` becomes wrk's `--timeout`.
  The record gains `loader`, `threads` and `tolerance`; nothing else about its shape moves.
- New `pnpm miondevx bench servers repeat <app> [suite] [--runs N]`: runs one lane N times,
  prints the spread, fails above `MION_BENCH_TOLERANCE`. Threads default to half the cores
  (capped at 8) because the server needs cores too.
- `gen-servers-docs.mjs` assembles the method line from the record, so it names wrk, and
  passes the tolerance through; `ServerBenchBars.vue` renders one extra meta line for it.
- The autocannon pins in `packages/devtools/test/repo-contracts.test.ts` move to wrk, and
  new ones cover the Lua script, its mount, the method line and the per-request id.
- `container/mion-bench/README.md` carries the methodology, the tolerance and its measuring
  conditions, and the upstream ledger, so the next person does not read 38 commits.

## What shipped (2026-09-04)

Built as planned above, with three things worth recording because they differ from it.

### The tolerance is 10%, and it was measured, not guessed

The plan wrote 8% before anything had been run. Three full-length runs of each bun lane
on the 4 vCPU cloud box this was implemented on came out at 1.8% (`mion.bun`), 5.7%
(`hono.bun`) and 9.8% (`elysia.bun`), so 8 would have failed `elysia.bun` on its own
evidence. The shipped default is **10**, and the README says under what conditions that
was taken and that a dedicated benchmark machine should tighten it.

### wrk did not mainly reduce the noise, it removed a ceiling

The before/after was taken on the hello-world suite, three passes of all ten lanes under
each generator, short windows, same box:

| lane | autocannon req/s | spread | wrk req/s | spread |
| --- | --: | --: | --: | --: |
| elysia.bun | 16,423 | 7.6% | **56,264** | 2.4% |
| hono.bun | 17,953 | 6.8% | **30,367** | 8.3% |
| mion.bun | 18,812 | 4.6% | **24,029** | 5.9% |
| mion.uws | 17,607 | 16.5% | 28,528 | 4.0% |
| mion | 26,733 | 21.9% | 16,667 | 5.0% |

Under autocannon every bun lane ranked at the BOTTOM of the table, all ten lanes bunched
into 16-27k, and the bun spreads looked healthy. That apparent health was the stability
of a bottleneck: autocannon was pinning every lane at its own ceiling. Under wrk the
three bun lanes take the top three places and `elysia.bun` turns out to be capable of
3.4x the number autocannon could measure.

The "mion changes position between runs" symptom the Intent section named is the ranking
moving, and that is what tightened: `mion` went from 21.9% spread to 5.0%, `mion.uws`
from 16.5% to 4.0%. Raw spread on the bun lanes barely moved, for the reason above.

The node lanes now report LOWER numbers than autocannon did. That is expected and correct
on a 4 vCPU box: wrk takes real cores to push that load, and it is now the server rather
than the generator deciding the number.

### One unrelated-looking bug fixed on the way

`MION_BENCH_TIMEOUT` and `MION_BENCH_INFLIGHT_BUDGET` were never in the driver's
environment pass-through list, so setting either on the host silently did nothing inside
the container. Both are on the same code path this change rewrote (they are the knobs the
load generator reads), so they were fixed here rather than filed.

Also corrected while editing it: the mion-bench README still named `:bench-chart` and
`:server-bench-table`, two components a contract test says were removed.

### Verified

- 21 vitest projects, 11,664 tests, green. `pnpm run lint` clean, `pnpm run format` a no-op.
- The full wrk path exercised in the container: correctness gate, warm-up, measured
  window, memory sampling, record, dataset and method line.
- `pnpm miondevx bench servers repeat` run on all three bun lanes plus `mion`.

### Not done here

The rebuilt image was not pushed to GHCR. Docker Hub is blocked from this cloud session,
so the image was verified through a local overlay on the published one rather than a
clean build of the changed `Containerfile`. A maintainer runs
`pnpm miondevx container push mion-bench` from a machine that can reach Docker Hub;
until then CI falls back to building it locally.
