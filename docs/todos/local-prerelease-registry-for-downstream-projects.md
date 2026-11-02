---
type: chore
spec: guidelines
status: ready
created: 2026-11-02
---

# Publish the working tree to a local registry for downstream projects

## Intent

The mion-starters are mion's real-world e2e: they must run against unreleased mion fixes before a release. Today
there is no supported way to do that. The starters' old `mionlink` called a pack script mion no longer has, and
`file:` tarballs cannot resolve `@mionjs/bin-compiler`'s per-platform native compiler (an `os`/`cpu` optional
dependency). The pre-publish e2e already solves exactly this with a throwaway verdaccio. Expose that as one command
for downstream projects. Context: the mion-starters repo, `docs/investigations/mion-0.13-migration/README.md`
(row 27).

## Direction

The implementer plans the details. Verified pointers:

- `.github/verdaccio.yaml` (and its container twin `container/pre-publish-e2e/registry/verdaccio.yaml`): serves
  `@mionjs/*` only from local publishes, proxies the rest, `max_body_size` sized for the native packages.
- `scripts/release/build-binaries.mjs --host-only`, `scripts/release/pack.mjs` (output `tarballs/`),
  `scripts/release/publish-tarballs.mjs --registry <url>` (no receipt needed for a local registry),
  `scripts/release/e2e.mjs` (how the e2e starts verdaccio and installs from it).
- `scripts/release/bump-version.mjs:31` accepts only `X.Y.Z`. A local publish needs a version that cannot collide
  with the npmjs one in npm's cache (a prerelease such as `0.13.3-local.<n>`), without committing the bump.
  `constants.Version` is folded into type ids, so the binary must carry the same version as the packages.
- Shape: a `pnpm miondevx` command (`scripts/AGENTS.md`) that builds, packs, starts or reuses a local verdaccio,
  publishes, and prints the registry URL and version for the downstream project.

## Docs

`SETUP.md` "Publishing" (new subsection next to "Pre-publish e2e"), and `scripts/AGENTS.md` if a new `miondevx`
command is added.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- One command publishes the current tree to a local registry under a prerelease version, and a downstream project
  installs every `@mionjs/*` package from it, native compiler included, on a host with no podman.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
