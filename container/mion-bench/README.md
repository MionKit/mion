# mion server benchmarks — one isolated app per framework (podman)

Measures a **mion** HTTP server against the frameworks the docs site compares it
with: express, fastify, hapi, hono (node and bun), elysia (bun), and a bare node
`http` server as the theoretical ceiling. mion runs on all three of its platform
adapters, so the table shows `mion`, `mion.uws` and `mion.bun` as separate rows.

Ported from the `MionKit/Benchmarks` repository, which is where these benchmarks
lived until they moved in here. The methodology (autocannon, a warm-up round then a
measured one, memory and CPU sampled per second) is that repository's; everything
about how it is built and run is this repository's container pattern.

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
| express · fastify · hapi · hono · elysia · zod       | every app's source + `shared/` + `harness/run.mjs`         |
| autocannon + pidusage (the `harness` project)        | the workspace `@mionjs/*` and `@ts-runtypes/*` packages    |
| vite + typescript (the `mion` project's build)       | `bin/mion-linux-<arch>` and the uWS native binary   |
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
| `payload-sizes` | The heavy route at ~1 KB / ~50 KB / ~500 KB / ~4 MB, mion adapters only. |

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
pnpm rtx bench servers                 # every app, every suite, then the site data
pnpm rtx bench servers --quick         # short windows for a dev loop (noisy, never publish)
pnpm rtx bench servers one mion.uws    # a single app across the three suites
pnpm rtx bench servers suite hello-world  # a single suite across every app
pnpm rtx bench servers sweep           # the payload-size sweep (mion adapters only)
pnpm rtx bench servers build           # just build the mion server bundles
pnpm rtx bench servers shell           # a debug shell in the image
# --- image publishing (maintainer) ---
pnpm rtx container build-image mion-bench
pnpm rtx container push mion-bench
```

`pnpm rtx bench --website` runs these as part of regenerating **all** the benchmark
data both docs sites render, which is what a website deploy calls.

Results land in `results/<suite>/<app>.json` (git-ignored) and
[`gen-servers-docs.mjs`](../../scripts/website/bench-data/gen-servers-docs.mjs) turns
them into `container/website/public/bench-data/servers-<suite>/index.json`, which the
`:bench-chart` and `:server-bench-table` components fetch. The pages carry no numbers
of their own — the machine, the runtime versions and the load settings are all read
back out of the results, so a page can never describe a different run than it shows.

## Adding an app

Add its entry to [`shared/apps.mjs`](shared/apps.mjs), its source under
`apps/<name>/`, its manifest under `_deps/<name>/package.json`, and a COPY+install
layer to the [`Containerfile`](Containerfile). The contract tests in
`packages/ts-runtypes-devtools/test/repo-contracts.test.ts` fail if any of those four
is missing — the image is deps-only, so an app with no install layer simply never runs.
