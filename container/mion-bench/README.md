# mion server benchmarks — one isolated app per framework (podman)

Measures a **mion** HTTP server against the frameworks the docs site compares it
with: express, fastify, hapi, hono (node and bun), elysia (bun), and a bare node
`http` server as the theoretical ceiling. mion runs on all three of its platform
adapters, so the table shows `mion`, `mion.uws` and `mion.bun` as separate rows.

Ported from the `MionKit/Benchmarks` repository, which is where these benchmarks
lived until they moved in here. The methodology (a warm-up round then a measured one,
memory and CPU sampled per second) is that repository's; everything about how it is
built and run is this repository's container pattern. See
[what came from upstream](#what-came-from-the-upstream-benchmarks-repo) for the ledger.

## Why its own image

The validation benchmarks live in `tsrt-website`; these live in **`mion-bench`**. Two
reasons, the same ones that split `tsrt-e2e` out:

- A competitor framework bump must never be able to disturb the validation lanes or
  the docs build. Eight web frameworks and a load generator are a large, fast-moving
  dependency surface.
- The lightweight smoke / website-build lanes should not pull a load generator they
  never run.

It also gets to pick its own base image, which matters here: the uWebSockets.js addon
links against `GLIBC_2.38`, so this image is **`node:26-trixie`** (glibc 2.41) while
the website image is bookworm (2.36, too old — the uws lane dies at `dlopen`).

## What runs where

The image is **deps-only**: it bakes one `node_modules` per app from the manifests in
[`_deps/`](_deps/) and nothing first-party. Every source file is bind-mounted at run
time by [`scripts/website/bench-data/mion-bench.mjs`](../../scripts/website/bench-data/mion-bench.mjs),
so an image is invalidated only when a dependency manifest changes (enforced by the
`org.mionkit.deps-hash` label — a drifted image is rebuilt rather than run).

| Inside the image (deps only)                        | Bind-mounted from the repo at run time                    |
| --------------------------------------------------- | --------------------------------------------------------- |
| express · fastify · hapi · hono · elysia · zod       | every app's source + `shared/` + `harness/run.mjs` + `harness/wrk.lua` |
| wrk (apt) + pidusage (the `harness` project)         | the workspace `@mionjs/*` and `@mionjs/*` packages    |
| vite + typescript (the `mion` project's build)       | `mion-bin/mion-linux-<arch>` and the uWS native binary   |
| node 26 + bun (both runtimes)                        | writable `results/` (so each run survives `--rm`)          |

The mion lanes are **built in-container** by vite plus `@mionjs/devtools`, which runs
the real resolver over the route handlers and emits the validators their types imply.
So the numbers describe the current workspace, not a published release.

## The suites

| Suite | What it measures |
| --- | --- |
| `hello-world` | Routing and framework overhead only. No body, no validation. |
| `light-validation` | A ~100 byte user: four fields, one of them a date. |
| `heavy-validation` | A ~1 KB user: nested objects, a discriminated union, three dates. |
| `payload-sizes` | The heavy route at ~1 KB / ~50 KB / ~500 KB / ~4 MB, every app. |

The sizes in the sweep straddle **512 KiB** on purpose: a body larger than that
cannot arrive in one socket read, which is the point where `@mionjs/platform-uws`
switches to its zero-copy path. The apps raise `maxBodySize` to 10 MB because the
adapters default to 256 KB, *below* that threshold — with the default, every large
request would be rejected and the branch would never run.

## Correctness comes before speed

Before any lane is measured, the harness proves it is doing the work:

- it answers the route correctly, round-tripping the id it was sent, and
- it **rejects** an invalid payload.

The second check is the important one. A lane that quietly skipped validation would
round-trip the valid sample happily and post the fastest number in the table, because
it is doing less work than everything it is being compared against. A measured run
that produced any non-2xx or errored response also fails the lane.

Every payload also carries a unique id per request, so no framework is measured
serving its own cache.

## Usage

From the repo root:

```bash
pnpm miondevx bench servers                 # every app, every suite, then the site data
pnpm miondevx bench servers --quick         # short windows for a dev loop (noisy, never publish)
pnpm miondevx bench servers one mion.uws    # a single app across the three suites
pnpm miondevx bench servers suite hello-world  # a single suite across every app
pnpm miondevx bench servers sweep           # the payload-size sweep (mion adapters only)
pnpm miondevx bench servers repeat mion.bun # run one lane 3 times and check the spread
pnpm miondevx bench servers build           # just build the mion server bundles
pnpm miondevx bench servers shell           # a debug shell in the image
# --- image publishing (maintainer) ---
pnpm miondevx container build-image mion-bench
pnpm miondevx container push mion-bench
```

`pnpm miondevx bench --website` runs these as part of regenerating **all** the benchmark
data both docs sites render, which is what a website deploy calls.

Results land in `results/<suite>/<app>.json` (git-ignored) and
[`gen-servers-docs.mjs`](../../scripts/website/bench-data/gen-servers-docs.mjs) turns
them into `container/website/public/bench-data/servers-<suite>/index.json`, which the
`:server-bench-bars` component renders. The pages carry no numbers
of their own — the machine, the runtime versions and the load settings are all read
back out of the results, so a page can never describe a different run than it shows.

## How the load is generated

**wrk**, not autocannon. autocannon is a node process, so on the same box it competes
for CPU with the server it is measuring, and it runs out of headroom before a fast
server does. Three of the ten lanes are bun (`mion.bun`, `hono.bun`, `elysia.bun`), and
those are exactly the ones that hit the ceiling first: the upstream benchmarks repo
dropped the bun lanes from the hello-world benchmark entirely rather than publish
numbers autocannon could not take, then added wrk and got them back. wrk is C plus
LuaJIT and multi-threaded, so it costs a fraction of a CPU per request.

wrk is installed from Debian in the image, so nothing has to be built or installed on
your machine. `harness/run.mjs` drives it; `harness/wrk.lua` builds the requests and
writes the result.

Two details worth knowing:

- **Threads.** wrk runs `MION_BENCH_THREADS` threads, half the machine's cores by
  default (capped at 8), because the server under test needs cores too. A lane whose
  payload capped the connection count never gets more threads than it has sockets.
- **Every request carries a different id.** wrk builds its requests in Lua, so
  `run.mjs` splits one body built by `shared/payloads.mjs` around its `id` and hands the
  Lua script the two halves, which stamps a fresh id between them. The payloads are still
  written in exactly one place, and no framework is ever measured serving its own cache.

## Repeatability

Numbers only mean something if the same lane run twice agrees with itself. The
tolerance is **10%**: two runs of one lane should land within that of each other. It is
`MION_BENCH_TOLERANCE`, the harness records it so every benchmark page prints it beside
the method line, and this checks it:

```bash
pnpm miondevx bench servers repeat mion.bun                    # 3 runs of hello-world
pnpm miondevx bench servers repeat mion.bun light-validation --runs 5
```

It prints every run and the spread, and fails if the spread is wider than the tolerance.

**Where the 10% came from:** three full-length runs of each bun lane on a shared
4 vCPU cloud box, which measured 1.8% (`mion.bun`), 5.7% (`hono.bun`) and 9.8%
(`elysia.bun`). 10 is the ceiling those runs support, not a promise: a dedicated
benchmark machine should do considerably better, so re-run `repeat` there and tighten
the number if it does. Short (`--quick`) windows land wider than this on purpose, which
is why they are never published.

## What came from the upstream benchmarks repo

These benchmarks began in `MionKit/Benchmarks`, on its `mion-runtypes-` branch. This is
the whole ledger, so nobody has to read 38 commits to find out what was left behind.

**Ported.** The wrk load generator (upstream `b413b0e`): its Lua request script is now
`harness/wrk.lua`, its wrk spawn and result parsing folded into `harness/run.mjs`, and
its install script replaced by an apt layer in the `Containerfile` (the benchmarks only
ever run in the container here). Upstream kept autocannon as a second, default loader;
this repo runs wrk only. Upstream also ignored the `pipelining` setting under wrk while
still printing it, so its tables read `Method: autocannon -c 100 -d 4.1 -p 1` under
numbers wrk had produced; here the Lua script honours pipelining and the method line is
assembled from the record.

**Already here before that.** One compiled bundle per app, a separate entry per bun
lane, a unique id per request, the vite build for the mion lanes, the simple and complex
user models, and per-second memory and CPU sampling.

**Deliberately left, with the reason:**

| Upstream | Why not |
| --- | --- |
| `benchmarks/deepkit.js`, `benchmarks/trpc-router.js` | Competitors this site does not compare against. Adding one is an `apps/` entry, not a port. |
| `MION-OPTIONS.md`, `lib/packages-mion-options.js` | Upstream marks the doc Deprecated: the options it measured no longer exist. |
| `URL-PARAMETERS.md` | A one-off experiment run once, whose code upstream deleted so it would not disturb the regular benchmarks. |
| `lib/chart-screenshot.js` and the billboard.js charts | Replaced by the `ServerBenchBars` component. A contract test already fails if billboard.js comes back. |
| `scripts/analyze-heap.js`, `compare-heaps*.js`, `test-mion-bun-memory.js` and their plan docs | Aids for one bun memory-leak investigation. The harness already samples RSS every second and publishes `maxMem` and `memSeries`. |
| `scripts/mionlink.js`, `mionupdate.js`, `copy-mion-tarballs.sh` | Upstream's way of getting mion into the tree. Here the workspace is bind-mounted, so the numbers always describe the current source. |
| `scripts/rename-mionkit-to-mionjs.js` | A one-off rename that already happened. |
| `.github/workflows/benchmarks.yml` | This repo runs the benchmarks from `website-deploy`. |

## Adding an app

Add its entry to [`shared/apps.mjs`](shared/apps.mjs), its source under
`apps/<name>/`, its manifest under `_deps/<name>/package.json`, and a COPY+install
layer to the [`Containerfile`](Containerfile). The contract tests in
`packages/devtools/test/repo-contracts.test.ts` fail if any of those four
is missing — the image is deps-only, so an app with no install layer simply never runs.
