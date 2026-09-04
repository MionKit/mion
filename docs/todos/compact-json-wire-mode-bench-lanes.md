---
type: feature
spec: guidelines
status: blocked
created: 2026-09-03
---

# A compact JSON lane and a bytes chart on the payload benchmarks

## Intent

Show what compact JSON buys on the wire, with measurements rather than a claim. Compact
drops every key name from an object, writing `{a, b}` as `[v.a, v.b]`, so the win shows on
real-world objects with many properties and repeats, and is zero on flat arrays of scalars.

The payload benchmarks page is where that belongs: it is the page about payload size.

## Blocked on

A router that can already serve a route over the compact wire, and a client that speaks it.
That is a separate piece of work and it comes first. Until it exists there is nothing to
measure here, because a compact lane is just a mion server started with a compact route
option.

## Direction

Decisions already taken:

- **One extra lane**, `mion.compact`, on the node adapter. The comparison being made is
  JSON versus compact, not adapter versus adapter, so one adapter carries it. It runs every
  suite like every other app, rather than gaining a per-app suite filter that would be the
  first of its kind in the registry; only the sweep is charted, but the other suites make
  the correctness gate prove the compact wire round-trips the light and heavy models too.
- **The chart goes on the payload benchmarks page only**
  (`container/website/content/03.benchmarks/02.rpc/04.payload-sizes.md`). The hello world,
  light validation and heavy validation pages are untouched.
- **The sweep pads with repeated payment-method objects.** `buildUserOfSize`
  (`container/mion-bench/shared/payloads.mjs:70`) grows `tags: string[]`, where compact
  saves exactly nothing. `paymentMethods: PaymentMethod[]` is already a declared
  discriminated union on the model (`container/mion-bench/shared/models.ts`), so every
  competitor's existing schema validates the padding unchanged and compact has key names to
  strip. Today's published sweep numbers change for every lane as a result, and the sweep
  does more validation work per byte than it used to; say so in the builder's comment.

What was verified:

- The harness sends a fixed `application/json` body and checks the echoed id by key
  (`container/mion-bench/harness/run.mjs`, `verify` and `verifyRejects`). A compact lane
  needs a compact request body and a gate that can read a positional response, or it fails
  the correctness check by design.
- The harness is plain node with no codec, so it cannot hand-write a positional body, and
  hand-writing one would be a second copy of the wire that drifts from the real codec. The
  mion app is already built in-container by vite plus the devtools
  (`container/mion-bench/apps/mion/vite.config.ts`), so an extra build entry that encodes
  the samples with the real compiled encoder and prints them is the way in.
- wrk varies the id per request by splitting one body around it (`bodyTemplate` in
  `run.mjs`, `container/mion-bench/harness/wrk.lua`). The current split is a `"id":<digits>`
  regex, which no positional body matches; splitting on the id's own value instead works
  for both wires and needs only one code path.
- The row shape has no bytes-on-the-wire field
  (`scripts/website/bench-data/gen-servers-docs.mjs`), and the chart component has a fixed
  metric registry (`container/website/app/components/content/ServerBenchBars.vue`). Both
  need a `bytes` metric, and the component needs a way to show one lane against its compact
  twin without those extra rows appearing on every other chart.
- A repo contract test pins that every dataset a page asks for is one the generator emits
  (`packages/devtools/test/repo-contracts.test.ts`), so keeping the compact rows inside the
  existing per-suite datasets avoids inventing a new dataset name.

The implementer plans the details.

## Done when

- A `mion.compact` lane runs in the container and passes both halves of the correctness
  gate: it echoes the id it was sent, and it rejects an invalid payload, before any number
  is taken.
- The payload sweep pads with repeated objects, so the wire difference is real.
- Every result records the bytes it sent and received, and the pages read that rather than
  a transcribed number.
- The payload benchmarks page shows the same mion server over plain JSON and over compact
  JSON, in requests per second and in bytes on the wire, under each size.
- The measured saving is reported, not restated from the runtypes serialization figures.
