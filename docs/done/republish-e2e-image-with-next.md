---
type: chore
spec: full-plan
status: done
created: 2026-08-23
---

# The published `tsrt-e2e` image predates the Next.js app, so `rtx release e2e` fails for everyone

## Problem

[b918bfb](https://github.com/MionKit/ts-run-types/commit/b918bfb) ("test(e2e): cover the Next.js
adapter in the pre-publish matrix") added `smoke-next` to the e2e matrix and added `next`, `react`
and `react-dom` to
[container/pre-publish-e2e/\_deps/package.json](../../container/pre-publish-e2e/_deps/package.json) —
the toolchain manifest baked into the `tsrt-e2e` image.

**The image was never rebuilt or pushed after that commit.** `ghcr.io/mionkit/tsrt-e2e:latest`
still carried the pre-Next toolchain set, so `pnpm rtx release e2e` pulled an image whose
`/e2e/node_modules` had no `next`, and the matrix died on the last app:

```
FAIL smoke-next (next):
Error: Cannot find module '/e2e/node_modules/next/dist/bin/next'
```

## What actually shipped

Republishing was the goal, but the original plan ("nothing in the repo needs to change — the
manifest is already correct, only the published artifact is behind") **was wrong**, and so was its
claim that anyone building locally is unaffected. The image could not be built at all. Three
independent blockers had to be fixed first, none of which the authoring task could hit, because it
verified Next by installing it into a throwaway container with `npm` rather than by building the
image:

1. **`next@16.3.2` was younger than the workspace's own supply-chain floor.** `_deps` sets
   `minimumReleaseAge: 43200` (30 days); that version was published two days before it was pinned,
   so `pnpm install` refused it outright with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. Repinned to
   `next@16.2.11`, which also satisfies the manifest's own stated invariant that every pin is
   "older than the 30-day minimumReleaseAge cutoff".
2. **`next` pulls `sharp`, whose install script the `allowBuilds` allowlist rejects.** pnpm 11
   fails the install (`ERR_PNPM_IGNORED_BUILDS`) rather than warning. Denied explicitly with
   `sharp: false`, matching how [container/website/\_deps](../../container/website/_deps/pnpm-workspace.yaml)
   already handles the same package; `smoke-next` renders no images, so the JS path is enough.
3. **No `@types/react` was baked, so `next build` installed it itself.** Next runs
   `pnpm add --save-exact --save-dev @types/react` *inside `/e2e`*, which re-resolves the workspace
   and prunes the baked toolchains mid-build (`Packages: +13 -183`). The build then hangs
   indefinitely at ~0% CPU with no error — the matrix script's own comment predicts exactly this
   ("a runtime `pnpm add` would re-resolve + prune the toolchains"). Fixed by baking
   `@types/react`, with the reason recorded in the manifest `description` so it is not dropped as
   an unused dependency later.

With those in place the image builds, and the full pre-publish e2e passes on `container` backend:
all **10** apps green (`smoke-next` included, 4620ms over its two builds), 20/20 `node:test`
assertions, and the host-native smoke. The multi-arch image (`linux/amd64` + `linux/arm64`) was
then pushed to `ghcr.io/mionkit/tsrt-e2e:latest`.

Verified on the published image:

```
$ podman run --rm ghcr.io/mionkit/tsrt-e2e:latest sh -c 'ls /e2e/node_modules | grep -c "^next$"'
1
```

## What was NOT done

The original spec's "Preventing the repeat" section did not ship with the republish itself. It was
picked up immediately after, in the same PR, as
[detect-e2e-image-manifest-drift](detect-e2e-image-manifest-drift.md): the images now carry a
content hash of their baked manifests, and a run that would have used a drifted image rebuilds
locally instead. This episode is what motivated it — the drift went unnoticed until a release gate
failed, and then cost three separate debugging rounds.
