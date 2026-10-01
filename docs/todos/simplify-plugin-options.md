---
type: chore
spec: guidelines
status: ready
created: 2026-10-01
---

# Simplify the mion plugin options

## Intent

The top-level options of `mionVitePlugin` and `withMion` are hard to read. Four of them describe how
projects relate, and each one belongs to a different kind of project:

| Option | Set in | What it does |
| --- | --- | --- |
| `client.tsConfig` | the API project | points at a separate client project, for the batch table |
| `api.tsConfig` | the client project | points at a separate API project, so bundled functions match the server |
| `bundleApi` | the client project | bundles route metadata into the client (default true) |
| `server` | a fullstack app (Vite only) | runs the API inside `vite dev`, and a second `vite build` bundle |

Readers ask the obvious questions: should `api.tsConfig` live inside `server`, should `bundleApi` live
inside `client`? Today the answer is no to both, which is the problem: the names say which project is
pointed at, not where the option goes, and `bundleApi` sits apart from `api`, the option it pairs with.

## Direction

The implementer designs the new shape. Starting points, all verified:

- `api` and `server` are different jobs. `server` hosts the API in the SAME program, so it never needs a
  tsconfig. `api` points at a SEPARATE project. Merging them would force a client-only project to write
  a `server` block with no `startScript`.
- `bundleApi` does NOT belong in `client`: `client` is set in the API project, `bundleApi` is a client
  build setting. A better candidate is folding it into `api` (for example `api.bundle`), but note
  `bundleApi` works with no `api` block (client and API in one project), so `api.tsConfig` would become
  optional.
- Consider naming by role (what this project is) rather than by what it points at, if that reads better.
- Same option shape in both presets: `MionPresetOptions` in `packages/devtools/src/options.ts` (shared,
  mapped by `toRunTypesOptions`), `MionPluginOptions` in `packages/devtools/src/vite/mionVitePlugin.ts`
  (adds `server`), `MionNextOptions` in `packages/devtools/src/next/index.ts`.
- The same pointers exist as tsconfig plugin keys (`clientTsconfig`, `apiTsconfig`, see
  `packages/devtools/src/core/plugin-option-keys.ts` and the generated
  `core/go-generated/tsconfig-plugin-keys.generated.ts`) and as CLI flags. Decide whether those follow
  the rename or stay as they are, and say why.
- A renamed option leaves no trace: no alias, no "renamed" warning, no old-name test or doc line.

## Docs

Existing pages, existing sections:

- RPC → Devtools → Vite: "All Plugin Options" block, and the setup sections that name these options
  (Server-Only Builds, Fullstack Apps, One Config, Two Bundles, Bundled Client, Batch Transport).
- RPC → Devtools → Next.js and CLI pages.
- RPC → Middlewares → fetchMetadata and fetchMetadata client pages (`bundleApi: false`).
- RunTypes → Introduction → Configuration (the tsconfig plugin keys), if those keys change.
- Example configs under `packages/private-examples/src/codegen/` (vite-*.config.ts).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Each option's name or position says which project sets it, in both presets, with tests for the new shape.
- Every page and example above uses the new shape, and no old name remains anywhere.
- The PR carries the `pre-publish-e2e` label (public option rename) and `website`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
