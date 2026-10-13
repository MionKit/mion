---
type: feature
spec: guidelines
status: done (2026-10-13)
created: 2026-09-03
---

# A compact JSON lane and a bytes chart on the payload benchmarks

## Intent

Show what compact JSON buys on the wire, with measurements rather than a claim. Compact
drops every key name from an object, writing `{a, b}` as `[v.a, v.b]`, so the win shows on
real-world objects with many properties and repeats, and is zero on flat arrays of scalars.

The payload benchmarks page is where that belongs: it is the page about payload size.

## Starting point

The router already serves a route over the compact wire (`{parser: 'compact'}`) and the client
speaks it, so a compact lane is a mion server started with that route option.

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

## Plan: compact lane + bytes chart (approved 2026-10-13)

Shipped as planned, with the two adjustments noted in steps 3 and 11. The local container run used a locally
built `mion-bench` image (`MION_BENCH_USE_LOCAL=1`): `pnpm miondevx container login` was refused by ghcr.io
(`DENIED` for the stored `GHCR_PAT`), reported to the maintainer. No image push is owed: no `_deps` or Containerfile changed.

### Changes

### Bench lane (`container/mion-bench/`)
1. `shared/apps.mjs`: new entry `mion.compact` (family `mion`, dir `mion`, entry `dist/server-node-compact.mjs`,
   runtime node, `versionOf: '@mionjs/router'`) with `wire: 'compact'` and `twinOf: 'mion'`.
2. `apps/mion/`: move the three handlers into a shared module, keep `routes.ts` as is in behavior, add
   `routes-compact.ts` (`createMionRouter({parser: 'compact'})`, same handlers) and `server-node-compact.ts`.
   If passing handler references breaks the build-time type read, fall back to repeating the three tiny handlers.
3. `apps/mion/compact-wire.ts` + vite input: the real compiled compact encoders/decoders, keyed by route id
   (`hello` decode only, `updateUser`, `updateSimpleUser`): `encodeParams(args) -> string`, `decodeReturn(value) -> value`.
   The harness imports the built `dist/compact-wire.mjs` (harness is plain node, has no codec) rather than
   spawning it to print bodies. `encodeParams` first restores the plain JSON values the payload builders write
   (dates as text) into typed values with the default restore, since the compact encoder expects real `Date`s.
4. `shared/payloads.mjs`: `buildUserOfSize` pads `paymentMethods` by cycling the three union members
   (credit card, bank account, paypal); `tags` keeps its default. Comment states the padding is a declared union so
   every lane's schema validates it unchanged, and that the sweep now validates one union member per ~80 bytes
   (more work per byte than a string list, so sweep numbers move for every lane). `buildUser()` for the heavy suite unchanged.
5. `shared/suites.mjs`: each suite's `build(size)` returns the plain value; `harness/run.mjs` makes the `{body, id}`
   sample. `bodyFor` takes an optional codec so a compact app gets `codec.encodeParams([value])`, mion JSON gets
   `mionBody`, others `plainBody`. Zero third-party imports kept.
6. New pure module `harness/wire.mjs` (unit-tested, mounted by the driver):
   - `bodyTemplate(body, id)`: split on the id's own digits (bounded by non-digits), throw if absent or present twice.
     One path for JSON and positional bodies; replaces the `"id":<digits>` regex.
   - `invalidBody(template)`: prefix + `"not-a-number"` + suffix, so the reject check works on both wires.
7. `harness/run.mjs`:
   - load the codec for a `wire: 'compact'` app; `verify` decodes the positional response with it before reading `id`
     (hello checks `hello === 'world'` after decode);
   - `verifyRejects` sends `invalidBody`;
   - record `bytes: {sent, received}` (request + response BODY bytes of the verified sample, headers not counted) on every result.
8. `scripts/website/bench-data/mion-bench.mjs`: mount `harness/wire.mjs`. Nothing else: the lane runs every suite
   like every app, and the sweep loops over `APPS`. `GCPROBE_LANES` untouched.
9. `container/mion-bench/README.md`: lane list, the sweep padding, how the id is split, the compact codec.

### Data + site
10. `scripts/website/bench-data/gen-servers-docs.mjs`: export `toRow`; rows carry `bytes` (sent + received per call)
    and `twinOf`. Compact rows stay inside the existing datasets (no new dataset name).
11. New `container/website/app/utils/serverBenchRows.js` (pure, unit-tested; plain JS typed in JSDoc because the
    site's tsconfig extends `.nuxt/tsconfig.json`, which only exists in its image, so the host tests cannot load a `.ts` there): `visibleRows(rows, twins)` hides any
    row with `twinOf` unless `twins` names its base, and then shows only the base + its twins;
    `changeVsBase(row, rows, metric)` gives the measured percent change for a twin row.
12. `ServerBenchBars.vue`: `bytes` metric (lower is better, formatted by `benchFormat.formatValue(..., 'bytes')`),
    new `twins` prop, twin rows print the measured change beside the value (e.g. `1.2KB (−38%)`).
    `HomeBenchTable.vue`: skip `twinOf` rows. So hello world, light, heavy pages and the home summary are unchanged.
13. Page `container/website/content/03.benchmarks/02.rpc/04.payload-sizes.md`: under each size, after the all-servers
    chart, a "JSON vs compact JSON" pair: `metric="requests" twins="mion"` and `metric="bytes" twins="mion"`.
    Test Setup: padding is repeated payment methods (a declared union), plus one short line on what the compact
    lane is, linking `/rpc/server/json-round-trip#compact-payloads`. Sentence + link back from that "Compact Payloads"
    section to the measured page.

### Tests (Vitest, `packages/devtools/test/`)
- New `mion-bench-wire.test.ts`: `bodyTemplate` on a plain object body, a mion array body and a positional body;
  throws on missing / repeated id; `invalidBody` puts a string in the id slot; `buildUserOfSize` reaches each sweep
  size within a few %, grows only `paymentMethods`, cycles all three members; `toRow` carries `bytes` + `twinOf`;
  `visibleRows` / `changeVsBase` (default hides twins, `twins="mion"` shows exactly mion + mion.compact, percent math).
- `repo-contracts.test.ts`: every mion-family app's `entry` is a vite input; a `wire: 'compact'` app has a `twinOf`
  naming a real app and the codec entry exists; the driver mounts `harness/wire.mjs`; any `twins=` on a page names a real app.
- No marker-API change, so the two-call-shape rule does not apply.
- Real proof in the container (podman works here): `pnpm miondevx bench servers one mion.compact --quick`, then
  `sweep --quick` over every app (proves both gate halves for the compact lane and that every competitor validates
  the new padding). Quote the measured byte saving in the PR, marked as a quick (noisy) run for req/s.

### Docs
Payload sizes page (above) + one link line in `01.rpc/02.server/07.json-round-trip.md` "Compact Payloads".
mion-bench README. Component list line in `container/website/app/components/AGENTS.md` (ServerBenchBars `twins`).

### Fuzzing
Not a candidate: bench infrastructure, the container correctness gate is the oracle.

### Finish
`pnpm run lint`, `pnpm run format`, targeted vitest + `pnpm miondevx core test-pr`, website check if available
(`pnpm miondevx website check` / check-static). Reconcile the spec with what shipped, `git mv` it to `docs/done/`.
Then review (pr-reviewer), docs + comments simplifiers in parallel, PR, CI green.

### Done when (from the todo)
- `mion.compact` runs in the container and passes both gate halves (echo id, reject invalid) before measuring.
- Sweep pads with repeated objects.
- Every result records bytes sent and received; pages read that, no transcribed number.
- Payload page shows mion over JSON vs compact, req/s and bytes, under each size.
- The saving shown is the measured one (computed from the rows), not quoted from serialization figures.
