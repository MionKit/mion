# Adding an e2e image

- drizzle-e2e lane = the only thing here proving a `toDrizzle()` table works against a real database,
  not against another type.
- Every other drizzle test compares a materialized table with a hand-written drizzle one: structure only.
- So a new dialect or driver is not shippable without a lane.

## The rule: run drizzle's suite however drizzle runs it

- Translation happens at the drizzle TABLE level. A suite's test framework is not our concern.
- Never rewrite a suite to fit a harness we prefer. Vitest, a bare worker with a fetch handler, a plain script:
  run it as it comes.
- Lane's only job: capture a **comparable result** from each of the three trees (control, builders, types),
  compare them.
- "Comparable" is per-suite (a vitest JSON report, a response body, an exit code plus stdout).
  The lane writes down which artifact it compares and why.
- Verdict = that comparison, never "the suite is green". Drizzle's suites are not green against every driver: fine.
  The lane asserts the translation changed nothing.

## Wiring, in order

1. **The image.** `container/drizzle-e2e/<lane>/Containerfile` + `_deps/package.json`.
   - **Base image rule:** the DATABASE's own image when the suite needs a real server
     (`postgres:17-trixie`, `mysql:8.4`), plain `node:26-trixie` when not. Add Node from the official tarball.
   - Deps-only, like every image here: only `_deps/`, the shared workspace policy and the registry assets are baked.
   - Everything in `shared/` is bind-mounted at run time, so editing a runner never invalidates an install layer.
   - Container deps = the one place a heavy dependency is fine: never enter the workspace lockfile.
2. **Pin the suites.** Add each vendored file to `drizzle-suites.pin.json`,
   then `pnpm miondevx core drizzle-suites --record` on a trusted network and eyeball the diff.
   - `tag` and `drizzleOrm` always move together.
   - Nothing fetched inside the container: files are sha256-verified on the host, mounted read-only.
3. **Runner + addendum.**
   - `shared/runners/<lane>.test.ts` is ours, never vendored. Copied into the translated tree AFTER translation,
     so it is not itself rewritten (it talks to drizzle directly).
   - `shared/addendum/<lane>.test.ts`: our own CRUD for the builders drizzle's suites never touch,
     so the coverage gate is satisfied, not waived.
4. **Lane spec.** `DIALECTS` in `container/drizzle-e2e/shared/run-suite.mjs`: suite dir, common file,
   manifests to cross-check.
   - DRIVER lane rides an existing dialect: its spec also names the package to install,
     never claims manifests it does not own.
   - A gate a lane genuinely cannot carry = explicit flag in its spec with a reason, never a silent skip.
5. **Front doors.** `DRIZZLE_DIALECTS` in `scripts/container/image.mjs` (feeds both `TARGETS` and `targetSrcFiles`)
   and `DIALECTS` in `scripts/release/drizzle-e2e.mjs`.
   Two lanes may share one image: keep the image name a field, never duplicate a Containerfile.
6. **Env vars.** Every new one → `REGISTRY` array of `scripts/lib/env.mjs`, scope `internal`, NEVER in `.env.sample`.
7. **CI.** A matrix entry in `.github/workflows/drizzle-e2e.yml`.
8. **Publish the image.** `pnpm miondevx container build-image drizzle-<lane>`,
   then `pnpm miondevx container push drizzle-<lane>`.
   - **CI never builds these images**, it pulls them from GHCR: a new lane stays red until a maintainer pushed it.
   - Say so out loud when handing over a PR you could not push from.
9. **Document it.** Update the table and the image list in `container/drizzle-e2e/README.md`.
