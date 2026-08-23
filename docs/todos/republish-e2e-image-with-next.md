---
type: chore
spec: full-plan
status: ready
created: 2026-08-23
---

# The published `tsrt-e2e` image predates the Next.js app, so `rtx release e2e` fails for everyone

## Problem

[b918bfb](https://github.com/MionKit/ts-run-types/commit/b918bfb) ("test(e2e): cover the Next.js
adapter in the pre-publish matrix") added `smoke-next` to the e2e matrix and added `next@16.3.2`,
`react@19.2.4` and `react-dom@19.2.4` to
[container/pre-publish-e2e/\_deps/package.json](../../container/pre-publish-e2e/_deps/package.json) —
the toolchain manifest baked into the `tsrt-e2e` image.

**The image was never rebuilt or pushed after that commit.** `ghcr.io/mionkit/tsrt-e2e:latest` still
carries the pre-Next toolchain set, so `pnpm rtx release e2e` pulls an image whose `/e2e/node_modules`
has no `next`, and the matrix dies on the last app:

```
FAIL smoke-next (next):
Error: Cannot find module '/e2e/node_modules/next/dist/bin/next'
```

Verified against the pulled image:

```
$ podman run --rm ghcr.io/mionkit/tsrt-e2e:latest sh -c 'ls /e2e/node_modules | grep -c "^next$"'
0
```

The other nine apps pass, so the failure looks like a Next-adapter regression when it is only a
stale image. **Predates the change that found it** (the type-dependency work, which the same run
proved green across all nine other bundler hosts).

Anyone who builds the image locally (`pnpm rtx container build e2e`) is unaffected, which is why CI
and the author of b918bfb would not have seen it — only a pull-based run hits it.

## Fix plan

1. Rebuild and push the image: `pnpm rtx container push e2e`. Nothing in the repo needs to change —
   the manifest is already correct, only the published artifact is behind. Needs `GHCR_*`
   credentials, so it is a maintainer action.
2. Re-run `pnpm rtx release e2e` and confirm `smoke-next` builds.

## Why it was not fixed in the task that found it

Pushing a ~2.4 GB image to the shared org registry changes what every CI lane pulls. That is an
outward-facing release-infrastructure action, not something to slip into an unrelated PR
unannounced. The verification that needed it was done instead by installing `next` into a throwaway
container.

## Preventing the repeat

The real gap is that a change to `_deps/package.json` does not force a republish, so the image can
silently drift from the manifest it is built from. Worth one of:

- A CI check that compares the manifest's dependency set against the pulled image's
  `/e2e/node_modules` and fails when they diverge, or
- Making the e2e lane build the image when the manifest hash differs from the one baked in (stamp
  the hash into the image at build time and compare at run time).

The second is self-healing and cheap: a one-line label on the image, and a comparison before the
matrix runs.
