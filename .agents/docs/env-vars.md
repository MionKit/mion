# Environment variables

Rules for every env var a script, container, CI step or test reads. Read before adding, renaming or reading one.

- Single source of truth: the `REGISTRY` array in [env.mjs](../../scripts/lib/env.mjs) lists EVERY env var
  the project consumes. `pnpm run check:env` prints it. A new var MUST be added there!
- Prefix EVERY project-owned var with `MION_` (`MION_WEBSITE_*`, `MION_VALIDATION_BENCH_*`, `MION_FUZZ_*`,
  `MION_TEST_PORT`, …).
- Two bench families, kept apart on purpose, never share a container:
  - `MION_BENCH_*`: mion HTTP **server** benchmarks (`mion-bench` image).
  - `MION_VALIDATION_BENCH_*`: validation benchmarks (`tsrt-website` image).
- External/standard names keep their spelling: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`,
  `GHCR_*`, `CI`, `NODE_ENV`, `PORT`.
- `GENERATE_ROUTER_SPEC`: the one unprefixed exception ([rpc-router/AGENTS.md](../../packages/rpc-router/AGENTS.md)).
- Three scopes (registry `SCOPE` column): `secret` (credential), `dev` (overridable knob with a default),
  `internal` (set by the scripts themselves). Mark new vars accordingly.
- `.env.sample` mirrors the user-settable rows only (`secret` + `dev`). Add new ones there too.
  NEVER list an `internal` var in `.env.sample`: setting it breaks the run.
- One credential, one load path: secrets live directly in `.env` (loaded by `loadEnv()`).
  No file-path alternates, no proxy/duplicate names.
- `.env` is LOCAL-only. CI and cloud agents export the vars directly → check `printenv`.
  A missing `.env` never means a missing credential.
- A var crossing the host→container or host→CI boundary is renamed on BOTH ends in the same change
  (setter + every reader), or the protocol silently breaks.
