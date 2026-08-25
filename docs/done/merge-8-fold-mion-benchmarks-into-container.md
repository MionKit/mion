# Fold the mion-benchmarks repo into a benchmarks container (merge master plan, step 8)

**Status:** done
**Created:** 2026-08-24
**Shipped:** 2026-08-25

Step 8 of
[../todos/merge-ts-runtypes-into-mion-master-plan.md](../todos/merge-ts-runtypes-into-mion-master-plan.md).
The mion benchmarks now live in this repository, run against the current workspace, and
the mion site's benchmark pages render from data generated on every deploy.

## The release gate was lifted

The original spec (settled decision 7) gated this on "steps 2–7 landed AND the first
unified release published", making it the last step. **The maintainer lifted that gate
on 2026-08-25** and this shipped before steps 6 and 7.

Nothing here needed the gate. It was written on the assumption that the benchmarks would
consume published `@mionjs/*` packages, so it had to wait for a release that shipped
them. They do not: exactly like the runtypes self-benchmark, the first-party packages and
the resolver binary are bind-mounted into the container at run time and the image bakes
third-party dependencies only. The numbers therefore describe the current tree, which is
what a benchmark run before a release has to do.

Because this is no longer the last step, **the master plan moves to `docs/done/` when the
last of steps 6, 7 and 8 lands** — whichever that turns out to be. It is still open.

## What shipped

**A third image, `mion-bench`, not a third directory inside `tsrt-website`.** The spec
said to restructure the harness "beside the existing validation benchmark layout". It got
its own image instead ([container/mion-bench/](../../container/mion-bench/), a third
target in [scripts/container/image.mjs](../../scripts/container/image.mjs)), for the
reason `tsrt-e2e` was split out: eight web frameworks and a load generator are a large,
fast-moving dependency surface that must never be able to disturb the validation lanes,
and the light smoke / website-build lanes should not pull them. It also has to be
`node:26-trixie`: the uWebSockets.js addon links against `GLIBC_2.38` and the website
image's bookworm base ships 2.36, so the `mion.uws` lane cannot start there at all.

**The import came from the `mion-runtypes-` branch, not `master`.** `master` is a 2024
tree (old `@mionkit/*` scope, deepkit's reflection compiler, `npm link`, several broken
entries). The current harness — `@mionjs/*`, Zod competitors, the three suites the site
shows, elysia and hono bun apps — lives on that branch, and is what produced the numbers
the site had frozen. **A plain code import, no second `--allow-unrelated-histories`
merge**: the branch is ~60 commits, mostly "run benchmarks for version X", on a single
squashed upstream `fastify/benchmarks` import, and the harness was rewritten onto the
container pattern, so the imported history would describe files that did not survive.
`MionKit/Benchmarks` stays on GitHub as the historical record.

**Ten lanes across four suites.** `mion` on platform-node, `mion.uws`, `mion.bun`,
against `express`, `fastify` (native JSON Schema), `hapi`, `hono` (node and bun),
`elysia.bun`, and a bare `http-node` ceiling. Suites: `hello-world`,
`light-validation` (~100 B), `heavy-validation` (~1 KB), and the `payload-sizes` sweep
(~1 KB / ~50 KB / ~500 KB / ~4 MB, mion adapters only). The sweep sizes straddle 512 KiB
deliberately, and the apps raise `maxBodySize` to 10 MB because the adapters default to
256 KB — *below* the threshold, so with the default every large request would be rejected
and the uws zero-copy branch would never run.

**Correctness before speed.** Each lane must answer correctly (round-tripping the id it
was sent) **and reject an invalid payload** before it is measured, and a measured run
with any non-2xx fails the lane. This was not in the spec and is the most important thing
the harness does: a lane that quietly skipped validation would post the fastest number in
the table, because it is doing less work than everything it is compared against.

**The pages carry no numbers.** `BenchChart.vue` fetches its dataset at runtime like
`BenchTable.vue` already did, a new `ServerBenchTable.vue` renders the results table, and
both read the machine, the runtime versions, the load settings and the run date out of the
generated file. The committed chart JSON and PNGs are deleted. Because the charts now fail
soft rather than failing the build, `check-static`'s mion lane was extended to assert every
dataset actually has rows — otherwise a half-run benchmark stage would ship a green deploy
whose every chart reads "not generated yet".

**One command still feeds both sites.** `pnpm rtx bench --website` runs the validation
family in `tsrt-website` and then the server family in `mion-bench`, so a website deploy
regenerates both sites' numbers in one run. `website-deploy.yml` gained a second image
pull; it needed no other change.

## Also fixed on the way

- `RT_BENCH_ENGINE_ASSERT`, `RT_BENCH_ENGINE_MARGIN` and `RT_BENCH_ENGINE_ITERS` were read
  by the engine tripwire and **set in `website-deploy.yml`**, but missing from the
  `REGISTRY` that CLAUDE.md declares the single source of truth. Registered, with
  `.env.sample` rows.
- `fetch-uws.mjs` could fetch the host binary or all fifteen (~200 MB). It gained
  `--file`, so prep pulls only the container's Node 26 binary (~13 MB).
- The `ts-runtypes-setup` skill documented `pnpm rtx dev smoke`, a command that does not
  exist (it is `rtx core smoke`). Fixed in the skill and its script.
- A `@mionjs/tun-types` typo on the heavy-validation page, and an orphaned
  `charts/cold-starts.{json,png}` pair nothing referenced.

## Not ported, deliberately

The **cold-starts** and **mion-options** suites, the **wrk** loader (autocannon is what
the pages' method line describes, and wrk would need a compiled binary in the image), and
the **puppeteer** chart screenshots (charts render client-side, so the PNG fallback is
gone). The site never showed the first two; the archived repository keeps those write-ups
readable.

## Done criteria

- `pnpm rtx bench servers` runs every lane in the container and writes the four datasets. ✅
- The mion pages render from generated data, with no frozen numbers left in markdown. ✅
  (Verified by the contract tests and the generated datasets; the full site RENDER was not
  run in the authoring sandbox, which can neither pull the private `tsrt-website` image nor
  build it locally — see the PR description.)
- No repo references to a sibling `../mion-benchmarks` checkout remain. ✅
- Archiving `MionKit/Benchmarks` is an owner action, still open.
