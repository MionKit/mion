---
type: feature
spec: guidelines
status: ready
created: 2026-09-19
---

# Show the client's gzipped size on the mion RPC home page

## Intent

A reader deciding whether to use mion wants to know what the client costs them, and the home page
does not say. Put a real, measured number there, and make it impossible for that number to go stale
the way a hand-typed one would.

The number is the published `@mionjs/client`, minified and gzipped. One number, not a per-app
figure.

**Be honest about what it is.** A package-alone number is not what an app ships: tree shaking drops
what the app does not import, and a client built with `bundleApi` carries different code again. The
page must label it as the package size and must not imply it is the cost of a real app. Getting the
wording right matters more here than on any other page, because this is a marketing page.

## Direction

The repo already does this for the homepage test tiles, and that pattern is the one to copy.
The implementer plans the details.

- **The pattern to follow**, verified: `scripts/website/gen-test-counts.mjs` measures, writes
  `container/website/app/data/test-counts.json`, and that file is COMMITTED. The site imports it at
  build time (`app/components/content/StatTiles.vue`) rather than fetching at runtime, so the number
  lands in prerendered HTML with no hydration flash. `scripts/website/build.mjs` re-runs the
  generator on every website build. Read the header comment in `gen-test-counts.mjs` first: it
  records why the file is committed, why it carries no timestamp, and how a host that cannot measure
  falls back to the last known-good file instead of failing the build.
- **What to measure.** The published `@mionjs/client`, minified and gzipped. Settle how it is
  produced (the packed tarball, or the built dist) and keep it deterministic, because a number that
  moves on its own dirties the tree on every build.
- **The freshness gate is the interesting part, and it is missing today.**
  `gen-test-counts.mjs` has a `--check` flag that fails instead of writing, but NOTHING calls it: not
  a workflow, not a package.json script, not the release skill. So a commit can leave the committed
  counts stale and nothing says so. Wire `--check` into whatever gate the implementer judges right
  (a CI lane, the release skill, or both), and cover the existing test counts at the same time,
  since the gap is the same one.
- **New command.** Adding one means adding a row to `scripts/lib/devx-registry.mjs` (the help, the
  usage errors and the build gate all render from that table). `website test-counts` at line 183 is
  the shape to copy.
- **Env vars.** Any new one goes in the `REGISTRY` array in `scripts/lib/env.mjs`, prefixed `MION_`.

## Docs

`container/website/content/01.rpc/01.introduction/01.about-mion-rpc.md`, the RPC home page: a new
tile or card in an existing `::u-page-section`, next to the other numbers. The page is MDC and the
home page gets the simplest wording on the site, so keep it to the number plus a few plain words,
and label it as the package size rather than an app's.

Never let a formatter touch the content tree; Prettier mangles the MDC components.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page
and example this change touched, review its report against the code, and commit it as its own
commit.

## Done when

- The home page shows a measured gzipped size for `@mionjs/client`, worded so a reader cannot read
  it as the cost of their own app.
- The number comes from a committed generated file the site imports at build time, never from text
  typed into the page.
- A stale committed number fails a gate rather than shipping, and the same gate covers the existing
  homepage test counts.
- Regenerating with nothing changed leaves the file byte-identical, so a build never dirties the
  tree.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
