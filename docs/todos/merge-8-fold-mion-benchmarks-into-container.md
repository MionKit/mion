# Fold the mion-benchmarks repo into the benchmarks container (merge master plan, step 8)

**Status:** open
**Created:** 2026-08-24

Step 8 — the LAST step — of
[merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Settled decision 7: this runs only after steps 2–7 are landed AND the first unified release is
published. Goal: the sibling `mion-benchmarks` repo moves into `container/benchmarks/`, the mion
site's benchmark pages render from data generated at website-build time, and the old
copy-from-sibling-repo flow is fully gone.

## Background

The mion site's benchmarks section was fed by a root `copy-benchmarks` script copying results
from a sibling `../mion-benchmarks` checkout (script retired in step 4, data frozen as static
content since). The runtypes side already has the pattern to adopt: each competitor toolchain is
an isolated pnpm project under `container/benchmarks/_deps/`, baked into the `tsrt-website` image
(deps-hash-labelled), driven by `scripts/website/bench-data/` (`pnpm rtx bench`), with published
numbers generated inside the container during the website deploy on the dedicated runner.

## Tasks

- Import the mion-benchmarks sources (history import via a second small
  `--allow-unrelated-histories` merge is optional — decide based on how much history that repo
  has worth keeping; a plain code import is acceptable for a benchmarks harness if not).
- Restructure to the container pattern: framework competitors under
  `container/benchmarks/_deps/` as isolated projects, harness + cases beside the existing
  validation benchmark layout, results flowing through `bench-data/gen-docs.mjs`-style generators
  into the mion site's content. The imported harness must include a `@mionjs/platform-uws` lane
  alongside platform-node (the uWS binaries fetch via `pnpm rtx core build uws`), and should sweep
  payload sizes (small / ~50 KB / ~500 KB / multi-MB) in both JSON and binary modes — the uws
  adapter switches to a zero-copy body path above 512 KiB, which only a size sweep exercises.
- Extend `scripts/website/bench-data/` (or add a sibling module) and the `rtx bench` area to run
  the mion benchmarks; bake the new deps into `tsrt-website` and push (deps-hash updates
  enforced by the image label check).
- Replace the mion site's frozen static benchmark data with the generated output;
  `website-deploy.yml` produces both sites' numbers in the same run.
- Archive the `mion-benchmarks` repo with a pointer README (owner flips the archive switch).
- Move the master plan spec to `docs/done/` — this step completes the migration.

## Done criteria

- `pnpm rtx bench` runs the mion benchmarks inside the container locally; the website build
  renders the mion benchmark pages from generated data.
- No repo references to the sibling checkout remain; `mion-benchmarks` is archived.
- The master plan lives in `docs/done/` with a completion note.
