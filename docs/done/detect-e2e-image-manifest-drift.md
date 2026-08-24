---
type: chore
spec: full-plan
status: done
created: 2026-08-23
---

# A `_deps` change does not force a republish, so the container images silently drift

## Outcome

Shipped the self-healing option (the one the originating spec called "cheap": a label on the image
and a comparison before the run), in [scripts/container/image.mjs](../../scripts/container/image.mjs)
and both Containerfiles.

`targetSrcFiles(cfg)` is now the single definition of an image's baked inputs; `targetSrcEpoch` and
the new `depsHash` both read it, so the mtime gate and the stamp cannot disagree about the input
set. `depsHash` is a sha256 over sorted `<relative path>\0<contents>` — content, not mtime, so it
survives a clone. It rides in as `--build-arg DEPS_HASH` (via `buildArgFlags`, so local builds and
`ghcrPushMultiarch` are covered by one change) and is recorded as `org.mionkit.deps-hash`. Both
`ARG`/`LABEL` pairs sit LAST in their Containerfile, so a hash change invalidates only that
one-line layer.

`depsStampState` returns `match` / `drift` / `unknown`, consumed by both entry points:

- `ensureImage` checks after settling on an image (pulled or local) and rebuilds locally on `drift`,
  so a stale published image can never be *run*.
- `ensureImageLocal` short-circuits on `match`, rebuilds on `drift`, and falls back to the old mtime
  gate only on `unknown`.

`unknown` deliberately does **not** count as drift. An image built before stamping has no label, and
treating that as drift would make every CI lane rebuild these images from scratch — a far worse
regression than the bug being fixed. It warns and proceeds.

Verified against the real image, all three paths: `unknown` warns without rebuilding; a clean tree
is silent (no false positive); and appending one line to `registry/verdaccio.yaml` produced

```
==> image tsrt-e2e:dev was built from DIFFERENT e2e manifests
    (stamped bd318f33b3178f58, tree is 13f6aaaf50e6b7e5) - building locally instead of running a stale image
```

with the rebuilt image's stamp moving to match. The stamped `tsrt-e2e` was then republished, so
pull-based runs compare a real stamp rather than falling into `unknown`.

## Deliberately not done

- **The CI check** ("fail when the published image's label does not match `main`"). The runtime
  check already makes drift non-silent AND self-correcting, so a second gate buys no additional
  safety — only an earlier, noisier signal. Worth revisiting only if the local rebuilds it papers
  over start costing real CI minutes, which is measurable from the drift warning in the logs.
- **Republishing `tsrt-website`.** Its Containerfile carries the stamp, but the published image
  predates it and so reports `unknown` (warn + mtime fallback, never a failure) until its next
  `pnpm rtx container push website`. Rebuilding it is a long multi-arch QEMU job unrelated to the
  change that found this; the degradation is safe and self-resolves on the next push.

## Problem

Both podman images bake a dependency manifest at build time
([container/pre-publish-e2e/\_deps](../../container/pre-publish-e2e/_deps/package.json),
[container/website/\_deps](../../container/website/_deps/package.json)), but nothing ties the
**published** artifact to the manifest currently in the tree. Edit `_deps/package.json`, merge it,
and `ghcr.io/mionkit/tsrt-e2e:latest` keeps serving the previous toolchain set until a maintainer
remembers to run `pnpm rtx container push e2e`.

That is not hypothetical. [republish-e2e-image-with-next](../done/republish-e2e-image-with-next.md)
is the worked example: `next` was added to the e2e manifest and the image was never republished, so
every pull-based `rtx release e2e` failed on `smoke-next` with

```
Error: Cannot find module '/e2e/node_modules/next/dist/bin/next'
```

The failure reads as a Next-adapter regression, which is the expensive part. It is only a stale
artifact, but nothing in the output says so, and the local-build path is not equivalent (the same
episode found three separate reasons the image would not build at all, all invisible to anyone who
merely pulls).

Note the asymmetry that makes this bite: `ensureImage` prefers the **published** image and only
falls back to a local build when the registry is unreachable, so CI and a normal dev run get the
stale artifact while `RT_WEBSITE_USE_LOCAL=1` quietly gets a correct one.

## Fix plan

Stamp the manifest hash into the image and compare it at run time. Self-healing and cheap.

1. In [scripts/container/image.mjs](../../scripts/container/image.mjs), compute a stable hash of the
   target's baked inputs. `targetSrcEpoch` already enumerates exactly this set (the Containerfile
   plus `_deps` / `registry` / bench manifests) for the local-staleness gate, so factor the file
   list out of it and hash the contents rather than the mtimes.
2. Pass it as a build arg and record it as an image label, e.g.
   `org.mionkit.deps-hash=<hash>`, in both Containerfiles.
3. In `ensureImage`, after resolving the image to use, read the label back
   (`podman image inspect --format '{{index .Labels "org.mionkit.deps-hash"}}'`) and compare with
   the tree's hash. On mismatch: `noteErr` a precise message naming the drifted manifest, then
   build locally instead of using the pulled image, so a run is never silently wrong.
4. Add a CI check that fails when the published image's label does not match `main`'s manifests, so
   the republish is *requested* at merge time rather than discovered at the next release gate.

## Notes

- Keep the hash over file **contents**, not mtimes — a fresh clone has arbitrary mtimes, which is
  why `targetSrcEpoch`'s existing gate is only sound for the local-build path.
- Both images need this, but the e2e one is where it has already cost real time; ship it there
  first if splitting.
- A cheaper stopgap, if the label work is deferred: have the e2e lane assert that every dependency
  named in `_deps/package.json` resolves inside `/e2e/node_modules` before the matrix starts. That
  turns the 30-minute mystery into an immediate, named failure, but it does not fix the drift.
