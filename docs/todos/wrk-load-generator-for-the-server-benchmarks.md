---
type: fix
spec: guidelines
status: ready
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
