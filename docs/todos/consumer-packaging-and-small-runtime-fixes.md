---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# Consumer-side packaging and small runtime fixes found porting the starters

## Intent

A set of small problems every consumer of the published packages hits. None blocks a port alone, but together they
make a fresh 0.13 app look broken (warnings, hangs, 25 MB production installs). Found while porting the
mion-starters to 0.13.2; investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/`
(README rows 18-24, repros `repros/thenable-routes.mjs`, `repros/pkgname-path`).

1. **The routes proxy is a thenable.** `await`ing `routes` (returning it from an async function) hangs forever:
   the proxy returns a callable for `then`. A Server Component hung 4.7 minutes with no error.
2. **`package.json` `name` used raw as a path.** It becomes a path segment of generated pure-function modules, so
   an absolute or odd name breaks the build (`UNRESOLVED_IMPORT …/pf//abs/path/…`).
3. **`@mionjs/platform-bun` runtime deps** on `@mionjs/devtools` + `@mionjs/bin-compiler` (25 MB native binary,
   TypeScript and Vite peers in production installs), used only by its preload loader; its `.d.ts` also needs bun
   types without declaring them.
4. **`@mionjs/run-types` sourcemaps** point at unshipped `../src/*.ts` (23 warnings on every dev or vitest start).
5. **Only `.mion/types/` is gitignored**; `.mion/api/` and `.mion/rpc/` would be committed.
6. **`typescript >=6` peer admits TS 7**, whose package no longer exports the JS API `@mionjs/devtools/vite`
   imports.
7. **Dev noise:** the full router options object is logged on every init (dev, build workers, production), and "resolver process died unexpectedly, respawned" prints before the real
   config error (and the final error loses it).

Rechecked on 2026-11-03 against `main` (`85f3488af`): every item is still open. The dev 503 body's ANSI codes moved
to the ESM-only packages todo.

## Direction

The implementer plans the fixes. Verified pointers:

- `packages/rpc-client/src/client.ts:123` (`MethodProxy.handler.get`): `then` (and symbols) should not resolve to a
  route.
- `ts-go-runtypes/internal/compiler/marker/marker.go:822-840` (`lookupPackageUpward`): validate or sanitize.
- `packages/platform-bun/package.json:63-69`, `packages/platform-bun/loader/runtypes-loader.ts`: optional peers or
  a separate subpath; dependency rules in `packages/AGENTS.md`.
- `packages/run-types/package.json` `files` and its `mion compile` build: inline `sourcesContent` or ship no maps.
- `ts-go-runtypes/internal/compiler/resolver/generate.go:172-185` (gitignore written for `types/` only).
- `packages/devtools/package.json` peer range, `packages/devtools/src/vite/buildEntries.ts`.
- `packages/rpc-router/src/router.ts` (`mion router initialized` log), the resolver
  client respawn path.

## Docs

None, because each fix removes a surprise rather than changing documented behaviour; check
`container/website/content/01.rpc/06.platforms/02.bun.md` if the Bun loader moves to its own subpath.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Each item is fixed with its own test where it has behaviour (thenable, package name, gitignore), and a fresh
  Vite app on the packed packages starts with no sourcemap warnings and installs `@mionjs/platform-bun` without the
  compiler.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
