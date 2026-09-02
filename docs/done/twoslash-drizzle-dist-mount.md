---
type: fix
spec: guidelines
status: ready
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

- The drizzle card on `/rpc` renders type hovers; the build log shows no twoslash error.
- A repo contract fails if a mounted package's dist root has no `index.d.ts` again.
- `pnpm test`, `pnpm run lint`, `pnpm run format` green.
