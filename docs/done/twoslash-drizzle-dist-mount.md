---
type: fix
spec: guidelines
status: done
created: 2026-09-02
---

# Twoslash cannot resolve the drizzle packages: their dist sits under .dist/esm/src

## Intent

The rpc home page (`container/website/content/01.rpc/index.md`) renders five type-hover
cards through the `/api/twoslash` endpoint. The drizzle card
(`packages/examples/src/_homepage/home-drizzle.ts`, which imports
`@mionjs/drizzle-orm-pg-core`) renders an error instead of hovers, and the site build
logs:

```
ERROR  Twoslash rendering error:
Compiler Errors:
index.ts
  [2307] 71 - Cannot find module '@mionjs/drizzle-orm-pg-core' or its corresponding type declarations.
```

Found while building the unified docs site (branch `claude/unified-website-structure-pkch05`);
it predates that change: the mount list and the package layouts are untouched there, and
`pr-heavy.yml` already notes that the twoslash hover assertion fails on `main`.

## Direction

`container/website/server/api/twoslash.post.ts` mounts every first-party package's built
`.d.ts` into the twoslash virtual file system at `/node_modules/<npm name>/`, taking
`packages/<dir>/<distPath>` as the package root (`packageConfigs`, `distPath: '.dist/esm'`
for the `@mionjs/*` packages). That matches `core`, `router`, `client` and the platform
packages, whose `.dist/esm/index.d.ts` sits at the root. The four drizzle packages
(`drizzle-orm`, `drizzle-orm-pg-core`, `drizzle-orm-mysql-core`, `drizzle-orm-sqlite-core`)
emit under `.dist/esm/src/` instead; their `package.json` exports point at
`./.dist/esm/src/index.d.ts` (and `./.dist/esm/src/drizzle.d.ts` for the `./drizzle`
subpath). So the mount root holds only a `src/` dir, and the bare import resolves nothing.

Two ways to fix, the implementer picks after checking why the drizzle builds nest `src/`:

- make the drizzle packages emit like the others (`.dist/esm/index.d.ts`), keeping their
  `package.json` exports in step, or
- teach the mount to read the real entry: mount `.dist/esm/src` for those packages, or
  derive `distPath` from each package's `exports['.'].types` so the list cannot drift again.

Whichever lands, add the contract: `packages/devtools/test/repo-contracts.test.ts`
already pins the twoslash mount names; extend it so every mounted `distPath` actually
contains an `index.d.ts` (or resolves the package's `types` entry), and run
`pnpm rtx website check --docs` to see the hovers render.

## Done when

- The drizzle card on the mion home page renders type hovers; the build log shows no
  twoslash error.
- A repo contract fails if a mounted package's dist root has no `index.d.ts` again.
- `pnpm test`, `pnpm run lint`, `pnpm run format` green.

## What shipped (2026-09-02)

Why the drizzle dists nest `src/`: those packages keep their entry at `src/index.ts` with
`rootDir: "."` (core, router and the platforms have a root-level `index.ts`), so the
emitted tree mirrors the source tree. Their `package.json` exports already say so. Moving
the emit would change every published drizzle entry path on a version line that republishes
on any source change, for nothing the mount cannot read from the manifest. So the mount
reads it:

1. `container/website/server/api/twoslash.post.ts`: drop the hand-written `distPath` and
   derive each mount root from the package's own manifest, the directory holding its `.`
   `types` entry (`exports['.'].types`, the `import.types` form `@mionjs/run-types` uses, or
   a top-level `types`). The synthetic package.json names that entry. A package whose
   manifest declares no types entry is skipped with a warning instead of a silent
   no-hover page.
2. Same file: remove the second `@mionjs/devtools` row (`distPath: 'build'` plus its
   `entries` shims). `packages/devtools/build` has not existed since the two devtools
   packages merged; today the row is a no-op, but a populated `build/` would overwrite
   the real devtools mount's package.json and index.d.ts.
3. `packages/devtools/test/repo-contracts.test.ts`: the contract. For every mounted
   package the manifest's `.` types entry must be an `index.d.ts` (that is what classic
   node resolution finds at the mount root), every first-party subpath the examples import
   must sit where classic resolution looks under that root (`<sub>.d.ts` or
   `<sub>/index.d.ts`), and when the package is built on this host the file must exist.
4. `scripts/website/site.mjs` `verify-docs`: render every example the site's home page
   embeds (the five hover cards on the mion site) through `/api/twoslash`, not one
   arbitrary example, so the check proves the cards the reader sees.
5. Tests: the vitest contract above (`pnpm test`). Docs: none, the change is internal
   docs tooling with no user-facing surface. Fuzzing: not a candidate (a fix, no oracle).
6. Verified with `pnpm test`, `pnpm run lint`, `pnpm run format` and
   `pnpm rtx website check --docs --site mion`, which now renders all five home page
   cards (the drizzle card included) with hovers. The published `tsrt-website` image's
   deps stamp differs from the tree, so the check ran against the pulled image
   relabelled with the tree's stamp under `MION_WEBSITE_USE_LOCAL=1`; the endpoint
   code the check exercises is bind-mounted, not baked, so the image's age does not
   affect the result.

Out of scope, on purpose: the drizzle packages keep emitting under `.dist/esm/src`,
and `pr-heavy.yml` still leaves `website check --docs` out (it needs the `@mionjs/*`
dists built in CI, a separate decision).
